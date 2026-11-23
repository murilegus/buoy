import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/services/source.js';
import {SharingWatch} from '../../kit/services/sharing.js';
import {JOB, REASONS, isOver, needsPassword, problemsOf, readSignal, shownJob} from './model.js';

const KIND = 'print';
const PANEL = 'gnome-printers-panel.desktop';

/**
 * Print jobs (FEATURES M4 "Print job progress"; design/compact "Lệnh in", 2026-11-23, Ethan), from
 * CUPS's own D-Bus signals (cups notifier/dbus.c: org.cups.cupsd.Notifier on the system bus), which
 * CUPS sends for gsd's subscription (gsd print-notifications renew_subscription: job-created,
 * job-completed, job-state-changed, printer-state-changed…). Signals only: no subscription of
 * Buoy's, no polling; without gsd's, nothing comes.
 *
 * - The jobs not over are one pill, the printing one (else the oldest waiting), "+N"; its page
 *   count is CUPS's job-impressions-completed, sent at each state change (no total exists).
 * - Over: a flash, "Printed …" with its pages, or "Cancelled …"; aborted or stopped: a card that
 *   stays till ×, Printers. A job held for a password is left to GNOME's notification (its button).
 * - The printer's problems (printer-state-reasons) only while a job of it is not over: the ones
 *   that stop it a card, then a pill till they clear; the low ones a flash, once till they clear.
 * - Signals do not say whose job it is: on a shared machine, others' jobs show too.
 */
export class PrintSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._jobs = new Map();         // job id → its last reading, not over
        this._ids = new Map();          // activity key → stack id
        this._problems = new Map();     // printer → {key, reason, hidden}
        this._lows = new Map();         // printer → the low reasons flashed
        this._failed = new Map();       // job id → its failed card's event
        this._sharing = new SharingWatch(() => this._redraw());
        this._sub = Gio.DBus.system.signal_subscribe(null, 'org.cups.cupsd.Notifier', null, '/org/cups/cupsd/Notifier', null,
            Gio.DBusSignalFlags.NONE, (_c, _sender, _path, _iface, name, params) => this._signal(name, params.deepUnpack()));
    }

    _signal(name, params) {
        if (!this._stack)
            return;
        const s = readSignal(name, params);
        if (s?.kind === 'job')
            this._job(s);
        else if (s?.kind === 'printer')
            this._printer(s.printer, s.reasons);
    }

    _job(s) {
        const known = this._jobs.get(s.id);
        const pages = Math.max(s.pages, known?.pages ?? 0);
        const name = s.name || known?.name || '';
        if (isOver(s.state)) {
            this._jobs.delete(s.id);
            this._dropFailed(s.id);
            if (s.state === JOB.COMPLETED)
                this._flash({what: 'printed', name, printer: s.printer, pages});
            else if (s.state === JOB.CANCELED)
                this._flash({what: 'cancelled', name, printer: s.printer});
            else
                this._fail(s.id, {name, printer: s.printer, stopped: false, reasons: s.printerReasons});
        } else {
            this._jobs.set(s.id, {...s, name, pages});
            if (s.state === JOB.STOPPED)
                this._fail(s.id, {name, printer: s.printer, stopped: true, reasons: s.printerReasons});
            else
                this._dropFailed(s.id);
        }
        this._showPrinting();
        // a job's signal carries its printer's reasons too
        this._printer(s.printer, s.printerReasons);
    }

    _printer(printer, reasons) {
        const waiting = [...this._jobs.values()].filter(j => j.printer === printer);
        const {stop, low} = problemsOf(waiting.length ? reasons : []);
        // the low ones: a flash each, once till it clears
        const seen = this._lows.get(printer) ?? new Set();
        for (const r of low) {
            if (!seen.has(r)) {
                seen.add(r);
                this._flash({what: 'low', printer, reason: REASONS[r].text});
            }
        }
        for (const r of [...seen]) {
            if (!low.includes(r))
                seen.delete(r);
        }
        this._lows.set(printer, seen);
        // the stopping ones: a card, then a pill till they clear or no job waits
        const key = stop.join(',');
        const prev = this._problems.get(printer);
        if (!key) {
            if (prev) {
                this._problems.delete(printer);
                this._end(`problem:${printer}`);
            }
            return;
        }
        if (prev?.key === key) {
            if (!prev.hidden)
                this._showProblem(printer, false);
            return;
        }
        this._problems.set(printer, {key, reason: REASONS[stop[0]].text, hidden: false});
        this._showProblem(printer, true);
    }

    _showProblem(printer, alert) {
        const p = this._problems.get(printer);
        if (!p || p.hidden)
            return;
        const waiting = shownJob(new Map([...this._jobs].filter(([, j]) => j.printer === printer)));
        this._put(`problem:${printer}`, this._build(`problem:${printer}`, {
            what: 'problem', printer, reason: p.reason, waiting: waiting?.name || null,
            dismiss: () => {
                p.hidden = true;
                this._end(`problem:${printer}`);
            },
        }), alert);
    }

    _fail(id, {name, printer, stopped, reasons}) {
        const {stop} = problemsOf(reasons);
        const ev = {what: 'failed', name, printer, stopped, reason: stop.length ? REASONS[stop[0]].text : ''};
        const fresh = !this._failed.has(id);
        this._failed.set(id, ev);
        this._put(`failed:${id}`, this._build(`failed:${id}`, {...ev, dismiss: () => this._dropFailed(id)}), fresh);
    }

    _dropFailed(id) {
        if (this._failed.delete(id))
            this._end(`failed:${id}`);
    }

    _showPrinting() {
        const j = shownJob(this._jobs);
        if (!j) {
            this._end('printing');
            return;
        }
        const others = [...this._jobs.values()].filter(x => x !== j && !isOver(x.state) && x.state !== JOB.STOPPED && !needsPassword(x));
        this._put('printing', this._build('printing', {
            what: 'printing', name: j.name, printer: j.printer, pages: j.pages,
            waiting: j.state !== JOB.PROCESSING, more: others.length,
        }), false);
    }

    // a flash: the last replaces the one before
    _flash(ev) {
        this._end('flash');
        this._put('flash', this._build('flash', ev), false);
    }

    _build(key, ev) {
        this._sharing.start();
        return this._registry?.build(KIND, key, {...ev, shared: this._sharing.shared, open: openPrinters});
    }

    _put(key, a, alert) {
        if (!a)
            return;
        const id = this._ids.get(key);
        if (id && this._stack.has(id) && this._stack.update(id, a, {alert}))
            return;
        this._ids.set(key, this._stack.surface({...a, alert}));
    }

    _end(key) {
        const id = this._ids.get(key);
        if (id && this._stack?.has(id))
            this._stack.end(id);
        this._ids.delete(key);
        // the shared screen is watched only while something here shows
        if (![...this._ids.values()].some(x => this._stack?.has(x)))
            this._sharing?.stop();
    }

    _redraw() {
        this._showPrinting();
        for (const printer of this._problems.keys())
            this._showProblem(printer, false);
    }

    disable() {
        if (this._sub)
            Gio.DBus.system.signal_unsubscribe(this._sub);
        this._sub = 0;
        for (const key of [...this._ids.keys()])
            this._end(key);
        this._jobs = null;
        this._sharing?.stop();
        this._sharing = null;
        super.disable();
    }
}

// Settings → Printers, as Shell opens a panel (Shell.AppSystem lookup_app)
function openPrinters() {
    const app = Shell.AppSystem.get_default().lookup_app(PANEL);
    if (!app)
        return;
    Main.overview.hide();
    app.activate();
}

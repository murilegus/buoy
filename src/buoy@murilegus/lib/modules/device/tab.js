import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {EmptyState, iconProps} from '../../kit/ui/present/elements.js';
import {label as textLabel} from '../../kit/ui/present/parts.js';
import {choicePage, choiceRow, listBox, listHead} from '../../kit/ui/present/lists.js';
import {CELL_GAP, CELL_H, TITLE_H, deviceGroups, displayPage, groupPage, isWired, planDevices, rowsFit} from '../../kit/model/devices.js';
import {outputOf} from '../../kit/model/audio.js';
import {batteryPage} from '../../kit/model/power.js';
import {batteryToggle, profilesOf, profilesToggle, setProfile} from '../../kit/services/power.js';
import {displayInfo, monitorManager, readMonitors, switchMode} from '../../kit/services/displays.js';
import {defaultSink, mixer, readSink} from '../../kit/services/audio.js';
import {FADES, LIST_SHIFT} from '../../kit/model/motion.js';
import {slideIn} from '../../kit/ui/spring.js';

const BUTTON = 32;      // the round ‹ of a page (compact metrics' button at the em)

/**
 * The Device tab (design/device, 2026-11-16, Ethan; FEATURES M4 "Device tab"): a column per
 * group — This Computer, Wireless, Plugged In — of cells; past what a column holds, "+N". A click
 * opens a page in place of the columns (‹ or Esc back): the battery's and the power mode's is
 * Home's battery page (the power modes, kit/model/power.js batteryPage); a display's, its ways to
 * be used; "+N", the whole group. Wired headphones open Settings → Sound.
 *
 * What it shows is read through kit/services — GNOME's battery and power-mode toggles, Mutter's
 * monitors, Shell's mixer — and only while the tab lives (Home's open): every change redraws it.
 * Wireless comes with its items (Bluetooth device, Phone via GSConnect).
 */
export class DeviceTab {
    /**
     * @param {object} [opts]
     * @param {function():void} [opts.close]  close the island
     * @param {number} [opts.height]  the body's room under the strip
     */
    constructor({close = null, height = 212} = {}) {
        this._close = close;
        this._rows = rowsFit(height);
        this._page = null;          // null | {kind: 'battery'} | {kind: 'display', key} | {kind: 'group', id}
        this.actor = new St.BoxLayout({
            style_class: 'buoy-device', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        this._watch();
        this._render();
    }

    // --- what there is -------------------------------------------------------------------------

    _watch() {
        const redraw = () => this._render();
        this._battery = batteryToggle()?._proxy ?? null;
        this._battery?.connectObject('g-properties-changed', redraw, this);
        this._modes = profilesToggle();
        this._modes?.connectObject('notify::visible', redraw, this);
        this._modes?._proxy?.connectObject('g-properties-changed', redraw, this);
        this._mm = monitorManager();
        this._mm.connectObject('monitors-changed', redraw, this);
        this._mixer = mixer();
        this._mixer.connectObject('state-changed', () => this._watchSink(), 'default-sink-changed', () => this._watchSink(), this);
        this._sink = null;
        this._watchSink(false);
    }

    _watchSink(redraw = true) {
        const sink = defaultSink(this._mixer);
        if (sink !== this._sink) {
            this._sink?.disconnectObject(this);
            this._sink = sink;
            const again = () => this._render();
            sink?.connectObject('notify::port', again, 'notify::volume', again, 'notify::is-muted', again, this);
        }
        if (redraw)
            this._render();
    }

    _cached(name) {
        try {
            return this._battery?.get_cached_property(name)?.deepUnpack() ?? null;
        } catch {
            return null;
        }
    }

    _facts() {
        const p = this._battery;
        const battery = p ? {
            present: p.IsPresent, percentage: p.Percentage, state: p.State, type: p.Type,
            timeToFull: p.TimeToFull, timeToEmpty: p.TimeToEmpty, rate: this._cached('EnergyRate'),
        } : null;
        const all = readMonitors(this._mm);
        const displays = all.filter(m => !m.builtin).map(m => ({key: m.key, name: m.name, ...displayInfo(this._mm, m, all)}));
        const s = readSink(this._mixer, this._sink);
        const audio = s ? {...outputOf(s), wired: isWired(s.name), level: s.level, muted: s.muted} : null;
        return {battery, modes: profilesOf(this._modes), displays, audio};
    }

    // --- drawing ----------------------------------------------------------------------------------

    // `slide`: a page pushed in from the right (+) or the columns back from the left (−), as Home's
    // pages (kit/ui/home.js _showPage, back); a redraw for new figures does not move
    _render(slide = 0) {
        if (!this.actor)
            return;
        const facts = this._facts();
        const columns = planDevices(deviceGroups(facts), this._rows);
        const page = this._page ? this._pageActor(this._page, facts, columns) : null;
        if (!page)
            this._page = null;      // its thing went (unplugged, the daemon left): the columns again
        this.actor.destroy_all_children();
        let body;
        if (page)
            body = page;
        else if (columns.length)
            body = this._columns(columns);
        else
            body = new EmptyState('No devices', {pose: 'idle'});
        this.actor.add_child(body);
        if (slide)
            slideIn(body, slide, 'move', FADES.in.ms);
    }

    _columns(columns) {
        const row = new St.BoxLayout({style_class: 'buoy-device-columns', x_expand: true});
        for (const col of columns) {
            const box = new St.BoxLayout({style_class: 'buoy-device-column', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            const title = new St.BoxLayout({style_class: 'buoy-device-title', height: TITLE_H});
            title.add_child(textLabel(col.title.toUpperCase(), 'buoy-device-title-text'));
            title.add_child(textLabel(String(col.count), 'buoy-device-title-count'));
            box.add_child(title);
            const cells = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            cells.set_style(`spacing: ${CELL_GAP}px;`);
            for (const c of col.cells)
                cells.add_child(this._cell(c.icon, c.value, c.name, () => this._press(c)));
            if (col.more)
                cells.add_child(this._cell(null, `+${col.more.count}`, col.more.names, () => this._open({kind: 'group', id: col.id})));
            box.add_child(cells);
            row.add_child(box);
        }
        return row;
    }

    // a cell 58: icon 16 and the value on its top line, the name under it (design/device); "+N"
    // has no icon: its count stands where the icon would
    _cell(icon, value, name, onClick) {
        const top = new St.BoxLayout({style_class: 'buoy-device-cell-top', x_expand: true});
        if (icon)
            top.add_child(new St.Icon({...iconProps(icon), icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
        else if (value)
            top.add_child(textLabel(value, 'buoy-device-value'));
        top.add_child(new St.Widget({x_expand: true}));
        if (icon && value)
            top.add_child(textLabel(value, 'buoy-device-value'));
        const body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        body.add_child(top);
        body.add_child(textLabel(name, 'buoy-device-name', true));
        const b = new St.Button({
            style_class: 'buoy-device-cell', child: body, x_expand: true, can_focus: true, height: CELL_H,
            accessible_name: value ? `${name}, ${value}` : name, x_align: Clutter.ActorAlign.FILL,
        });
        b.connect('clicked', onClick);
        return b;
    }

    // --- a click ---------------------------------------------------------------------------------

    _press(c) {
        if (c.page === 'battery' || c.page === 'display') {
            const page = c.page === 'battery' ? {kind: 'battery'} : {kind: 'display', key: c.id.slice('display:'.length)};
            if (this._pageActor(page, this._facts(), []))
                this._open(page);
            else
                this._launch(c.open);
            return;
        }
        this._launch(c.open);
    }

    _open(page) {
        this._page = page;
        this._render(LIST_SHIFT);
    }

    /** ‹ or Esc (kit/ui/home.js back): the columns again; false when they show already. */
    back() {
        if (!this._page)
            return false;
        this._page = null;
        this._render(-LIST_SHIFT);
        return true;
    }

    _pageActor(page, facts, columns) {
        const back = () => this.back();
        if (page.kind === 'battery') {
            const p = facts.battery?.present ? batteryPage(facts.battery, facts.modes) : null;
            if (!p)
                return null;
            return choicePage(p, {
                back, button: BUTTON, choose: id => setProfile(id, {silent: true}),
                settings: () => this._launch('gnome-power-panel.desktop'),
            });
        }
        if (page.kind === 'display') {
            const d = facts.displays.find(x => x.key === page.key);
            const p = d ? displayPage(d) : null;
            if (!p)
                return null;
            return choicePage(p, {
                back, button: BUTTON, choose: id => switchMode(this._mm, id),
                settings: () => this._launch('gnome-display-panel.desktop'),
            });
        }
        const col = columns.find(c => c.id === page.id);
        if (!col)
            return null;
        const g = groupPage(col);
        const box = listBox(listHead(g.title, {back, button: BUTTON}));
        const rows = new St.BoxLayout({style_class: 'buoy-home-choices', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        for (const c of g.rows)
            rows.add_child(choiceRow({icon: c.icon, name: c.name, detail: c.detail ?? null, value: c.value, plain: true}, () => this._press(c)));
        box.add_child(rows);
        return box;
    }

    // a Settings panel (Shell.AppSystem lookup_app, as Quick Settings opens them); the island goes
    _launch(desktopId) {
        const app = desktopId ? Shell.AppSystem.get_default().lookup_app(desktopId) : null;
        if (!app)
            return;
        Main.overview.hide();
        app.activate();
        this._close?.();
    }

    destroy() {
        this._battery?.disconnectObject(this);
        this._modes?.disconnectObject(this);
        this._modes?._proxy?.disconnectObject(this);
        this._mm?.disconnectObject(this);
        this._mixer?.disconnectObject(this);
        this._sink?.disconnectObject(this);
        this._battery = this._modes = this._mm = this._mixer = this._sink = null;
        this.actor?.destroy();
        this.actor = null;
    }
}

// Run: gjs -m tests/stack.test.js   (no Shell; fake clock + fake island)
import {ActivityStack} from '../src/buoy@murilegus/lib/kit/stack.js';
import {PRIORITY} from '../src/buoy@murilegus/lib/kit/activity.js';

const HOUR = 60 * 60 * 1000;

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

function throws(fn, msg) {
    try {
        fn();
    } catch {
        return;
    }
    throw new Error(`${msg}: did not throw`);
}

// Deterministic timers. cancel() of an unknown or fired handle throws: GLib warns on
// source_remove of a dead source, so the stack must never do it.
class FakeClock {
    constructor() {
        this.t = 1_000_000;
        this.timers = new Map();
        this.seq = 0;
    }

    now() {
        return this.t;
    }

    timeout(ms, fn) {
        if (!(ms >= 0) || ms > 2 ** 31 - 1) // GLib timeouts take a 32-bit ms interval
            throw new Error(`timeout with bad delay ${ms}`);
        const id = ++this.seq;
        this.timers.set(id, {at: this.t + ms, fn});
        return id;
    }

    cancel(id) {
        if (!this.timers.delete(id))
            throw new Error(`cancel of unknown timer ${id}`);
    }

    advance(ms) {
        const end = this.t + ms;
        for (;;) {
            let next = null;
            for (const [id, tm] of this.timers) {
                if (tm.at <= end && (!next || tm.at < next[1].at))
                    next = [id, tm];
            }
            if (!next)
                break;
            this.timers.delete(next[0]);
            this.t = next[1].at;
            next[1].fn();
        }
        this.t = end;
    }

    get pending() {
        return this.timers.size;
    }
}

class FakeIsland {
    constructor() {
        this.log = [];
        this.top = null;
        this.light = 'off';
        this.alerts = [];
    }

    show(a, info) {
        this.log.push(`show ${a.id}${info?.alert ? ' alert' : ''}${info?.expand ? ' expand' : ''}`);
        this.top = a;
        this.info = info;
    }

    clear() {
        this.log.push('clear');
        this.top = null;
    }

    setLight(l) {
        this.log.push(`light ${l}`);
        this.light = l;
    }

    alert(a) {
        this.alerts.push(a.id);
    }
}

function setup(opts = {}) {
    const clock = new FakeClock();
    const island = new FakeIsland();
    const stack = new ActivityStack(island, {clock, ...opts});
    return {clock, island, stack};
}

const media = (id = 'media:spotify', extra = {}) => ({id, kind: 'media', app: 'spotify', text: 'Song', ...extra});

// --- empty / construction ----------------------------------------------------
{
    const {island, stack} = setup();
    eq(island.log, [], 'constructor does not touch the island');
    eq([stack.top, stack.light, stack.missed], [null, 'off', []], 'empty stack');
}

// --- validation --------------------------------------------------------------
{
    const {island, stack} = setup();
    throws(() => stack.surface({kind: 'media'}), 'surface without id');
    throws(() => stack.surface({id: 'x'}), 'surface without kind');
    eq(island.log, [], 'rejected activity never reaches the island');
    eq(stack.surface(media()), 'media:spotify', 'surface returns the id');
    eq(stack.top.priority, PRIORITY.media, 'priority defaults from the contract');
    eq(stack.top.isStale, false, 'fresh activity is not stale');
}

// --- priority, ties, end returns the previous one ----------------------------
{
    const {island, stack} = setup();
    stack.surface(media());
    stack.surface({id: 'osd', kind: 'osd'});
    eq(island.top.id, 'osd', 'higher priority (osd) wins over media');
    stack.surface({id: 'low', kind: 'osd', priority: 1});
    eq(island.top.id, 'osd', 'explicit low priority does not win');
    eq(stack.end('osd'), true, 'end returns true for a live activity');
    eq(island.top.id, 'media:spotify', 'media returns after osd ends');
    eq(stack.end('osd'), false, 'second end is a no-op');
    eq(stack.end('nope'), false, 'end of unknown id is a no-op');
    stack.end('low');
    stack.end('media:spotify');
    eq(island.top, null, 'last end clears the island');
    eq(island.log.at(-1), 'clear', 'clear() called once at the end');
}
{
    const {island, stack} = setup();
    stack.surface(media('a'));
    stack.surface(media('b'));
    eq(island.top.id, 'b', 'tie → most recently surfaced');
    stack.update('a', {text: 'x'});
    eq(island.top.id, 'b', 'update does not make an activity more recent');
    stack.surface(media('a'));
    eq(island.top.id, 'a', 're-surfacing makes it most recent');
    stack.end('a');
    eq(island.top.id, 'b', 'previous tie returns');
}

// --- update -----------------------------------------------------------------
{
    const {island, stack} = setup();
    stack.surface(media('m', {state: {status: 'Playing', position: 3}, attributes: {title: 'T'}}));
    island.log = [];
    eq(stack.update('m', {state: {status: 'Paused'}}), true, 'update returns true');
    eq(stack.top.state, {status: 'Paused'}, 'state is replaced whole, not merged');
    eq(stack.top.attributes, {title: 'T'}, 'attributes survive an update');
    eq(island.log, ['show m'], 'update of the shown activity re-renders it');
    eq(stack.update('nope', {text: 'x'}), false, 'update of unknown id is a no-op');
    throws(() => stack.update('m', {id: 'other'}), 'update cannot change id');
    throws(() => stack.update('m', {kind: 'osd'}), 'update cannot change kind');
    eq(stack.update('m', {kind: 'media', id: 'm'}), true, 'same id/kind in a patch is fine');

    stack.surface({id: 'osd', kind: 'osd'});
    island.log = [];
    stack.update('m', {text: 'hidden change'});
    eq(island.log, [], 'update of a covered activity does not re-render');
    stack.update('m', {ttl: 99 * HOUR});
    eq(stack.update('m', {}), true, 'empty patch');
}

// --- alert ------------------------------------------------------------------
{
    const {island, stack} = setup();
    stack.surface(media('m'));
    stack.update('m', {text: 'next'}, {alert: true});
    eq(island.log.at(-1), 'show m alert', 'update with {alert} re-renders with alert');
    stack.update('m', {text: 'again'});
    eq(island.log.at(-1), 'show m', 'alert is one-shot');
    stack.surface({id: 'n', kind: 'notification', alert: true});
    eq(island.log.at(-1), 'show n alert', 'surface with alert: true');
    stack.update('m', {text: 'under'}, {alert: true});
    eq(island.alerts, ['m'], 'alert on a covered activity goes to island.alert()');
    eq(island.top.id, 'n', 'covered alert does not change the top');
}

// --- ttl --------------------------------------------------------------------
{
    const {clock, island, stack} = setup();
    stack.surface(media());
    stack.surface({id: 'osd', kind: 'osd', ttl: 1500});
    clock.advance(1499);
    eq(island.top.id, 'osd', 'ttl not yet expired at 1499 ms');
    clock.advance(1);
    eq(island.top.id, 'media:spotify', 'ttl expired at 1500 ms, media returns');
    eq(clock.pending, 0, 'no timer left after ttl expiry');

    stack.surface({id: 'long', kind: 'timer', ttl: 99 * HOUR});
    clock.advance(8 * HOUR - 1);
    eq(stack.top.id, 'long', 'capped ttl still alive just before 8 h');
    clock.advance(1);
    eq(stack.top.id, 'media:spotify', 'ttl capped at 8 h');

    clock.advance(24 * HOUR);
    eq(stack.top.id, 'media:spotify', 'ttl 0 = until the source ends it');
    eq(clock.pending, 0, 'ttl 0 arms no timer');
}
{
    const {clock, stack} = setup();
    stack.surface({id: 'o', kind: 'osd', ttl: 1000});
    clock.advance(800);
    stack.surface({id: 'o', kind: 'osd', ttl: 1000});
    clock.advance(800);
    eq(stack.top?.id, 'o', 're-surface restarts the ttl');
    eq(clock.pending, 1, 're-surface cancels the old ttl timer');
    stack.update('o', {text: 'x'});
    clock.advance(200);
    eq(stack.top, null, 'update without ttl does not extend it');
    stack.surface({id: 'p', kind: 'progress', ttl: 1000});
    stack.update('p', {ttl: 5000});
    clock.advance(4999);
    eq(stack.top?.id, 'p', 'update with ttl re-arms from now');
    clock.advance(1);
    eq([stack.top, clock.pending], [null, 0], 'new ttl expires, no timer left');
}

// --- stale ------------------------------------------------------------------
{
    const {clock, island, stack} = setup();
    stack.surface({id: 'p', kind: 'progress', staleAfter: 1000});
    clock.advance(999);
    eq(stack.top.isStale, false, 'not stale before staleAfter');
    island.log = [];
    clock.advance(1);
    eq([stack.top.isStale, island.log], [true, ['show p']], 'stale after staleAfter, re-rendered');
    stack.update('p', {state: {fraction: 0.5}});
    eq(stack.top.isStale, false, 'update clears stale');
    clock.advance(999);
    eq(stack.top.isStale, false, 'update restarted the stale timer');
    clock.advance(1);
    eq(stack.top.isStale, true, 'stale again without updates');
    stack.end('p');
    eq(clock.pending, 0, 'end cancels the stale timer');
}

// --- transient --------------------------------------------------------------
{
    const {island, stack} = setup();
    const seen = [];
    stack.surface(media());
    stack.surface({id: 't', kind: 'media', style: 'transient', onExpand: on => seen.push(on)});
    eq(island.log.at(-1), 'show t expand', 'transient asks the island to open expanded');
    island.top.onExpand(true);
    eq(stack.top.id, 't', 'expanding a transient keeps it');
    island.top.onExpand(false);
    eq([stack.top.id, seen], ['media:spotify', [true, false]], 'collapse ends a transient; own onExpand still runs');

    stack.surface({id: 's', kind: 'media', onExpand: on => seen.push(`s${on}`)});
    island.top.onExpand(false);
    eq(stack.top.id, 's', 'collapse does not end a standard activity');

    stack.surface({id: 'u', kind: 'media', style: 'transient'});
    stack.update('u', {text: 'x', onExpand: on => seen.push(`u${on}`)});
    stack.top.onExpand(false);
    eq([stack.top.id, seen.at(-1)], ['s', 'ufalse'], 'transient wrap survives an onExpand patch');
}

// --- apps-hidden ------------------------------------------------------------
{
    const {island, stack} = setup({hiddenApps: ['spotify']});
    stack.surface(media());
    eq([island.top, island.log], [null, []], 'hidden app never reaches the island');
    stack.surface({id: 'f', kind: 'media', app: 'firefox'});
    eq(island.top.id, 'f', 'other apps unaffected');
    stack.update('media:spotify', {text: 'x'}, {alert: true});
    eq(island.alerts, [], 'hidden app cannot alert');
    stack.setHiddenApps([]);
    eq(island.top.id, 'f', 'unhiding keeps priority/recency rules (firefox surfaced later)');
    stack.end('f');
    eq(island.top.id, 'media:spotify', 'the unhidden live activity shows once it is on top');
}
{
    const {island, stack} = setup();
    stack.surface(media());
    stack.setHiddenApps(['spotify']);
    eq(island.top, null, 'hiding the shown app clears the island');
}

// --- schedule ---------------------------------------------------------------
{
    const {clock, island, stack} = setup();
    eq(stack.schedule({id: 'match', kind: 'calendar'}, clock.now() + 5000), 'match', 'schedule returns id');
    eq(island.top, null, 'nothing before start');
    clock.advance(5000);
    eq(island.log.at(-1), 'show match alert', 'scheduled activity surfaces with an alert at start');
    eq(clock.pending, 0, 'no timer left after start');

    stack.schedule({id: 'later', kind: 'calendar'}, clock.now() + 9000);
    eq(stack.end('later'), true, 'end cancels a scheduled activity');
    eq(clock.pending, 0, 'cancelled schedule leaves no timer');
    clock.advance(10000);
    eq(island.top.id, 'match', 'cancelled schedule never surfaces');

    stack.schedule({id: 'past', kind: 'timer', priority: 99}, clock.now() - 1);
    eq(island.top.id, 'past', 'start in the past surfaces now');
    throws(() => stack.schedule({kind: 'timer'}, clock.now() + 1), 'schedule validates up front');
    eq(clock.pending, 0, 'invalid schedule arms nothing');

    stack.schedule({id: 'far', kind: 'calendar', priority: 100}, clock.now() + 40 * 24 * HOUR);
    clock.advance(40 * 24 * HOUR - 1);
    eq(stack.top.id, 'past', 'far schedule (beyond a 32-bit ms timer) not early');
    clock.advance(1);
    eq(stack.top.id, 'far', 'far schedule fires on time');
}

// --- ask --------------------------------------------------------------------
{
    const {island, stack} = setup();
    throws(() => stack.ask('q', 'Run?', []), 'ask needs options');
    const p = stack.ask('q', 'Run tests?', ['Deny', 'Allow'], {app: 'claude'});
    eq(island.log.at(-1), 'show q alert', 'ask surfaces with an alert');
    eq([stack.top.kind, stack.top.text, stack.top.actions.map(a => a.id)], ['ask', 'Run tests?', ['Deny', 'Allow']],
        'ask activity carries question and options');
    eq(stack.top.expanded, true, 'ask has an expanded presentation (all options as buttons)');
    eq(stack.light, 'off', 'a visible ask is not "waiting"');
    eq(stack.answer('q', 'Maybe'), false, 'answer outside the options is refused');
    island.top.onAction('Maybe');
    eq(stack.top?.id, 'q', 'a button with an unknown id does not settle the ask');
    eq(stack.answer('q', 'Allow'), true, 'answer accepted');
    eq(await p, 'Allow', 'ask resolves with the answer');
    eq([stack.top, stack.answer('q', 'Allow')], [null, false], 'answered ask ends; second answer refused');
}
{
    const {clock, stack} = setup();
    const p = stack.ask('q', 'Allow?', ['Deny', 'Allow'], {timeoutMs: 10000, fallback: 'Deny'});
    clock.advance(10000);
    eq([await p, stack.top, clock.pending], ['Deny', null, 0], 'timeout resolves the fallback and ends');

    const r = stack.ask('r', 'Allow?', ['Deny', 'Allow'], {timeoutMs: 10000});
    stack.end('r');
    eq([await r, clock.pending], [null, 0], 'caller end resolves null and cancels the timeout');

    const b = stack.ask('b', 'Allow?', ['Deny', 'Allow']);
    stack.top.onAction('Allow');
    eq([await b, stack.top?.id ?? null], ['Allow', null], 'pressing an action button answers the ask');

    const s1 = stack.ask('s', 'one?', ['a']);
    const s2 = stack.ask('s', 'two?', ['b']);
    eq(await s1, null, 're-asking the same id settles the old ask with null');
    stack.answer('s', 'b');
    eq(await s2, 'b', 'new ask answered');
}
{
    const {island, stack} = setup();
    const p = stack.ask('q', 'Allow?', ['Deny', 'Allow']);
    stack.surface({id: 'call', kind: 'call'});
    eq([island.top.id, stack.light], ['call', 'waiting'], 'ask covered by a call → red light');
    stack.end('call');
    eq(stack.light, 'off', 'ask visible again → light off');
    eq(stack.dismiss('q'), true, 'dismiss an ask');
    eq([island.top, stack.light], [null, 'waiting'], 'dismissed ask leaves the pill, light red');
    stack.answer('q', 'Deny');
    eq([await p, stack.light], ['Deny', 'off'], 'dismissed ask can still be answered; light clears');
    stack.surface(media());
    eq([stack.dismiss('media:spotify'), stack.top], [true, null], 'dismiss of a non-ask ends it');
    eq(stack.dismiss('nope'), false, 'dismiss unknown');
}

// --- unseen, missed history, light precedence -------------------------------
{
    const {island, stack} = setup();
    stack.surface({id: 'seen', kind: 'progress'});
    stack.end('seen');
    eq(stack.missed, [], 'ending while seen is not missed');

    stack.setUnseen(true);
    stack.surface({id: 'copy', kind: 'progress', app: 'nautilus', text: 'Copying 3 files'});
    stack.surface({id: 'vol', kind: 'osd'});
    stack.surface({id: 'clip', kind: 'copied'});
    stack.end('vol');
    stack.end('clip');
    eq(stack.missed, [], 'osd/copied ending while unseen are not missed');
    stack.end('copy');
    eq(stack.missed.map(m => [m.id, m.kind, m.app, m.text]), [['copy', 'progress', 'nautilus', 'Copying 3 files']],
        'ended while unseen → missed entry');
    eq([stack.light, island.light], ['missed', 'missed'], 'amber light, island told');

    for (let i = 0; i < 7; i++) {
        stack.surface({id: `n${i}`, kind: 'notification'});
        stack.end(`n${i}`);
    }
    eq(stack.missed.map(m => m.id), ['n6', 'n5', 'n4', 'n3', 'n2'], 'last 5, newest first');
    stack.missed.pop();
    eq(stack.missed.length, 5, 'missed getter returns a copy');

    stack.setUnseen(false);
    eq(stack.light, 'missed', 'coming back keeps the light until peeked');
    const p = stack.ask('q', '?', ['ok']);
    stack.setUnseen(true);
    eq(stack.light, 'waiting', 'red › amber');
    stack.answer('q', 'ok');
    await p;
    eq(stack.light, 'missed', 'answered → back to amber');
    stack.clearMissed();
    eq([stack.light, stack.missed], ['off', []], 'clearMissed → off');
    const lights = island.log.filter(l => l.startsWith('light'));
    eq(lights, ['light missed', 'light waiting', 'light missed', 'light off'], 'setLight only on change');
}
{
    const {clock, stack} = setup({hiddenApps: ['spotify']});
    stack.setUnseen(true);
    stack.surface({id: 'ttl', kind: 'notification', ttl: 100});
    stack.surface(media());
    clock.advance(100);
    stack.end('media:spotify');
    eq(stack.missed.map(m => m.id), ['ttl'], 'ttl expiry while unseen is missed; hidden apps are not');
}

// --- long timers stay within GLib's 32-bit interval ----------------------------
{
    const {clock, stack} = setup();
    stack.surface({id: 'p', kind: 'progress', staleAfter: 60 * 24 * HOUR});
    const q = stack.ask('q', '?', ['ok'], {timeoutMs: 60 * 24 * HOUR, fallback: 'ok'});
    eq(clock.pending, 2, 'huge staleAfter/timeout are armed (clamped), not rejected');
    stack.end('p');
    stack.answer('q', 'ok');
    eq([await q, clock.pending], ['ok', 0], 'and cancelled cleanly');
}

// --- destroy ----------------------------------------------------------------
{
    const {clock, island, stack} = setup();
    stack.surface({id: 'o', kind: 'osd', ttl: 1000, staleAfter: 500});
    stack.schedule({id: 's', kind: 'calendar'}, clock.now() + 1000);
    const p = stack.ask('q', '?', ['ok'], {timeoutMs: 1000});
    island.log = [];
    stack.destroy();
    eq(clock.pending, 0, 'destroy cancels every timer');
    eq(await p, null, 'destroy settles pending asks with null');
    eq(island.log, [], 'destroy does not touch the island');
    clock.advance(5000);
    eq(island.log, [], 'nothing fires after destroy');
}

console.log('stack: ok');

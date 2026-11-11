import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {slugOf} from './registry.js';

/**
 * org.gnome.Shell.Extensions.Buoy at /org/gnome/Shell/Extensions/Buoy on the Shell's
 * session connection (dest `org.gnome.Shell`): apps and scripts send their own pill
 * (CONTRACT.md §3: the "app adopts ActivityKit" path) and skip the adapters. The app is
 * slugged and the user's profile applied (Registry.present). Reference: docs/DBUS.md.
 *
 *   Surface(a{sv} activity) → s id            '' when a profile skips it
 *   Update(s id, a{sv} patch, b alert) → b    false: no such activity
 *   End(s id) → b
 *   Schedule(a{sv} activity, x startAt) → s id   startAt: ms since the epoch
 *   Ask(s id, s question, as options, a{sv} opts) → s choice   '' when ended
 *   Agent(s source, s event) → s reply        a coding agent's hook event, as its JSON
 *                                             text; the reply is what the hook prints
 *                                             ('' but for a permission prompt)
 *   signal Action(s id, s action)             a button of the activity was pressed
 *   property Version u
 *
 * Ids are the caller's: Buoy keeps them as `dbus:<id>` so they never meet a module's.
 */

export const PATH = '/org/gnome/Shell/Extensions/Buoy';
export const VERSION = 3;
const PREFIX = 'dbus:';
const MAX_LIVE = 32;          // activities from D-Bus at once
const MAX_BYTES = 16 * 1024;  // one activity, as JSON
const MAX_EVENT = 256 * 1024; // one hook event (a large Write's content rides along)

const IFACE = `<node>
  <interface name="org.gnome.Shell.Extensions.Buoy">
    <method name="Surface">
      <arg type="a{sv}" name="activity" direction="in"/>
      <arg type="s" name="id" direction="out"/>
    </method>
    <method name="Update">
      <arg type="s" name="id" direction="in"/>
      <arg type="a{sv}" name="patch" direction="in"/>
      <arg type="b" name="alert" direction="in"/>
      <arg type="b" name="found" direction="out"/>
    </method>
    <method name="End">
      <arg type="s" name="id" direction="in"/>
      <arg type="b" name="found" direction="out"/>
    </method>
    <method name="Schedule">
      <arg type="a{sv}" name="activity" direction="in"/>
      <arg type="x" name="startAt" direction="in"/>
      <arg type="s" name="id" direction="out"/>
    </method>
    <method name="Ask">
      <arg type="s" name="id" direction="in"/>
      <arg type="s" name="question" direction="in"/>
      <arg type="as" name="options" direction="in"/>
      <arg type="a{sv}" name="opts" direction="in"/>
      <arg type="s" name="choice" direction="out"/>
    </method>
    <method name="Agent">
      <arg type="s" name="source" direction="in"/>
      <arg type="s" name="event" direction="in"/>
      <arg type="s" name="reply" direction="out"/>
    </method>
        <signal name="Action">
      <arg type="s" name="id"/>
      <arg type="s" name="action"/>
    </signal>
    <property name="Version" type="u" access="read"/>
  </interface>
</node>`;

const invalid = msg => new GLib.Error(Gio.DBusError, Gio.DBusError.INVALID_ARGS, msg);
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// a{sv} arrives with its values still wrapped; unwrap all the way down.
function unpack(dict) {
    const out = {};
    for (const [k, v] of Object.entries(dict ?? {}))
        out[k] = v instanceof GLib.Variant ? v.recursiveUnpack() : v;
    return out;
}

// What a caller may send (CONTRACT.md §1 minus the callbacks, which D-Bus cannot carry).
const CHECKS = {
    id: v => typeof v === 'string' && /^[\w.:-]{1,64}$/.test(v) || 'letters, digits, . : _ -, up to 64',
    kind: v => typeof v === 'string' && /^[a-z][\w-]{0,31}$/.test(v) || 'a kind name like "progress"',
    app: v => typeof v === 'string' || 'a string',
    text: v => typeof v === 'string' || 'a string',
    leading: v => typeof v === 'string' || isPlain(v) || 'an icon name or an element',
    trailing: v => typeof v === 'string' || isPlain(v) || 'an icon name or an element',
    expanded: v => typeof v === 'boolean' || isPlain(v) || 'true or regions',
    compact: v => isPlain(v) || 'an object',
    attributes: v => isPlain(v) || 'an object',
    state: v => isPlain(v) || 'an object',
    actions: v => Array.isArray(v) && v.every(a => isPlain(a) && typeof a.id === 'string') || 'a list of {id, label?, icon?}',
    priority: v => isNum(v) && v >= 0 && v <= 100 || 'a number from 0 to 100',
    ttl: v => isNum(v) && v >= 0 || 'milliseconds, 0 or more',
    staleAfter: v => isNum(v) && v >= 0 || 'milliseconds, 0 or more',
    style: v => ['standard', 'transient'].includes(v) || '"standard" or "transient"',
    // the pill order's tiers (docs/PRIORITY.md, Version 3)
    needsYou: v => typeof v === 'boolean' || 'true or false',
    linger: v => typeof v === 'boolean' || 'true or false',
    alert: v => typeof v === 'boolean' || 'true or false',
    keyline: v => typeof v === 'string' || 'a colour like "#5e5ce6"',
    sizeHint: v => ['normal', 'wide'].includes(v) || '"normal" or "wide"',
};

/**
 * @param {object} data  an unpacked a{sv}
 * @param {object} [opts]
 * @param {boolean} [opts.patch]  Update: no kind needed, id and kind may not change
 * @returns {object} the same data, checked
 * @throws {GLib.Error} INVALID_ARGS naming the key
 */
export function check(data, {patch = false} = {}) {
    for (const [k, v] of Object.entries(data)) {
        const ok = CHECKS[k];
        if (!ok)
            throw invalid(`unknown key "${k}"`);
        const res = ok(v);
        if (res !== true)
            throw invalid(`${k}: ${res}`);
    }
    if (patch && ('id' in data || 'kind' in data))
        throw invalid('an update cannot change id or kind');
    if (!patch && !data.kind)
        throw invalid('kind is required');
    if (data.kind === 'ask')
        throw invalid('kind "ask" is Ask()\'s');
    if (JSON.stringify(data).length > MAX_BYTES)
        throw invalid(`an activity is at most ${MAX_BYTES} bytes`);
    return data;
}

export class BuoyDBus {
    /**
     * @param {object} stack  ActivityStack
     * @param {object} [opts]
     * @param {object} [opts.registry]  Registry: slugs and user profiles (present())
     * @param {Gio.DBusConnection} [opts.connection]  the Shell's session bus
     */
    constructor(stack, {registry = null, connection = Gio.DBus.session} = {}) {
        this._stack = stack;
        this._registry = registry;
        this._connection = connection;
        this._impl = null;
        this._live = new Set();   // internal ids surfaced from D-Bus
        this._seq = 0;
        this._agent = null;
    }

    /**
     * Who answers `Agent` (the agent module's source while it runs; CODING-AGENTS.md §1).
     * Without one, every call returns '' at once: the hook goes on as without Buoy.
     *
     * @param {?function(string, string, {sender: string}): (string|Promise<string>)} fn
     *   source, event JSON, the caller's unique bus name → the reply
     */
    setAgent(fn) {
        this._agent = fn;
    }

    export() {
        this._impl = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._impl.export(this._connection, PATH);
    }

    unexport() {
        this._agent = null;
        this._impl?.unexport();
        this._impl = null;
        this._live.clear();
    }

    get Version() {
        return VERSION;
    }

    // --- methods (D-Bus names) ----------------------------------------------------

    Surface(activity) {
        const data = check(unpack(activity));
        const id = data.id ?? `${++this._seq}`;
        const internal = PREFIX + id;
        if (!this._live.has(internal) && this._liveCount() >= MAX_LIVE)
            throw new GLib.Error(Gio.DBusError, Gio.DBusError.LIMITS_EXCEEDED, `at most ${MAX_LIVE} activities`);
        const a = this._present({...data, id});
        if (!a)
            return '';
        this._stack.surface(a);
        this._live.add(internal);
        return id;
    }

    Update(id, patch, alert) {
        const internal = PREFIX + id;
        let data = check(unpack(patch), {patch: true});
        const old = this._live.has(internal) ? this._stack.get(internal) : null;
        if (!old)
            return false;
        if (this._registry) {
            // the profile stays on top through updates (its title fills from the new
            // attributes); a ttl from the profile is not re-armed by every update
            const merged = this._registry.present({...data, app: old.app, attributes: data.attributes ?? old.attributes});
            if (!merged)
                return this.End(id); // the new attributes match the profile's skip
            if (!('ttl' in data))
                delete merged.ttl;
            delete merged.app;
            if (!('attributes' in data))
                delete merged.attributes;
            data = merged;
        }
        if (data.actions)
            data.onAction = this._onAction(id);
        return this._stack.update(internal, data, {alert});
    }

    End(id) {
        this._live.delete(PREFIX + id);
        return this._stack.end(PREFIX + id);
    }

    Schedule(activity, startAt) {
        const data = check(unpack(activity));
        const id = data.id ?? `${++this._seq}`;
        const a = this._present({...data, id});
        if (!a)
            return '';
        this._stack.schedule(a, Number(startAt));
        this._live.add(PREFIX + id);
        return id;
    }

    AskAsync([id, question, options, opts], invocation) {
        const o = unpack(opts);
        const fail = msg => invocation.return_gerror(invalid(msg));
        if (CHECKS.id(id) !== true)
            return fail('id: letters, digits, . : _ -, up to 64');
        if (!options.length || options.some(x => typeof x !== 'string' || !x))
            return fail('options: at least one, none empty');
        for (const k of Object.keys(o)) {
            if (!['app', 'timeoutMs', 'fallback'].includes(k))
                return fail(`unknown key "${k}"`);
        }
        if (o.timeoutMs !== undefined && !(isNum(o.timeoutMs) && o.timeoutMs >= 0))
            return fail('timeoutMs: milliseconds, 0 or more');
        if (o.fallback !== undefined && !options.includes(o.fallback))
            return fail('fallback: one of the options');
        if (o.app !== undefined && typeof o.app !== 'string')
            return fail('app: a string');
        this._stack.ask(PREFIX + id, question, options, {
            app: slugOf(o.app), timeoutMs: o.timeoutMs ?? 0, fallback: o.fallback ?? null,
        }).then(choice => invocation.return_value(new GLib.Variant('(s)', [choice ?? ''])));
        return undefined;
    }

    AgentAsync([source, event], invocation) {
        const done = reply => invocation.return_value(new GLib.Variant('(s)', [typeof reply === 'string' ? reply : '']));
        if (typeof source !== 'string' || !/^[a-z][\w-]{0,31}$/.test(source))
            return invocation.return_gerror(invalid('source: a name like "claude"'));
        if (typeof event !== 'string' || event.length > MAX_EVENT)
            return invocation.return_gerror(invalid(`event: JSON text, at most ${MAX_EVENT} bytes`));
        if (!this._agent)
            return done('');
        let reply;
        try {
            reply = this._agent(source, event, {sender: invocation.get_sender()});
        } catch (e) {
            console.warn(`Buoy: agent event: ${e.message}`);
            return done('');
        }
        Promise.resolve(reply).then(done, e => {
            console.warn(`Buoy: agent event: ${e.message}`);
            done('');
        });
        return undefined;
    }

    // --- internals -------------------------------------------------------------------

    _liveCount() {
        // ended or expired activities leave the stack on their own: keep the set honest
        for (const id of this._live) {
            if (!this._stack.has(id))
                this._live.delete(id);
        }
        return this._live.size;
    }

    _present(data) {
        const a = this._registry ? this._registry.present(data) : {...data, app: slugOf(data.app)};
        if (!a)
            return null;
        return {...a, id: PREFIX + data.id, ...a.actions ? {onAction: this._onAction(data.id)} : {}};
    }

    _onAction(id) {
        return action => this._impl?.emit_signal('Action', new GLib.Variant('(ss)', [id, String(action)]));
    }
}

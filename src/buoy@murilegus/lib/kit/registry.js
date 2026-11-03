import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {validate} from './activity.js';

/**
 * Turns a source's event into an activity (ARCHITECTURE data flow):
 *
 *   user profile ~/.config/buoy/apps/<slug>.json   data only (rule 7), applied here
 *   modules/<m>/apps/<slug>.js[kind]               the app's override, unless `apps-plain`
 *   modules/<m>/adapter.js[kind]                   the default
 *
 * Every source names apps its own way (MPRIS bus name, desktop id, notification app name);
 * slugOf() maps them to one slug (rule 5), and modules only ever see the slug.
 *
 * A profile (all keys optional; unknown keys are an error, so a typo is not silently
 * ignored):
 *   icon      icon name; replaces the leading element
 *   title     template for the pill's text: "{artist} — {title}", over the event's fields
 *   hideBody  the adapter never sees the event's `body`
 *   priority  0–100, replaces the kind's default (activity.js PRIORITY)
 *   ttl       ms; still capped at 8 h by validate()
 *   replace   [{field, pattern, with, flags?}] regex replace on string fields, in order,
 *             before the adapter; `with` may use $1…
 *   skip      {field, pattern, flags?} matching events surface nothing
 *   flags: any of i, m, s. Patterns compile once, when the file is read.
 */

// Exceptions to the rules in slugOf(); keys are already normalised (lower case, no
// `.desktop`, no MPRIS prefix or instance suffix). Extend here, never in modules.
const ALIASES = {
    'com.spotify.client': 'spotify',
    'org.mozilla.firefox': 'firefox',
    'org.chromium.chromium': 'chromium',
    'chromium-browser': 'chromium',
    'google-chrome': 'chrome',
    'google chrome': 'chrome',
    'org.telegram.desktop': 'telegram',
    'telegram desktop': 'telegram',
    'telegram-desktop': 'telegram',
    'org.gnome.nautilus': 'nautilus',
    'files': 'nautilus',
    'org.videolan.vlc': 'vlc',
    'io.mpv.mpv': 'mpv',
    'com.discordapp.discord': 'discord',
    'com.slack.slack': 'slack',
    'com.transmissionbt.transmission': 'transmission',
    'transmission-gtk': 'transmission',
};

const REVERSE_DNS = /^[a-z0-9-]+(\.[a-z0-9_-]+){2,}$/;

/**
 * @param {*} appId  MPRIS bus name, desktop id, snap/flatpak id or notification app name
 * @returns {string} the app's one slug across every source; 'system' when there is none
 */
export function slugOf(appId) {
    if (typeof appId !== 'string' || !appId.trim())
        return 'system';
    let k = appId.trim().toLowerCase();
    if (ALIASES[k])                               // org.telegram.desktop is an app id
        return ALIASES[k];
    k = k.replace(/\.desktop$/, '')
        .replace(/^org\.mpris\.mediaplayer2\./, '')
        .replace(/\.instance[_\d]+$/, '');        // firefox.instance_1_42, chromium.instance2091
    k = k.match(/^([^_.]+)_\1$/)?.[1] ?? k;      // snap: spotify_spotify
    if (ALIASES[k])
        return ALIASES[k];
    if (REVERSE_DNS.test(k))
        k = k.split('.').at(-1);                  // org.gnome.Ptyxis → ptyxis
    k = k.replace(/\s+/g, '-');
    return ALIASES[k] ?? k;
}

const KEYS = new Set(['icon', 'title', 'hideBody', 'priority', 'ttl', 'replace', 'skip']);
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function regex(where, rule, global) {
    if (typeof rule.field !== 'string' || !rule.field)
        throw new Error(`${where}: needs a "field"`);
    if (typeof rule.pattern !== 'string')
        throw new Error(`${where}: needs a "pattern"`);
    const flags = rule.flags ?? '';
    if (typeof flags !== 'string' || !/^[ims]*$/.test(flags))
        throw new Error(`${where}: flags may only be i, m, s`);
    try {
        return new RegExp(rule.pattern, flags + (global ? 'g' : ''));
    } catch (e) {
        throw new Error(`${where}: ${e.message}`);
    }
}

/**
 * @param {*} json  a parsed profile file
 * @returns {object} the profile, patterns compiled
 * @throws {Error} naming the key that is wrong
 */
export function parseProfile(json) {
    if (!isPlain(json))
        throw new Error('a profile is a JSON object');
    const p = {};
    for (const [key, v] of Object.entries(json)) {
        if (!KEYS.has(key))
            throw new Error(`unknown key "${key}"`);
        switch (key) {
        case 'icon':
            if (typeof v !== 'string' || !v.trim())
                throw new Error('icon: an icon name');
            p.icon = v.trim();
            break;
        case 'title':
            if (typeof v !== 'string')
                throw new Error('title: a text template');
            p.title = v;
            break;
        case 'hideBody':
            if (typeof v !== 'boolean')
                throw new Error('hideBody: true or false');
            p.hideBody = v;
            break;
        case 'priority':
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)
                throw new Error('priority: a number from 0 to 100');
            p.priority = v;
            break;
        case 'ttl':
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
                throw new Error('ttl: milliseconds, 0 or more');
            p.ttl = v;
            break;
        case 'replace':
            if (!Array.isArray(v))
                throw new Error('replace: a list of {field, pattern, with}');
            p.replace = v.map((r, i) => {
                const where = `replace[${i}]`;
                if (!isPlain(r))
                    throw new Error(`${where}: {field, pattern, with}`);
                const re = regex(where, r, true);
                if (typeof r.with !== 'string')
                    throw new Error(`${where}: needs "with"`);
                return {field: r.field, pattern: r.pattern, with: r.with, flags: r.flags ?? '', re};
            });
            break;
        case 'skip':
            if (!isPlain(v))
                throw new Error('skip: {field, pattern}');
            p.skip = {field: v.field, pattern: v.pattern, flags: v.flags ?? '', re: regex('skip', v, false)};
            break;
        }
    }
    return p;
}

/**
 * @param {string} dir  ~/.config/buoy/apps
 * @returns {{profiles: Map<string, object>, errors: {file: string, message: string}[]}}
 *   one profile per valid `<app>.json`, keyed by the slug of its name; a missing
 *   directory is no profiles and no error
 */
export function loadProfiles(dir) {
    const profiles = new Map(), errors = [];
    const folder = Gio.File.new_for_path(dir);
    let children;
    try {
        children = folder.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            errors.push({file: dir, message: e.message});
        return {profiles, errors};
    }
    for (let info = children.next_file(null); info; info = children.next_file(null)) {
        const file = info.get_name();
        if (!file.endsWith('.json'))
            continue;
        try {
            const [, bytes] = folder.get_child(file).load_contents(null);
            profiles.set(slugOf(file.slice(0, -'.json'.length)),
                parseProfile(JSON.parse(new TextDecoder().decode(bytes))));
        } catch (e) {
            errors.push({file, message: e.message});
        }
    }
    children.close(null);
    return {profiles, errors};
}

/** @returns {string} where user profiles live: $XDG_CONFIG_HOME/buoy/apps */
export function profileDir() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'buoy', 'apps']);
}

// Copy of the event as the adapter sees it: body hidden, replace rules applied.
function prepare(ev, profile) {
    const e = {...ev};
    if (profile.hideBody)
        delete e.body;
    for (const r of profile.replace ?? []) {
        if (typeof e[r.field] === 'string')
            e[r.field] = e[r.field].replace(r.re, r.with);
    }
    return e;
}

// What the profile sets on top of the adapter's presentation.
function overrides(profile, e) {
    const o = {};
    if (profile.title !== undefined)
        o.text = profile.title.replace(/\{(\w+)\}/g, (_, k) => e[k] === null || e[k] === undefined ? '' : String(e[k]));
    if (profile.icon !== undefined)
        o.leading = {icon: profile.icon};
    if (profile.priority !== undefined)
        o.priority = profile.priority;
    if (profile.ttl !== undefined)
        o.ttl = profile.ttl;
    return o;
}

/**
 * Modules register their kinds on enable; apps/*.js are imported statically by the
 * module (rule 7: no code loaded at runtime). Profiles and `apps-plain` come from the
 * extension.
 */
export class Registry {
    constructor() {
        this._adapters = new Map(); // kind → {default, apps: Map<slug, adapter>}
        this._profiles = new Map(); // slug → profile
        this._plain = new Set();    // slugs that use the default adapter (`apps-plain`)
        this._monitor = null;
        this._monitorId = 0;
    }

    register(kind, adapter, apps = {}) {
        this._adapters.set(kind, {default: adapter, apps: new Map(Object.entries(apps))});
    }

    unregister(kind) {
        this._adapters.delete(kind);
    }

    /** @param {Map<string, object>} profiles  slug → parsed profile */
    setProfiles(profiles) {
        this._profiles = profiles;
    }

    /** @param {string[]} apps  `apps-plain` */
    setPlain(apps) {
        this._plain = new Set(apps.map(slugOf));
    }

    /**
     * Read the profiles in `dir`, then reload them whenever a file there changes (a file
     * monitor: a signal, no polling). New profiles apply to the next build of each app.
     *
     * @param {string} dir
     * @param {function(object[]):void} [onErrors]  bad files, after every load
     */
    watch(dir, onErrors = () => {}) {
        const load = () => {
            const {profiles, errors} = loadProfiles(dir);
            this._profiles = profiles;
            if (errors.length)
                onErrors(errors);
        };
        load();
        this._monitor = Gio.File.new_for_path(dir).monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._monitorId = this._monitor.connect('changed', (_m, _f, _o, event) => {
            if (event !== Gio.FileMonitorEvent.CHANGED) // wait for CHANGES_DONE_HINT
                load();
        });
    }

    /**
     * @param {string} kind
     * @param {*} appId  as the source names the app
     * @param {object} ev  the source's event
     * @returns {?object} a validated activity, or null (no adapter, skipped, or the
     *   adapter returned nothing)
     */
    build(kind, appId, ev) {
        const entry = this._adapters.get(kind);
        if (!entry)
            return null;
        const slug = slugOf(appId);
        const profile = this._profiles.get(slug) ?? null;
        const s = profile?.skip;
        if (s && typeof ev[s.field] === 'string' && s.re.test(ev[s.field]))
            return null;
        const e = profile ? prepare(ev, profile) : ev;
        const own = this._plain.has(slug) ? null : entry.apps.get(slug)?.[kind];
        const fn = own ?? entry.default[kind];
        const data = fn?.(e, profile);
        if (!data)
            return null;
        return validate({
            id: `${kind}:${slug}:${ev.id ?? ''}`, kind, app: slug,
            ...data, ...profile ? overrides(profile, e) : {},
        });
    }

    destroy() {
        if (this._monitor) {
            this._monitor.disconnect(this._monitorId);
            this._monitor.cancel();
            this._monitor = null;
        }
        this._adapters.clear();
    }
}

import {validate} from './activity.js';

// One slug per app across every source. Extend here, never in modules.
const SLUGS = {
    'org.mpris.MediaPlayer2.spotify': 'spotify',
    'spotify': 'spotify',
    'org.mpris.MediaPlayer2.firefox': 'firefox',
    'firefox': 'firefox',
    'org.telegram.desktop': 'telegram',
    'telegram desktop': 'telegram',
};

export function slugOf(appId = '') {
    const key = appId.replace(/\.instance\d+$/, '');
    return SLUGS[key] ?? SLUGS[key.toLowerCase()] ??
        key.replace(/^org\.mpris\.MediaPlayer2\./, '').toLowerCase();
}

/**
 * Resolution order: user JSON profile → modules/<m>/apps/<slug>.js → modules/<m>/adapter.js.
 * Modules register themselves on enable; apps/*.js are imported statically by the module.
 */
export class Registry {
    constructor() {
        this._adapters = new Map(); // kind → {default, apps: Map<slug, adapter>}
        this._profiles = new Map(); // slug → JSON profile (TODO: load from ~/.config/buoy/apps)
    }

    register(kind, adapter, apps = {}) {
        this._adapters.set(kind, {default: adapter, apps: new Map(Object.entries(apps))});
    }

    unregister(kind) {
        this._adapters.delete(kind);
    }

    build(kind, appId, ev) {
        const entry = this._adapters.get(kind);
        if (!entry)
            return null;
        const slug = slugOf(appId);
        const fn = entry.apps.get(slug)?.[kind] ?? entry.default[kind];
        if (!fn)
            return null;
        const data = fn(ev, this._profiles.get(slug) ?? null);
        return validate({id: `${kind}:${slug}:${ev.id ?? ''}`, kind, app: slug, ...data});
    }
}

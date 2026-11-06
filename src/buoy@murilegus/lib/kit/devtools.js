/**
 * Dev-only module hot swap. GJS caches ES modules by URL, so importing
 * `index.js?t=<now>` yields a fresh instance (relative imports inside it are
 * re-resolved too). Old instances stay in memory — fine while developing.
 * Gated by the `dev-mode` setting; never on by default.
 *
 * @param {object} ext  the enabled BuoyExtension instance
 * @param {string} id   module id, e.g. 'media'
 * @returns {Promise<string>} id of the reloaded module
 */
export async function reloadModule(ext, id) {
    const old = ext._active.find(a => a.m.id === id);
    if (old) {
        old.src?.disable();
        for (const k of old.m.kinds)
            ext._registry.unregister(k);
        ext._active = ext._active.filter(a => a !== old);
    }
    const url = `file://${ext.path}/lib/modules/${id}/index.js?t=${Date.now()}`;
    const fresh = (await import(url)).default;
    for (const k of fresh.kinds)
        ext._registry.register(k, fresh.adapter, fresh.apps ?? {});
    let src = null;
    if (fresh.source) {
        src = new fresh.source();
        src.enable(ext._stack, ext._registry, ext._settings, {dbus: ext._dbus});
    }
    ext._active.push({m: fresh, src});
    return fresh.id;
}

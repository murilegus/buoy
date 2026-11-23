/**
 * The network as flashes (FEATURES M4 "VPN / Wi-Fi / captive portal"; design/compact "Mạng",
 * 2026-11-23, Ethan), pure: what changed between two readings of NetworkManager (through Shell's
 * own NM.Client, source.js), and the icons. No NM, no GLib.
 *
 * A reading: {primary: ?{id, type: 'wifi' | 'wired' | 'other', name, strength}, vpns: [{id, name}]}
 *   id        the active connection's D-Bus path: the same connection keeps it while it roams
 *   strength  Wi-Fi's 0..100, or null
 */

/** Every flash that only tells is 3 s (design/compact "Cắm màn hình và tai nghe"). */
export const TTL = 3000;
/** No flash this long after Buoy starts, the screen unlocks or the machine wakes: NM reconnects then. */
export const QUIET = 15000;
/** A drop this short, the same connection back: nothing (a flaky Wi-Fi). */
export const FLAKY = 3000;
/** Connectivity below full this long (not a portal) before "No Internet": NM checks after it connects. */
export const LIMITED_WAIT = 5000;

/**
 * @param {?number} strength  0..100
 * @returns {string} the Wi-Fi icon for it (NetworkManager's levels, as Shell's network.js
 *   signalToIcon: 80, 55, 30, 5)
 */
export function wifiIcon(strength) {
    if (!Number.isFinite(strength))
        return 'network-wireless-signal-good-symbolic';
    if (strength > 80)
        return 'network-wireless-signal-excellent-symbolic';
    if (strength > 55)
        return 'network-wireless-signal-good-symbolic';
    if (strength > 30)
        return 'network-wireless-signal-ok-symbolic';
    if (strength > 5)
        return 'network-wireless-signal-weak-symbolic';
    return 'network-wireless-signal-none-symbolic';
}

/**
 * @param {?object} c  a reading's primary
 * @returns {string} its icon
 */
export function iconOf(c) {
    if (c?.type === 'wifi')
        return wifiIcon(c.strength);
    return c ? 'network-wired-symbolic' : 'network-offline-symbolic';
}

/**
 * What changed, as flashes (design/compact "Mạng", 1): a primary connection that is new, none left
 * (offline), a VPN on or off. A drop is reported by the caller after FLAKY (source.js), so here
 * `offline` is only "none now, one before".
 *
 * @param {?object} prev  the last reading (null: the first, nothing to say)
 * @param {object} cur
 * @returns {object[]} events for the adapter: {what: 'connected', type, name, strength} |
 *   {what: 'offline'} | {what: 'vpn-on', name} | {what: 'vpn-off', name}
 */
export function changes(prev, cur) {
    if (!prev)
        return [];
    const out = [];
    const p = prev.primary, c = cur.primary;
    if (c && c.id !== p?.id)
        out.push({what: 'connected', type: c.type, name: c.name, strength: c.strength ?? null});
    else if (!c && p)
        out.push({what: 'offline'});
    const was = new Map(prev.vpns.map(v => [v.id, v]));
    const now = new Map(cur.vpns.map(v => [v.id, v]));
    for (const [id, v] of now) {
        if (!was.has(id))
            out.push({what: 'vpn-on', name: v.name});
    }
    for (const [id, v] of was) {
        if (!now.has(id))
            out.push({what: 'vpn-off', name: v.name});
    }
    return out;
}

/**
 * @param {*} name  a connection's id (its name in Settings)
 * @param {string} fallback
 * @returns {string} trimmed, or the fallback
 */
export function nameOr(name, fallback) {
    return typeof name === 'string' && name.trim() ? name.trim() : fallback;
}

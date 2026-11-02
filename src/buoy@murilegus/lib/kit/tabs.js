/**
 * The tab strip inside expanded (SPEC §2b): which tabs exist and which one an open
 * starts on. Pure (no St, no Main), so it runs under plain gjs; kit/home.js builds the
 * actors.
 *
 *   [Home] [kind tabs] [pinned standalone tabs] [slot ▾] [⋯]
 *
 * - Home is always first.
 * - A kind tab per enabled module with kinds, in module order (SPEC §6), when the module
 *   ships `tab.js`, or when a visible activity of its kinds has an expanded presentation:
 *   that tab then shows the activities' own expanded views (decided 2026-11-02, while no
 *   module ships `tab.js` yet). Kinds no module claims (D-Bus callers) get a tab of their
 *   own the same way, after the module tabs.
 * - Standalone tabs (`tab.js`, `kinds: []`): pinned ones are fixed tabs; the slot shows
 *   the one last chosen from ⋯ (`tabs-slot`); ⋯ lists all of them. None exist yet.
 * - Where you open from decides the tab (tabFor); nothing remembers the last tab.
 */

import {planExpanded} from './presentation.js';

export const HOME = 'home';

const title = id => id.charAt(0).toUpperCase() + id.slice(1);
const hasExpanded = a => planExpanded(a) !== null;

/**
 * @param {object[]} modules  enabled modules, in order: {id, kinds, tab?, title?, icon?}
 * @param {object[]} list  visible activities (stack order)
 * @param {object} [opts]
 * @param {string} [opts.slot]  `tabs-slot`
 * @param {string[]} [opts.pinned]  `tabs-pinned`
 * @returns {object} {tabs, slot, more}: tabs = [{id, type, label, icon, kinds}], type
 *   'home' | 'kind' | 'standalone'; slot = the slot tab or null; more = standalone tabs
 *   for ⋯ (empty: no ⋯)
 */
export function planStrip(modules, list, {slot = '', pinned = []} = {}) {
    const tabs = [{id: HOME, type: 'home', label: 'Home', icon: 'go-home-symbolic', kinds: []}];
    const shown = kinds => list.some(a => kinds.includes(a.kind) && hasExpanded(a));
    const claimed = new Set();

    for (const m of modules) {
        if (!m.kinds?.length)
            continue;
        m.kinds.forEach(k => claimed.add(k));
        if (m.tab || shown(m.kinds)) {
            tabs.push({
                id: m.id, type: 'kind', label: m.title ?? title(m.id),
                icon: m.icon ?? null, kinds: [...m.kinds],
            });
        }
    }
    for (const a of list) {
        const id = `kind:${a.kind}`;
        if (!claimed.has(a.kind) && hasExpanded(a) && !tabs.some(t => t.id === id))
            tabs.push({id, type: 'kind', label: title(a.kind), icon: null, kinds: [a.kind]});
    }

    const standalone = modules
        .filter(m => m.tab && !m.kinds?.length && m.id !== HOME)
        .map(m => ({id: m.id, type: 'standalone', label: m.title ?? title(m.id), icon: m.icon ?? null, kinds: []}));
    for (const t of standalone) {
        if (pinned.includes(t.id))
            tabs.push(t);
    }
    const slotTab = standalone.find(t => t.id === slot && !pinned.includes(t.id)) ?? null;
    return {tabs, slot: slotTab, more: standalone};
}

/**
 * Where an open from this activity starts (SPEC §2b): the tab of its kind, else Home.
 *
 * @param {?object} activity  null = the idle pill
 * @param {object} strip  planStrip() result
 * @returns {string} tab id
 */
export function tabFor(activity, strip) {
    if (!activity)
        return HOME;
    return strip.tabs.find(t => t.type === 'kind' && t.kinds.includes(activity.kind))?.id ?? HOME;
}

/**
 * @param {object} tab  a kind tab
 * @param {object[]} list  visible activities (stack order)
 * @returns {object[]} the tab's activities with an expanded presentation, in stack order
 */
export function tabActivities(tab, list) {
    return list.filter(a => tab.kinds.includes(a.kind) && hasExpanded(a));
}

/**
 * @param {object} strip  planStrip() result
 * @param {string} id
 * @returns {?object} the tab with this id, including the slot and the ⋯ list
 */
export function findTab(strip, id) {
    return strip.tabs.find(t => t.id === id) ??
        (strip.slot?.id === id ? strip.slot : strip.more.find(t => t.id === id)) ?? null;
}

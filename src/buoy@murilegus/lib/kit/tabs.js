/**
 * The tab strip inside expanded (SPEC §2b): which tabs exist and which one an open
 * starts on. Pure (no St, no Main), so it runs under plain gjs; kit/home.js builds the
 * actors.
 *
 *   [Home] [kind tabs] [pinned standalone tabs] [slot] [⋯]
 *
 * - Home is always first.
 * - A kind tab per enabled module with kinds, in module order (SPEC §6), always shown,
 *   running or not (2026-11-02). Until the module ships `tab.js` it shows its activities'
 *   own expanded views, or nothing. Modules whose kinds are all feedback for your own
 *   action (osd, copied: SPEC §2b) have no tab, unless one of their activities brings an
 *   expanded presentation. Kinds no module claims (D-Bus callers) get a tab while one of
 *   their activities has an expanded presentation, after the module tabs.
 * - Standalone tabs (`tab.js`, `kinds: []`): the last cell, the slot, shows the one
 *   chosen from ⋯ (`tabs-slot`), or the first enabled one until something is chosen
 *   (2026-11-02); ⋯ lists all of them. Ones pinned in settings (`tabs-pinned`) are fixed
 *   tabs before the slot and never in it.
 * - Where you open from decides the tab (tabFor); nothing remembers the last tab.
 */

import {planExpanded} from './presentation.js';

export const HOME = 'home';

// SPEC §2b: kinds without a tab; an open from them goes to onPress or Home
const FEEDBACK = new Set(['osd', 'copied']);

// Inactive tabs show only their icon (Notchy's strip, 2026-11-02), so every tab has one.
const GENERIC_ICON = 'view-app-grid-symbolic';

const title = id => id.charAt(0).toUpperCase() + id.slice(1);
const iconName = v => typeof v === 'string' && v.trim() ? v.trim() : null;
const hasExpanded = a => planExpanded(a) !== null;

/**
 * @param {object[]} modules  enabled modules, in order: {id, kinds, tab?, title?, icon?}
 * @param {object[]} list  visible activities (stack order)
 * @param {object} [opts]
 * @param {string} [opts.slot]  `tabs-slot`
 * @param {string[]} [opts.pinned]  `tabs-pinned`
 * @returns {object} {tabs, slot, more}: tabs = [{id, type, label, icon, kinds}] (icon
 *   always set: module `icon`, else a generic one), type 'home' | 'kind' | 'standalone';
 *   slot = the slot's tab or null; more = every standalone tab for ⋯ (empty: no ⋯)
 */
export function planStrip(modules, list, {slot = '', pinned = []} = {}) {
    const tabs = [{id: HOME, type: 'home', label: 'Home', icon: 'go-home-symbolic', kinds: []}];
    const shown = kinds => list.some(a => kinds.includes(a.kind) && hasExpanded(a));
    const claimed = new Set();

    for (const m of modules) {
        if (!m.kinds?.length)
            continue;
        m.kinds.forEach(k => claimed.add(k));
        if (m.tab || m.kinds.some(k => !FEEDBACK.has(k)) || shown(m.kinds)) {
            tabs.push({
                id: m.id, type: 'kind', label: m.title ?? title(m.id),
                icon: m.icon ?? GENERIC_ICON, kinds: [...m.kinds],
            });
        }
    }
    for (const a of list) {
        const id = `kind:${a.kind}`;
        if (!claimed.has(a.kind) && hasExpanded(a) && !tabs.some(t => t.id === id)) {
            // no module to ask: the first activity's own icon (`leading` or `leading.icon`)
            const icon = iconName(a.leading) ?? iconName(a.leading?.icon) ?? GENERIC_ICON;
            tabs.push({id, type: 'kind', label: title(a.kind), icon, kinds: [a.kind]});
        }
    }

    const standalone = modules
        .filter(m => m.tab && !m.kinds?.length && m.id !== HOME)
        .map(m => ({id: m.id, type: 'standalone', label: m.title ?? title(m.id), icon: m.icon ?? GENERIC_ICON, kinds: []}));
    tabs.push(...standalone.filter(t => pinned.includes(t.id)));
    const free = standalone.filter(t => !pinned.includes(t.id));
    const slotTab = free.find(t => t.id === slot) ?? free[0] ?? null;
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
 * @returns {?object} the tab with this id: in the strip, the slot or the ⋯ list
 */
export function findTab(strip, id) {
    return strip.tabs.find(t => t.id === id) ??
        (strip.slot?.id === id ? strip.slot : strip.more.find(t => t.id === id)) ?? null;
}

/**
 * The strip's tabs in the order they are drawn (←/→ walks it): Home and the kind tabs,
 * then the slot; ⋯ is a menu, not a tab.
 *
 * @param {object} strip  planStrip()
 * @returns {string[]} tab ids
 */
export function stripOrder(strip) {
    return [...strip.tabs.map(t => t.id), ...strip.slot ? [strip.slot.id] : []];
}

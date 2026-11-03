/**
 * Presentation data → render plan. Pure (no St, no Main), so it runs under plain gjs;
 * present.js turns a plan into actors and is the only place content actors are made.
 *
 * Adapter data (APPLE.md §B1/B3, ARCHITECTURE rule 3):
 *   {leading, text, trailing, expanded, actions, keyline, isStale}
 *   leading/trailing: 'icon-name' | Gio.Icon | {art, icon} | {icon} | {progress: 0..1}
 *                     | {bar: 0..1} | {countdown: s} | {text}
 *   expanded: true (= enlarged compact) | {leading, center, trailing, bottom}
 *             region: an element as above | {title, subtitle, progress} | {transport: true};
 *             any region may carry `priority` (the highest one takes the free width)
 *   actions: [{id, label?, icon?}] — 1 shown in compact, 3 in expanded (APPLE.md B5.5)
 *
 *   peek: {leading, text, trailing, transport?} — shown on hover (Buoy's own, no Apple
 *         equivalent); transport: true adds up to 3 of the activity's actions as buttons
 *
 * The buoy light (SPEC §2a-i) is the pill's left edge slot: grey `off` only in idle,
 * `missed` (amber) / `waiting` (red) in idle and compact, never in expanded.
 *
 * Measurements from adapters (`size`, `width`, …) are ignored (ARCHITECTURE rule 11).
 * Text is never truncated here; the renderer ellipsizes.
 */

import {mnemonics} from './keys.js';

export const MAX_ACTIONS = {compact: 1, expanded: 3, peek: 3};
const LIGHTS = new Set(['off', 'missed', 'waiting']);

// INDICATORS.md: state colours belong to the light/dot slots, never to a keyline.
const RESERVED = new Set(['#ef9f27', '#e24b4a', '#f0997b', '#5dcaa5', '#3a3a3a']);
const GLYPHS = new Set(['eq']);
const REGIONS = ['leading', 'center', 'trailing'];

const isPlain = v => v !== null && typeof v === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(v));
const clamp01 = v => Math.max(0, Math.min(1, v));
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function str(v) {
    if (isNum(v))
        return String(v);
    if (typeof v !== 'string')
        return null;
    const t = v.trim();
    return t || null;
}

function icon(v) {
    if (v !== null && typeof v === 'object' && !isPlain(v))
        return {type: 'icon', gicon: v};          // a Gio.Icon from the source
    const name = typeof v === 'string' ? str(v) : null;
    if (!name)
        return null;
    return GLYPHS.has(name) ? {type: 'glyph', name} : {type: 'icon', icon: name};
}

function clock(seconds) {
    const t = Math.max(0, Math.round(seconds));
    const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * @param {*} e  one leading/trailing/region value from an adapter
 * @returns {?object} {type: 'icon'|'glyph'|'art'|'ring'|'bar'|'text', …} or null
 */
export function element(e) {
    if (!isPlain(e))
        return icon(e);
    const art = str(e.art);
    if (art) {
        const fb = icon(e.icon);
        return {type: 'art', src: art, fallback: fb?.type === 'icon' ? fb.icon ?? null : null};
    }
    const ic = icon(e.icon);
    if (ic)
        return ic;
    if (isNum(e.progress))
        return {type: 'ring', value: clamp01(e.progress)};
    if (isNum(e.bar))
        return {type: 'bar', value: clamp01(e.bar)};
    if (isNum(e.countdown))
        return {type: 'text', text: clock(e.countdown)};
    const text = str(e.text);
    return text ? {type: 'text', text} : null;
}

/**
 * @param {*} v  adapter keyline
 * @returns {?string} lower-case hex colour, or null if invalid or a reserved state colour
 */
export function keyline(v) {
    if (typeof v !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v))
        return null;
    const c = v.toLowerCase();
    return RESERVED.has(c) ? null : c;
}

function actions(list, max) {
    if (!Array.isArray(list))
        return [];
    return list
        .filter(a => isPlain(a) && str(a.id) && (str(a.label) || icon(a.icon)))
        .slice(0, max)
        .map(a => ({id: str(a.id), label: str(a.label), icon: str(a.icon)}));
}

/**
 * @param {*} light  the stack's light: 'off' | 'missed' | 'waiting'
 * @param {object} opts
 * @param {boolean} opts.idle  idle pill (grey `off` is drawn only there)
 * @returns {?string} the light to draw, or null for no slot
 */
export function lightSlot(light, {idle}) {
    const l = LIGHTS.has(light) ? light : 'off';
    return l === 'off' && !idle ? null : l;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.light]
 * @returns {object} {light} — idle-content `none`: the pill shows only the buoy light
 */
export function planIdle({light} = {}) {
    return {light: lightSlot(light, {idle: true})};
}

/**
 * @param {object} p  presentation data (an activity)
 * @param {object} [opts]
 * @param {string} [opts.light]  the stack's light
 * @param {number} [opts.more]  activities beyond the shown pills (last pill only)
 * @returns {object} {leading, text, trailing, action, keyline, stale, light, badge}
 */
export function planCompact(p, {light, more} = {}) {
    return {
        leading: element(p.leading),
        text: str(p.text),
        trailing: element(p.trailing),
        action: actions(p.actions, MAX_ACTIONS.compact)[0] ?? null,
        keyline: keyline(p.keyline),
        stale: p.isStale === true,
        light: lightSlot(light, {idle: false}),
        badge: Number.isInteger(more) && more > 0 ? `+${more}` : null,
    };
}

/**
 * @param {object} p  presentation data (an activity)
 * @param {object} [opts]
 * @param {string} [opts.light]  the stack's light
 * @returns {?object} {leading, text, trailing, actions, keyline, stale, light} or null
 */
export function planPeek(p, {light} = {}) {
    if (!isPlain(p.peek))
        return null;
    const peek = p.peek;
    const plan = {
        leading: element(peek.leading),
        text: str(peek.text),
        trailing: element(peek.trailing),
        actions: peek.transport === true ? actions(p.actions, MAX_ACTIONS.peek) : [],
        keyline: keyline(p.keyline),
        stale: p.isStale === true,
        light: lightSlot(light, {idle: false}),
    };
    if (!plan.leading && !plan.text && !plan.trailing && !plan.actions.length)
        return null;
    return plan;
}

function region(r) {
    if (isPlain(r)) {
        if (r.transport === true)
            return {type: 'actions'};
        const title = str(r.title), subtitle = str(r.subtitle);
        if (title || subtitle)
            return {type: 'block', title, subtitle, bar: isNum(r.progress) ? clamp01(r.progress) : null};
    }
    return element(r);
}

/**
 * Expanded is an enlarged compact (APPLE.md B2): regions the adapter leaves out fall
 * back to the compact elements; an explicit null keeps a region empty.
 *
 * @param {object} p  presentation data (an activity)
 * @returns {?object} {leading, center, trailing, bottom, grow, actions, keyline, stale}
 *   or null; an ask's actions carry `key` when the activity has no expanded presentation
 */
export function planExpanded(p) {
    const ex = p.expanded === true ? {} : p.expanded;
    if (!isPlain(ex))
        return null;

    const c = planCompact(p);
    let acts = actions(p.actions, MAX_ACTIONS.expanded);
    if (p.kind === 'ask') {
        // answered from the keyboard too: the key is printed on the button while the
        // island holds the keyboard (kit/keys.js)
        const keys = mnemonics(acts.map(a => a.label ?? a.id));
        acts = acts.map((a, i) => ({...a, key: keys[i]}));
    }
    const fallback = {
        leading: c.leading,
        center: c.text ? {type: 'block', title: c.text, subtitle: null, bar: null} : null,
        trailing: c.trailing,
        bottom: acts.length ? {type: 'actions'} : null,
    };
    const plan = {};
    for (const name of [...REGIONS, 'bottom']) {
        let r = name in ex ? region(ex[name]) : fallback[name];
        if (r?.type === 'actions' && !acts.length)
            r = null;
        plan[name] = r;
    }
    if (REGIONS.every(n => !plan[n]) && !plan.bottom)
        return null;

    // `priority`: the highest explicit one among the top regions takes the free width;
    // ties (and no priorities) keep it on center.
    const prio = n => isPlain(ex[n]) && isNum(ex[n].priority) ? ex[n].priority : 0;
    let grow = 'center';
    for (const n of ['leading', 'trailing']) {
        if (plan[n] && prio(n) > prio(grow))
            grow = n;
    }

    return {...plan, grow, actions: acts, keyline: c.keyline, stale: c.stale};
}

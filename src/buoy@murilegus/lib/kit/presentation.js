/**
 * Presentation data → render plan. Pure (no St, no Main), so it runs under plain gjs;
 * present.js turns a plan into actors and is the only place content actors are made.
 *
 * Adapter data (APPLE.md §B1/B3, ARCHITECTURE rule 3):
 *   {leading, text, trailing, expanded, actions, keyline, isStale}
 *   leading/trailing: 'icon-name' | Gio.Icon | {art, icon} | {icon} | {progress: 0..1}
 *                     | {bar: 0..1} | {countdown: s} | {text}
 *   leading only:     {mascot: '<pose>', icon?} — Bu (MASCOT.md); an unknown pose falls
 *                     back to `icon`, else `idle`; elsewhere only its `icon` counts
 *   expanded: true (= enlarged minimal) | {leading, center, trailing, bottom}
 *             region: an element as above | {title, subtitle, progress} | {transport: true};
 *             any region may carry `priority` (the highest one takes the free width)
 *   actions: [{id, label?, icon?}] — 1 shown in minimal, 3 in compact and expanded (APPLE.md B5.5)
 *
 *   compact: {leading, text, subtitle?, trailing, transport?, progress?, rows?} — the hover
 *         tier (SPEC §2; Buoy's own, no Apple equivalent): leading 40, a title and a
 *         subtitle line, transport: true adds up to 3 of the activity's actions as buttons,
 *         progress (0..1) a bar under them, rows up to 3 `{icon?, text, detail?}`
 *
 * Minimal is one set of data for every pill (APPLE §B3): a side pill drops `text` and
 * keeps leading + trailing, so the short value that matters belongs in `trailing`.
 *
 * The buoy light (SPEC §2a-i) is the pill's left edge slot: grey `off` only in idle,
 * `missed` (amber) / `waiting` (red) in idle, minimal and compact, never in expanded. When Bu
 * leads, Bu's lamp is the light: no edge slot, and the mascot element carries `light`
 * (amber/red, or null for the pose's own colour, kit/mascot.js lampColour).
 *
 * Measurements from adapters (`size`, `width`, …) are ignored (ARCHITECTURE rule 11).
 * Text is never truncated here; the renderer ellipsizes.
 */

import {mnemonics} from './keys.js';
import {poseName} from './mascot.js';

export const MAX_ACTIONS = {minimal: 1, compact: 3, expanded: 3};
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
 * @param {object} [opts]
 * @param {boolean} [opts.leading]  the leading zone: the only place Bu may be
 * @returns {?object} {type: 'icon'|'glyph'|'art'|'ring'|'bar'|'text'|'mascot', …} or null
 */
export function element(e, {leading = false} = {}) {
    if (!isPlain(e))
        return icon(e);
    if ('mascot' in e) {
        const pose = leading ? poseName(e.mascot) : null;
        if (pose)
            return {type: 'mascot', pose};
        return icon(e.icon) ?? (leading ? {type: 'mascot', pose: 'idle'} : null);
    }
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

// The leading zone, and where the light goes: Bu carries amber/red in its lamp (no edge
// slot); anything else leaves the light to the edge slot.
function leadingAndLight(v, light) {
    const leading = element(v, {leading: true});
    const slot = lightSlot(light, {idle: false});
    if (leading?.type !== 'mascot')
        return {leading, light: slot};
    return {leading: {...leading, light: slot}, light: null};
}

/**
 * The idle pill (SPEC §2a): with `none` (no plan) only the buoy light, grey when off;
 * with a plan its zones, and the light only when it says something (no grey).
 *
 * @param {object} [opts]
 * @param {string} [opts.light]
 * @param {?object} [opts.plan]  the idle plan's presentation data {leading, text, trailing}
 * @returns {object} {light, leading, text, trailing}
 */
export function planIdle({light, plan = null} = {}) {
    if (!isPlain(plan))
        return {light: lightSlot(light, {idle: true}), leading: null, text: null, trailing: null};
    const lead = leadingAndLight(plan.leading, light);
    return {leading: lead.leading, text: str(plan.text), trailing: element(plan.trailing), light: lead.light};
}

/**
 * @param {object} p  presentation data (an activity)
 * @param {object} [opts]
 * @param {string} [opts.light]  the stack's light
 * @param {number} [opts.more]  activities beyond the shown pills (last pill only)
 * @param {boolean} [opts.side]  a 120 px side pill (SPEC §2c): text dropped, unless there
 *   is nothing else to show
 * @returns {object} {leading, text, trailing, action, keyline, stale, light, badge}
 */
export function planMinimal(p, {light, more, side = false} = {}) {
    const lead = leadingAndLight(p.leading, light);
    const trailing = element(p.trailing);
    return {
        leading: lead.leading,
        text: side && (lead.leading || trailing) ? null : str(p.text),
        trailing,
        action: actions(p.actions, MAX_ACTIONS.minimal)[0] ?? null,
        keyline: keyline(p.keyline),
        stale: p.isStale === true,
        light: lead.light,
        badge: Number.isInteger(more) && more > 0 ? `+${more}` : null,
    };
}

/**
 * @param {object} p  presentation data (an activity)
 * @param {object} [opts]
 * @param {string} [opts.light]  the stack's light
 * @returns {?object} {leading, text, subtitle, trailing, actions, progress, rows, tall,
 *   keyline, stale, light} or null; `tall`: a bar or rows (88 px, else 56)
 */
export function planCompact(p, {light} = {}) {
    if (!isPlain(p.compact))
        return null;
    const c = p.compact;
    const lead = leadingAndLight(c.leading, light);
    const plan = {
        leading: lead.leading,
        text: str(c.text),
        subtitle: str(c.subtitle),
        trailing: element(c.trailing),
        actions: c.transport === true ? actions(p.actions, MAX_ACTIONS.compact) : [],
        progress: isNum(c.progress) ? clamp01(c.progress) : null,
        rows: rows(c.rows),
        keyline: keyline(p.keyline),
        stale: p.isStale === true,
        light: lead.light,
    };
    plan.tall = plan.progress !== null || plan.rows.length > 0;
    if (!plan.leading && !plan.text && !plan.subtitle && !plan.trailing && !plan.actions.length &&
        !plan.tall)
        return null;
    return plan;
}

export const MAX_ROWS = 3;

function rows(list) {
    if (!Array.isArray(list))
        return [];
    return list
        .filter(r => isPlain(r) && str(r.text))
        .slice(0, MAX_ROWS)
        .map(r => ({icon: icon(r.icon), text: str(r.text), detail: str(r.detail)}));
}

function region(r, name) {
    if (isPlain(r) && 'mascot' in r)  // Bu leads only; no light in expanded: the pose's lamp
        return name === 'leading' ? leadingAndLight(r, null).leading : element(r);
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
 * Expanded is an enlarged minimal (APPLE.md B2): regions the adapter leaves out fall
 * back to the minimal elements; an explicit null keeps a region empty.
 *
 * @param {object} p  presentation data (an activity)
 * @returns {?object} {leading, center, trailing, bottom, grow, actions, keyline, stale}
 *   or null; an ask's actions carry `key` when the activity has no expanded presentation
 */
export function planExpanded(p) {
    const ex = p.expanded === true ? {} : p.expanded;
    if (!isPlain(ex))
        return null;

    const c = planMinimal(p);
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
        let r = name in ex ? region(ex[name], name) : fallback[name];
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

/**
 * The amber light's compact (INDICATORS.md, 2026-11-05): "Missed · N" and up to 3 rows,
 * newest first, each the kind's icon, its text and the time it ended.
 *
 * @param {object[]} missed  the stack's history, newest first ({kind, text, at})
 * @param {function(string): ?string} [iconOf]  kind → icon name (its tab's)
 * @returns {?object} {title, rows: [{icon: element, text, detail}], tall: true, light: 'missed'} or
 *   null when nothing was missed
 */
export function planMissed(missed, iconOf = () => null) {
    if (!Array.isArray(missed) || !missed.length)
        return null;
    return {
        title: `Missed · ${missed.length}`,
        rows: missed.slice(0, MAX_ROWS).map(m => ({
            icon: icon(iconOf(m.kind)) ?? icon('view-app-grid-symbolic'),
            text: str(m.text) ?? str(m.kind) ?? '',
            detail: clockTime(m.at) || null,
        })),
        tall: true,
        light: 'missed',
    };
}

/**
 * @param {number} ms  since the epoch
 * @returns {string} local `HH:MM`, '' without a time
 */
export function clockTime(ms) {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime()))
        return '';
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Presentation data → render plan. Pure (no St, no Main), so it runs under plain gjs;
 * ui/present/ turns a plan into actors and is the only place content actors are made.
 *
 * Adapter data (CONTRACT.md §1/B3, ARCHITECTURE rule 3):
 *   {leading, text, trailing, expanded, actions, keyline, isStale}
 *   leading/trailing: 'icon-name' | Gio.Icon | {art (path, URI or Gio.Icon), icon} | {icon} |
 *   {progress: 0..1}
 *                     | {bar: 0..1} | {countdown: s} | {until: ms since the epoch}
 *                     | {since: ms since the epoch} | {text}
 *                     `until` counts down live, once a second while shown (ui/present/parts.js);
 *                     `since` is its twin, the time since then in minutes ("4 min"), the
 *                     text changing once a minute while shown (CODING-AGENTS.md §2)
 *   leading only:     {mascot: '<pose>', icon?} — Bu (MASCOT.md); an unknown pose falls
 *                     back to `icon`, else `idle`; elsewhere only its `icon` counts. A
 *                     stale activity's Bu takes the pose `stale` (MASCOT.md § Poses)
 *   expanded: true (= enlarged minimal) | {leading, center, trailing, bottom}
 *             region: an element as above | {title, subtitle, progress} | {transport: true};
 *             any region may carry `priority` (the highest one takes the free width)
 *   actions: [{id, label?, icon?}] — 1 shown in minimal, 3 in compact and expanded (CONTRACT.md §5.5);
 *            `minimalAction: false` keeps the minimal pill without a button
 *
 *   compact: {leading, text, subtitle?, trailing, transport?, progress?, rows?} — the hover
 *         tier (SPEC §2; Buoy's own, no Apple equivalent): leading 40, a title and a
 *         subtitle line, transport: true adds up to 3 of the activity's actions as buttons,
 *         progress a bar under them — 0..1, or live `{position, length, at, playing}` (ms;
 *         `at` when position was read) which runs with the elapsed and remaining times —
 *         rows up to 3 `{icon?, text, detail?}`
 *   compact.card: {icon, app, at, picture, title, body, close} — a card instead (a
 *         notification, NOTIFICATIONS.md §3, 2026-11-07): a header (icon, app name, the time
 *         since `at`, × running action `close`), a picture, a title, a body of up to 2
 *         lines, then the activity's actions (≤ 3) in a row; full width, up to 160 tall
 *
 * Minimal is one set of data for every pill (CONTRACT.md §3): a side pill drops `text` and
 * keeps leading + trailing, so the short value that matters belongs in `trailing`.
 *
 * The buoy light (SPEC §2a-i) is the pill's left edge slot: grey `off` only in idle,
 * `missed` (amber) / `waiting` (red) in idle, minimal and compact, never in expanded — on
 * every pill, Bu's too: Bu's lamp keeps its pose's colour (2026-11-08, Ethan: the lamp is
 * too small to read as the light).
 *
 * Measurements from adapters (`size`, `width`, …) are ignored (ARCHITECTURE rule 11).
 * Text is never truncated here; the renderer ellipsizes.
 */

import {mnemonics} from './keys.js';
import {poseName} from './mascot.js';

export const MAX_ACTIONS = {minimal: 1, compact: 3, expanded: 3};
/** An expanded block's extra lines (the greeting's): more would not fit the cap. */
export const MAX_LINES = 6;

/**
 * Typed-in text (GREETING.md principle 7): how much of each piece shows `chars`
 * characters in, the pieces typed one after another.
 *
 * @param {string[]} texts
 * @param {number} chars  characters typed so far
 * @returns {number[]} for each piece, how many of its characters show
 */
export function typedSplit(texts, chars) {
    let left = Math.max(0, Math.floor(chars));
    return texts.map(t => {
        const n = Math.min(left, [...t].length);
        left -= n;
        return n;
    });
}

/** ms per typed character (GREETING.md principle 7): the kit types at it, adapters time by it. */
export const TYPE_MS = 28;

/**
 * @param {string[]} texts
 * @param {number} msPerChar
 * @returns {number} ms to type them all
 */
export function typingMs(texts, msPerChar) {
    return texts.reduce((n, t) => n + [...t].length, 0) * msPerChar;
}
const LIGHTS = new Set(['off', 'missed', 'waiting']);

// INDICATORS.md: state colours belong to the light/dot slots, never to a keyline.
const RESERVED = new Set(['#ef9f27', '#e24b4a', '#f0997b', '#5dcaa5', '#3a3a3a']);
// 'eq' the moving equaliser; 'eq-paused' its bars stopped low, a near flat line (media
// paused, 2026-11-07, Ethan: replaced ⏸)
const GLYPHS = new Set(['eq', 'eq-paused']);
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
        if (pose) {
            // `hello`: wave for HELLO_MS, then idle (the greeting, GREETING.md §6); `size`:
            // Bu's px in expanded, a multiple of his 10 cells, 20–100 (as tall as the text)
            const size = Number.isInteger(e.size) && e.size % 10 === 0 && e.size >= 20 && e.size <= 100 ? e.size : null;
            return {type: 'mascot', pose, ...e.hello === true ? {hello: true} : {}, ...size ? {size} : {}};
        }
        return icon(e.icon) ?? (leading ? {type: 'mascot', pose: 'idle'} : null);
    }
    // art: a file path or URI (album art), or a Gio.Icon from the source (a copied image's
    // bytes, clipboard 2026-11-06)
    const artIcon = e.art !== null && typeof e.art === 'object' && !isPlain(e.art) ? e.art : null;
    const art = artIcon ? null : str(e.art);
    if (art || artIcon) {
        const fb = icon(e.icon);
        return {
            type: 'art', ...artIcon ? {gicon: artIcon} : {src: art},
            fallback: fb?.type === 'icon' ? fb.icon ?? null : null,
        };
    }
    const ic = icon(e.icon);
    if (ic)
        return ic;
    if (isNum(e.progress))
        return {type: 'ring', value: clamp01(e.progress)};
    if (isNum(e.bar)) {
        // a level (hud): its number beside it, dimmed when off (muted), SPEC §2e
        const label = str(e.label);
        return {
            type: 'bar', value: clamp01(e.bar),
            ...label ? {label} : {}, ...e.off === true ? {off: true} : {},
        };
    }
    if (isNum(e.countdown))
        return {type: 'text', text: clock(e.countdown)};
    if (isNum(e.until))
        return {type: 'until', at: e.until};
    if (isNum(e.since))
        return {type: 'since', at: e.since};
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

// The leading zone and the light's edge slot, the same with Bu leading (its lamp is the
// pose's, 2026-11-08). A stale activity's Bu is `stale`.
function leadingAndLight(v, light, {stale = false} = {}) {
    const leading = element(v, {leading: true});
    const slot = lightSlot(light, {idle: false});
    if (leading?.type === 'mascot' && stale)
        return {leading: {...leading, pose: 'stale'}, light: slot};
    return {leading, light: slot};
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
    const lead = leadingAndLight(p.leading, light, {stale: p.isStale === true});
    const trailing = element(p.trailing);
    return {
        leading: lead.leading,
        text: side && (lead.leading || trailing) ? null : str(p.text),
        trailing,
        // `minimalAction: false`: the buttons live in the compact (media, 2026-11-05)
        action: p.minimalAction === false ? null : actions(p.actions, MAX_ACTIONS.minimal)[0] ?? null,
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
    if (isPlain(c.card))
        return planCard(c.card, p, light);
    const lead = leadingAndLight(c.leading, light, {stale: p.isStale === true});
    const plan = {
        leading: lead.leading,
        text: str(c.text),
        subtitle: str(c.subtitle),
        trailing: element(c.trailing),
        actions: c.transport === true ? actions(p.actions, MAX_ACTIONS.compact) : [],
        ...progressOf(c.progress),
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

/** A card's body: at most this many lines, then … (ui/present/compact.js, via its max height). */
export const MAX_CARD_LINES = 2;

// compact.card (NOTIFICATIONS.md §3): the plan keeps the compact's fields (empty) so code
// reading any compact plan finds them; `card` holds what the card draws.
function planCard(c, p, light) {
    const header = {icon: element(c.icon), text: str(c.app), at: isNum(c.at) ? c.at : null};
    const title = str(c.title);
    const body = str(c.body);
    if (!header.text && !title && !body)
        return null;
    const el = element(c.picture);
    return {
        card: {
            header, title, body,
            picture: el && el.type !== 'text' ? el : null,
            close: str(c.close),
        },
        leading: null, text: null, subtitle: null, trailing: null,
        actions: actions(p.actions, MAX_ACTIONS.compact),
        progress: null, live: null, rows: [], tall: false,
        keyline: keyline(p.keyline),
        stale: p.isStale === true,
        light: lightSlot(light, {idle: false}),
    };
}

export const MAX_ROWS = 3;

// A static fraction, or a live position (media): its fraction when read, and `live` for
// the renderer to run it on.
function progressOf(v) {
    if (isNum(v))
        return {progress: clamp01(v), live: null};
    if (!isPlain(v) || !isNum(v.length) || v.length <= 0 || !isNum(v.position))
        return {progress: null, live: null};
    const live = {
        position: Math.max(0, Math.min(v.position, v.length)), length: v.length,
        at: isNum(v.at) ? v.at : 0, playing: v.playing === true,
    };
    return {progress: live.position / live.length, live};
}

/**
 * Where a live position is now: it runs from `at` while playing, never past the end.
 *
 * @param {{position: number, length: number, at: number, playing: boolean}} live  ms
 * @param {number} now  ms since the epoch
 * @returns {number} ms
 */
export function livePosition(live, now) {
    const run = live.playing && live.at > 0 ? Math.max(0, now - live.at) : 0;
    return Math.min(live.length, live.position + run);
}

/**
 * @param {number} position  ms
 * @param {number} length  ms
 * @returns {[string, string]} elapsed and remaining, `1:32` and `−2:09` (as Notchy, GNOME)
 */
export function mediaTimes(position, length) {
    return [clock(position / 1000), `\u2212${clock(Math.max(0, length - position) / 1000)}`];
}

/**
 * @param {number} at  ms since the epoch
 * @param {number} now
 * @returns {string} the time since `at` in minutes: `<1 min`, `4 min`, `1 h 5 min`, `2 h`
 */
export function sinceText(at, now) {
    const min = Math.floor(Math.max(0, now - at) / 60000);
    if (min < 1)
        return '<1 min';
    if (min < 60)
        return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * A card's time (NOTIFICATIONS.md §3): as GNOME's banner, "now" for the first minute.
 *
 * @param {number} at  ms since the epoch
 * @param {number} now
 * @returns {string} "now", "3 min", "1 h 5 min"
 */
export function agoText(at, now) {
    return now - at < 60000 ? 'now' : sinceText(at, now);
}

/**
 * @param {number} at  ms since the epoch
 * @param {number} now
 * @returns {string} what is left, `0:29` — never negative
 */
export function untilText(at, now) {
    return clock(Math.max(0, at - now) / 1000);
}

function rows(list) {
    if (!Array.isArray(list))
        return [];
    return list
        .filter(r => isPlain(r) && str(r.text))
        .slice(0, MAX_ROWS)
        .map(r => ({icon: icon(r.icon), text: str(r.text), detail: str(r.detail)}));
}

function region(r, name) {
    if (isPlain(r) && 'mascot' in r)  // Bu leads only
        return name === 'leading' ? leadingAndLight(r, null).leading : element(r);
    if (isPlain(r)) {
        if (r.transport === true)
            return {type: 'actions'};
        const title = str(r.title), subtitle = str(r.subtitle);
        // `lines`: more lines under them (the greeting's basics, at most MAX_LINES);
        // `typed`: the text types itself in (GREETING.md principle 7); `hero`: a larger title
        const lines = Array.isArray(r.lines) ? r.lines.map(str).filter(Boolean).slice(0, MAX_LINES) : [];
        if (title || subtitle || lines.length) {
            return {
                type: 'block', title, subtitle, bar: isNum(r.progress) ? clamp01(r.progress) : null,
                ...lines.length ? {lines} : {}, ...r.typed === true ? {typed: true} : {},
                ...r.hero === true ? {hero: true} : {},
            };
        }
    }
    return element(r);
}

/**
 * Expanded is an enlarged minimal (CONTRACT.md §2): regions the adapter leaves out fall
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
        // island holds the keyboard (kit/model/keys.js)
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

/**
 * print adapter (FEATURES M4 "Print job progress"; design/compact "Lệnh in", 2026-11-23, Ethan).
 * Pure: the source reads CUPS's signals (model.js).
 *
 * Event: {what: 'printing', name, printer, pages, waiting, more, shared, open}  the job the pill shows
 *        {what: 'printed' | 'cancelled', name, printer, pages, shared, open}    a flash
 *        {what: 'failed', name, printer, reason, stopped, shared, open, dismiss}  a card that stays
 *        {what: 'problem', printer, reason, waiting, open, dismiss}             the printer stopped by it
 *        {what: 'low', printer, reason, open}                                   a flash
 *   reason   REASONS' text ("Out of Paper"), or ''
 *   open()   Settings → Printers; dismiss() its pill goes
 */
import {pagesText} from './model.js';

export const OPEN = 'open';
export const DISMISS = 'dismiss';
export const TTL = 3000;
const ICON = 'printer-symbolic';

const docOf = ev => ev.shared === true || typeof ev.name !== 'string' || !ev.name.trim() ? 'Document' : ev.name.trim();
const printerOf = ev => typeof ev.printer === 'string' && ev.printer.trim() ? ev.printer.trim() : 'Printer';
const OPEN_ACTION = {id: OPEN, label: 'Printers'};

function flash(text, trailing = null, open = null) {
    return {leading: ICON, text, trailing, sizeHint: 'wide', ttl: TTL, compact: null, expanded: null, actions: [], onPress: open};
}

// a card that stays (design/compact "Lệnh in", 2, 3): Printers, ×
function staying(ev, title, line, {main = false} = {}) {
    return {
        leading: ICON,
        text: title,
        trailing: null,
        compact: {
            card: {icon: null, picture: {icon: ICON, backdrop: true}, title, app: line, at: null, body: null, close: DISMISS, actionsOnHover: false, tight: true},
        },
        expanded: null,
        actions: [{...OPEN_ACTION, ...main ? {main: true} : {}}],
        minimalAction: false,
        ttl: 0,
        pressFirst: true,
        onPress: ev.open ?? null,
        onAction: id => {
            if (id === OPEN)
                ev.open?.();
            else if (id === DISMISS)
                ev.dismiss?.();
        },
    };
}

function printing(ev) {
    const doc = docOf(ev);
    const more = Number.isInteger(ev.more) && ev.more > 0 ? ev.more : 0;
    let state = null;
    if (ev.waiting === true)
        state = 'Waiting';
    else if (ev.pages > 0)
        state = `Page ${ev.pages}`;
    let trailing = null;
    if (more)
        trailing = {text: `+${more}`};
    else if (state)
        trailing = {text: state};
    return {
        leading: ICON,
        text: doc,
        trailing,
        compact: {
            card: {icon: null, picture: {icon: ICON, backdrop: true}, title: doc, app: [printerOf(ev), state].filter(Boolean).join(' · '), at: null, body: null, close: null, actionsOnHover: false, tight: true},
        },
        expanded: null,
        actions: [OPEN_ACTION],
        minimalAction: false,
        // it stays while the job does (the source ends it)
        ttl: 0,
        pressFirst: true,
        onPress: ev.open ?? null,
        onAction: id => id === OPEN && ev.open?.(),
    };
}

export default {
    print(ev) {
        let out;
        switch (ev.what) {
        case 'printing':
            out = printing(ev);
            break;
        case 'printed':
            out = flash(`Printed ${docOf(ev)}`, ev.pages > 0 ? {text: pagesText(ev.pages)} : null, ev.open ?? null);
            break;
        case 'cancelled':
            out = flash(`Cancelled ${docOf(ev)}`, null, ev.open ?? null);
            break;
        case 'failed': {
            const title = ev.stopped === true ? 'Printing Stopped' : `Couldn't Print ${docOf(ev)}`;
            const line = [printerOf(ev), ev.stopped === true ? docOf(ev) : null, ev.reason || null].filter(Boolean).join(' · ');
            out = staying(ev, title, line, {main: true});
            break;
        }
        case 'problem':
            out = staying(ev, ev.reason || 'Printer Error',
                [printerOf(ev), ev.waiting ? `${docOf({...ev, name: ev.waiting})} waiting` : null].filter(Boolean).join(' · '));
            out.trailing = {text: printerOf(ev)};
            break;
        case 'low':
            out = flash(ev.reason || 'Printer', {text: printerOf(ev)}, ev.open ?? null);
            break;
        default:
            return null;
        }
        return {...out, attributes: {what: ev.what, doc: ev.shared === true ? '' : ev.name ?? '', printer: printerOf(ev)}};
    },
};

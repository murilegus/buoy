/**
 * The two texts EDS gives, pure: an event's iCalendar (RFC 5545) and a source's key file. Shared by
 * the meeting's link (meeting.js) and the event's page (details.js).
 */

// --- iCalendar -----------------------------------------------------------------------------------

/**
 * @param {string} line  an unfolded content line
 * @returns {{name: string, params: Record<string, string>, value: string}}
 */
function contentLine(line) {
    // the name and its parameters end at the first ':' outside quotes (RFC 5545 §3.1)
    let i = 0, quoted = false;
    for (; i < line.length; i++) {
        const c = line[i];
        if (c === '"')
            quoted = !quoted;
        else if (c === ':' && !quoted)
            break;
    }
    const head = line.slice(0, i), value = line.slice(i + 1);
    const [name, ...rest] = head.match(/(?:[^;"]|"[^"]*")+/g) ?? [''];
    /** @type {Record<string, string>} */
    const params = {};
    for (const p of rest) {
        const eq = p.indexOf('=');
        if (eq > 0)
            params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"(.*)"$/, '$1');
    }
    return {name: name.toUpperCase(), params, value};
}

/** @param {string} v  a TEXT value @returns {string} unescaped (RFC 5545 §3.3.11) */
export function unescapeText(v) {
    // one pass: an escaped backslash then n is a backslash and n, not a new line
    return v.replace(/\\([nN,;\\])/g, (_, c) => c === 'n' || c === 'N' ? '\n' : c);
}

/**
 * The first VEVENT of an iCalendar text: its own properties, and its VALARMs' apart.
 *
 * @param {*} ics
 * @returns {{props: object[], alarms: object[][]}}  each property {name, params, value}, raw
 */
export function parseEvent(ics) {
    const out = {props: [], alarms: []};
    if (typeof ics !== 'string')
        return out;
    const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    let depth = 0, alarm = null;
    for (const l of lines) {
        const up = l.toUpperCase();
        if (up.startsWith('BEGIN:')) {
            if (depth || up === 'BEGIN:VEVENT')
                depth++;
            if (depth === 2 && up === 'BEGIN:VALARM')
                out.alarms.push(alarm = []);
            continue;
        }
        if (up.startsWith('END:') && depth) {
            depth--;
            if (depth === 1)
                alarm = null;
            if (!depth)
                break;
            continue;
        }
        if (depth === 1)
            out.props.push(contentLine(l));
        else if (depth === 2 && alarm)
            alarm.push(contentLine(l));
    }
    return out;
}

/**
 * @param {*} data  an EDS source's key file (org.gnome.evolution.dataserver.Source `Data`)
 * @returns {Record<string, Record<string, string>>} its sections, each key → value
 */
export function keyFile(data) {
    /** @type {Record<string, Record<string, string>>} */
    const sections = {};
    let at = null;
    for (const line of typeof data === 'string' ? data.split('\n') : []) {
        const head = /^\[(.+)\]\s*$/.exec(line);
        if (head) {
            at = sections[head[1]] = {};
            continue;
        }
        const kv = /^([\w-]+)=(.*)$/.exec(line);
        if (at && kv)
            at[kv[1]] = kv[2].trim();
    }
    return sections;
}

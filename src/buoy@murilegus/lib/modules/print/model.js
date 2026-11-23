/**
 * Print jobs (FEATURES M4 "Print job progress"; design/compact "Lệnh in", 2026-11-23, Ethan), pure:
 * CUPS's D-Bus signals read (cups notifier/dbus.c, org.cups.cupsd.Notifier on the system bus),
 * the jobs kept, the printer's problems. No Gio: source.js listens.
 */

/** IPP job-state (RFC 8011 §5.3.7). */
export const JOB = Object.freeze({PENDING: 3, HELD: 4, PROCESSING: 5, STOPPED: 6, CANCELED: 7, ABORTED: 8, COMPLETED: 9});

/** The job signals: (text, printer-uri, printer-name, printer-state, printer-state-reasons,
 *  printer-is-accepting-jobs, job-id, job-state, job-state-reasons, job-name, job-impressions-completed). */
export const JOB_SIGNALS = new Set(['JobCreated', 'JobState', 'JobCompleted', 'JobStopped', 'JobProgress', 'JobConfigChanged']);
/** The printer signals: (text, printer-uri, printer-name, printer-state, printer-state-reasons, accepting). */
export const PRINTER_SIGNALS = new Set(['PrinterStateChanged', 'PrinterStopped', 'PrinterRestarted', 'PrinterShutdown', 'PrinterModified']);

/**
 * A printer's problems in the words GNOME uses (gsd print-notifications, as system-config-printer):
 * `stop` ones stop the printing and stay till they clear; `low` ones are a flash, once.
 * connecting-to-device is left out: a network printer says it each time it connects.
 */
export const REASONS = Object.freeze({
    'media-empty': {text: 'Out of Paper', stop: true},
    'media-jam': {text: 'Paper Jam', stop: true},
    'cover-open': {text: 'Cover Open', stop: true},
    'door-open': {text: 'Door Open', stop: true},
    'toner-empty': {text: 'Out of Toner', stop: true},
    'marker-supply-empty': {text: 'Out of Ink', stop: true},
    'offline': {text: 'Printer Offline', stop: true},
    'cups-missing-filter': {text: 'Printer Configuration Error', stop: true},
    'toner-low': {text: 'Toner Low', stop: false},
    'marker-supply-low': {text: 'Ink Low', stop: false},
    'media-low': {text: 'Paper Low', stop: false},
});

/**
 * @param {*} name  a signal's name
 * @param {*} params  its parameters, unpacked
 * @returns {?object} {kind: 'job', printer, printerReasons, id, state, reasons: string[], name, pages} |
 *   {kind: 'printer', printer, reasons: string[]} | null (another signal, or malformed)
 */
export function readSignal(name, params) {
    if (!Array.isArray(params))
        return null;
    const str = v => typeof v === 'string' ? v : '';
    if (JOB_SIGNALS.has(name)) {
        if (params.length < 11 || !Number.isInteger(params[6]) || !Number.isInteger(params[7]))
            return null;
        return {
            kind: 'job', printer: str(params[2]), printerReasons: reasonsOf(params[4]), id: params[6], state: params[7],
            reasons: reasonsOf(params[8]), name: str(params[9]).trim(),
            pages: Number.isInteger(params[10]) && params[10] > 0 ? params[10] : 0,
        };
    }
    if (PRINTER_SIGNALS.has(name)) {
        if (params.length < 5 || !str(params[2]))
            return null;
        return {kind: 'printer', printer: str(params[2]), reasons: reasonsOf(params[4])};
    }
    return null;
}

/**
 * @param {*} text  printer- or job-state-reasons: a comma list, IPP's severity suffixes on some
 *   ("media-empty-error", "toner-low-report")
 * @returns {string[]} the keywords, without the suffixes nor "none"
 */
export function reasonsOf(text) {
    if (typeof text !== 'string')
        return [];
    return [...new Set(text.split(',').map(r => r.trim().replace(/-(report|warning|error)$/, '')).filter(r => r && r !== 'none'))];
}

/**
 * @param {string[]} reasons  reasonsOf
 * @returns {{stop: string[], low: string[]}} the known problems, the stopping ones and the low ones
 */
export function problemsOf(reasons) {
    const known = reasons.filter(r => REASONS[r]);
    return {stop: known.filter(r => REASONS[r].stop), low: known.filter(r => !REASONS[r].stop)};
}

/**
 * @param {{state: number, reasons: string[]}} job
 * @returns {boolean} held for a password: GNOME's notification asks for it, not Buoy
 */
export function needsPassword(job) {
    return job.state === JOB.HELD && job.reasons.some(r => r.startsWith('cups-held-for-authentication') || r === 'auth-info-required');
}

/**
 * @param {number} state
 * @returns {boolean} the job is over (completed, canceled, aborted)
 */
export function isOver(state) {
    return state === JOB.COMPLETED || state === JOB.CANCELED || state === JOB.ABORTED;
}

/**
 * The job the pill shows: the one printing, else the oldest waiting.
 *
 * @param {Map<number, object>} jobs  id → job, as kept (not over)
 * @returns {?object}
 */
export function shownJob(jobs) {
    const list = [...jobs.values()].filter(j => !isOver(j.state) && j.state !== JOB.STOPPED && !needsPassword(j));
    return list.find(j => j.state === JOB.PROCESSING) ?? list.sort((a, b) => a.id - b.id)[0] ?? null;
}

/**
 * @param {number} n
 * @returns {string} "1 page", "3 pages"
 */
export function pagesText(n) {
    return `${n} page${n === 1 ? '' : 's'}`;
}

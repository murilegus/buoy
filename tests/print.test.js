// Run: gjs -m tests/print.test.js   (pure: FEATURES M4 "Print job progress"; design/compact "Lệnh in")
import adapter, {DISMISS, OPEN, TTL} from '../src/buoy@murilegus/lib/modules/print/adapter.js';
import {JOB, REASONS, isOver, needsPassword, pagesText, problemsOf, readSignal, reasonsOf, shownJob}
    from '../src/buoy@murilegus/lib/modules/print/model.js';
import {printShows} from '../src/buoy@murilegus/lib/modules/notification/adapter.js';
import {planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {PRIORITY, tierOf, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

eq(PRIORITY.print, PRIORITY.progress, 'as a transfer');
eq(TTL, 3000, 'a flash is 3 s');

// --- CUPS's signals (notifier/dbus.c) -------------------------------------------------------------------
const job = (state, {reasons = 'job-printing', name = 'Báo cáo quý 3.pdf', pages = 0, printerReasons = 'none', id = 12} = {}) =>
    ['Job state changed', 'ipp://localhost/printers/HP', 'HP_LaserJet_M15', 4, printerReasons, true, id, state, reasons, name, pages];
eq(readSignal('JobState', job(JOB.PROCESSING, {pages: 3})),
    {kind: 'job', printer: 'HP_LaserJet_M15', printerReasons: [], id: 12, state: 5, reasons: ['job-printing'], name: 'Báo cáo quý 3.pdf', pages: 3},
    'a job: its printer, id, state, name, pages done');
eq(readSignal('JobCreated', job(JOB.PENDING)).pages, 0, 'no pages yet');
eq(readSignal('JobCompleted', job(JOB.COMPLETED, {printerReasons: 'toner-low-report,media-empty-error'})).printerReasons, ['toner-low', 'media-empty'],
    'the printer\'s reasons ride on a job\'s signal, without IPP\'s severity');
eq(readSignal('PrinterStateChanged', ['Printer state changed', 'ipp://x', 'HP_LaserJet_M15', 5, 'media-jam-error', false]),
    {kind: 'printer', printer: 'HP_LaserJet_M15', reasons: ['media-jam']}, 'a printer: its name, its reasons');
eq([readSignal('ServerStarted', ['x']), readSignal('JobState', ['short']), readSignal('JobState', null),
    readSignal('PrinterStateChanged', ['x', 'u', '', 3, 'none', true])], [null, null, null, null], 'other signals, malformed ones: nothing');
eq([reasonsOf('none'), reasonsOf(''), reasonsOf(null), reasonsOf('offline-report, offline-report,door-open')], [[], [], [], ['offline', 'door-open']],
    'reasons: none, empty, twice');
eq(problemsOf(['media-empty', 'toner-low', 'connecting-to-device', 'other']), {stop: ['media-empty'], low: ['toner-low']},
    'stopping and low; connecting-to-device and unknown ones left out');
eq(Object.keys(REASONS).length, 11, 'the reasons GNOME words, but connecting and "other"');
eq([needsPassword({state: JOB.HELD, reasons: ['cups-held-for-authentication']}), needsPassword({state: JOB.HELD, reasons: ['job-hold-until-specified']}),
    needsPassword({state: JOB.PROCESSING, reasons: ['cups-held-for-authentication']})], [true, false, false], 'held for a password: GNOME\'s');
eq([3, 5, 6, 7, 8, 9].map(isOver), [false, false, false, true, true, true], 'over: completed, canceled, aborted');
const jobs = new Map([[14, {id: 14, state: JOB.PENDING}], [12, {id: 12, state: JOB.PENDING}], [13, {id: 13, state: JOB.PROCESSING}]]);
eq(shownJob(jobs).id, 13, 'the pill shows the job printing');
jobs.delete(13);
eq(shownJob(jobs).id, 12, 'else the oldest waiting');
eq(shownJob(new Map([[1, {id: 1, state: JOB.HELD, reasons: ['cups-held-for-authentication']}], [2, {id: 2, state: JOB.STOPPED, reasons: []}]])), null,
    'held for a password, stopped: not the pill');
eq([pagesText(1), pagesText(3)], ['1 page', '3 pages'], 'pages');

// --- the adapter ------------------------------------------------------------------------------------------
const did = [];
const base = {name: 'Báo cáo quý 3.pdf', printer: 'HP LaserJet M15', open: () => did.push('open'), dismiss: () => did.push('x')};
const p = adapter.print({...base, what: 'printing', pages: 3, waiting: false, more: 0});
eq([p.leading, p.text, p.trailing, p.ttl, p.compact.card.title, p.compact.card.app, p.actions],
    ['printer-symbolic', 'Báo cáo quý 3.pdf', {text: 'Page 3'}, 0, 'Báo cáo quý 3.pdf', 'HP LaserJet M15 · Page 3', [{id: OPEN, label: 'Printers'}]],
    'printing: the document, "Page 3", stays; the card names the printer, Printers');
eq(adapter.print({...base, what: 'printing', pages: 0, waiting: false}).trailing, null, 'no pages known: nothing at the end');
eq(adapter.print({...base, what: 'printing', pages: 0, waiting: true}).trailing, {text: 'Waiting'}, 'waiting');
eq(adapter.print({...base, what: 'printing', pages: 3, more: 1}).trailing, {text: '+1'}, 'another job: "+1"');
eq(adapter.print({...base, what: 'printing', shared: true}).text, 'Document', 'screen shared: no document name');
const done = adapter.print({...base, what: 'printed', pages: 3});
eq([done.text, done.trailing, done.ttl], ['Printed Báo cáo quý 3.pdf', {text: '3 pages'}, 3000], 'printed: a flash with its pages');
eq(adapter.print({...base, what: 'printed', pages: 0}).trailing, null, 'printed, pages unknown');
eq(adapter.print({...base, what: 'cancelled'}).text, 'Cancelled Báo cáo quý 3.pdf', 'cancelled: a flash');
const f = adapter.print({...base, what: 'failed', stopped: false, reason: 'Out of Paper'});
eq([f.text, f.compact.card.app, f.ttl, f.actions[0].main, f.compact.card.close], ['Couldn\'t Print Báo cáo quý 3.pdf', 'HP LaserJet M15 · Out of Paper', 0, true, DISMISS],
    'aborted: a card that stays, Printers (cream), ×');
eq(adapter.print({...base, what: 'failed', stopped: true, reason: ''}).compact.card.title, 'Printing Stopped', 'stopped');
const pr = adapter.print({...base, what: 'problem', reason: 'Out of Paper', waiting: 'Báo cáo quý 3.pdf'});
eq([pr.text, pr.trailing, pr.compact.card.app, pr.ttl], ['Out of Paper', {text: 'HP LaserJet M15'}, 'HP LaserJet M15 · Báo cáo quý 3.pdf waiting', 0],
    'the printer stopped: its problem, the job waiting');
const lo = adapter.print({...base, what: 'low', reason: 'Toner Low'});
eq([lo.text, lo.trailing, lo.ttl], ['Toner Low', {text: 'HP LaserJet M15'}, 3000], 'low: a flash');
f.onPress();
f.onAction(OPEN);
f.onAction(DISMISS);
eq(did, ['open', 'open', 'x'], 'a click and Printers open Settings → Printers; × dismisses');
eq(adapter.print({what: 'nope'}), null, 'an unknown event: nothing');

// --- gsd's notifications while it shows ---------------------------------------------------------------------
const act = {attributes: {printer: 'HP LaserJet M15', doc: 'Báo cáo quý 3.pdf'}};
eq([printShows('gnome-printers-panel', '“Báo cáo quý 3.pdf” on HP LaserJet M15', 0, act),
    printShows('gnome-printers-panel', 'Printer “HP LaserJet M15” is out of paper.', 0, act),
    printShows('gnome-printers-panel', '“Báo cáo quý 3.pdf” on HP LaserJet M15', 1, act),
    printShows('gnome-printers-panel', 'Printer “Canon” added', 0, act),
    printShows('firefox', '“Báo cáo quý 3.pdf”', 0, act),
    printShows('gnome-printers-panel', '“x” on HP LaserJet M15', 0, null)],
[true, true, false, false, false, false], 'gsd\'s on the same job or printer: Buoy says it; with a button (a password), another printer, another app: GNOME\'s');

// --- through the kit ---------------------------------------------------------------------------------------------
const a = validate({...p, id: 'print:printing', kind: 'print', source: 'print'});
eq([tierOf(a), planMinimal(a).text, planCompact(a)?.card?.title], [2, 'Báo cáo quý 3.pdf', 'Báo cáo quý 3.pdf'], 'minimal and compact');

print('print: ok');

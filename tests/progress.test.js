// Run: gjs -m tests/progress.test.js   (no Shell needed; adapters are pure)
import adapter, {
    DONE_TTL, DONE_AT, BACKGROUND_STALE, appIdOf, applyUpdate, transition, countText, percent, appSignal,
    DOWNLOADED_TTL, DOWNLOAD_STALE, MAX_FOLDERS, partialOf, ownerOf, renameOf, nextRate, sizeText, speedText,
    ringFor, downloadedDetail, watchedFolders,
} from '../src/buoy@murilegus/lib/modules/progress/adapter.js';
import {
    DoneHistory, KEEP_MS, MAX_DONE, KEEP_DOWNLOADS_MS, MAX_DOWNLOADS, downloadHistory,
} from '../src/buoy@murilegus/lib/modules/progress/history.js';
import {planMinimal, planCompact} from '../src/buoy@murilegus/lib/kit/presentation.js';
import {validate} from '../src/buoy@murilegus/lib/kit/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// --- the app, from the signal's app_uri (as Ubuntu Dock's launcherAPI.js) ------------------
eq(appIdOf('application://org.gnome.Nautilus.desktop'), 'org.gnome.Nautilus.desktop', 'application:// scheme dropped');
eq(appIdOf('google-chrome.desktop'), 'google-chrome.desktop', 'no scheme: as is');
eq(appIdOf('//x.desktop'), 'x.desktop', 'a bare // dropped');
eq([appIdOf(''), appIdOf(null), appIdOf(7)], [null, null, null], 'nothing usable: null');

// --- LauncherEntry properties: only the known ones, typed, clamped -------------------------
{
    const e = applyUpdate(undefined, {'progress': 0.4, 'progress-visible': true});
    eq(e, {progress: 0.4, progressVisible: true, count: 0, countVisible: false, urgent: false},
        'defaults as libunity\'s, with what was sent');
    const f = applyUpdate(e, {'progress': 0.55});
    eq([f.progress, f.progressVisible], [0.55, true], 'a later update keeps what it does not send');
    eq(e.progress, 0.4, 'the old entry is not changed');
    eq(applyUpdate(e, {'progress': 1.7}).progress, 1, 'progress clamped to 1');
    eq(applyUpdate(e, {'progress': -1}).progress, 0, 'and to 0');
    eq(applyUpdate(e, {'progress': 'x', 'count': 2.5, 'urgent': 'yes'}), e, 'wrong types ignored');
    eq(applyUpdate(e, {'count': 2, 'count-visible': true}).count, 2, 'a count');
    eq(applyUpdate(e, {'quicklist': '/menu', 'updating': true}), e, 'other keys ignored');
}

// --- transitions: start, update, done (≥ DONE_AT), stop -----------------------------------
const run = p => ({progress: p, progressVisible: true, count: 0, countVisible: false, urgent: false});
const idle = p => ({...run(p), progressVisible: false});
eq(transition(undefined, run(0.1)), 'start', 'first visible progress: start');
eq(transition(idle(0), run(0.1)), 'start', 'visible again: start');
eq(transition(run(0.1), run(0.2)), 'update', 'progress moves: update');
eq(transition(run(0.2), run(0.2)), null, 'nothing changed: nothing');
eq(transition(run(0.995), idle(0.995)), 'done', 'hidden at the end: done');
eq(transition(run(1), idle(0)), 'done', 'Files resets to 0 as it hides: the last seen was the end');
eq(transition(run(0.4), idle(0.4)), 'stop', 'hidden half way (cancelled): stop, no Done');
eq(transition(run(0.4), null), 'stop', 'the app went away: stop');
eq(transition(undefined, idle(0)), null, 'never ran: nothing');
eq(DONE_AT, 0.99, 'Done from 99 %');

// --- the pill -------------------------------------------------------------------------------
eq([percent(0), percent(0.555), percent(1)], [0, 56, 100], 'percent rounds');
eq([countText(0, true, 'x'), countText(2, false, 'x'), countText(2, true, 'nautilus'),
    countText(1, true, 'nautilus'), countText(3, true, 'chrome')],
[null, null, '2 items', '1 item', '3 downloads'], 'count only when visible; downloads for browsers');
{
    const focused = [];
    const ev = {
        id: 'org.gnome.Nautilus.desktop', slug: 'org.gnome.Nautilus', name: 'Files', icon: 'org.gnome.Nautilus',
        progress: 0.55, count: 0, countVisible: false, phase: 'running', focus: () => focused.push(1),
    };
    const p = adapter.progress(ev, null);
    eq(p.leading, {progress: 0.55}, 'minimal: a ring with the fraction');
    eq(p.text, 'Files', 'the app\'s name');
    eq(p.trailing, {text: '55%'}, 'and its percentage');
    eq(p.ttl, 0, 'running: until it ends');
    eq(p.compact, {leading: {icon: 'org.gnome.Nautilus'}, text: 'Files', subtitle: '55%', progress: 0.55},
        'compact: the app icon, name, percentage and a bar');
    p.onPress();
    eq(focused.length, 1, 'click: focus the app');
    const m = planMinimal(validate({id: 'progress:x:y', kind: 'progress', ...p}));
    eq([m.leading.type, m.text, m.trailing.text], ['ring', 'Files', '55%'], 'planned');
    eq(planCompact(validate({id: 'progress:x:y', kind: 'progress', ...p})).progress, 0.55, 'the compact bar');
    eq(adapter.progress({...ev, count: 2, countVisible: true, slug: 'chrome', name: 'Chrome'}, null).compact.subtitle,
        '2 downloads · 55%', 'a visible count in the compact');
    const d = adapter.progress({...ev, phase: 'done', progress: 1}, null);
    eq([d.leading, d.text, d.trailing, d.ttl, d.compact], [{icon: 'object-select-symbolic'}, 'Files · Done', null, DONE_TTL, null],
        'done: a tick, "Done", a short ttl, no compact');
    eq(DONE_TTL > 0 && DONE_TTL <= 3000, true, 'Done is brief');
    const keys = ['leading', 'text', 'trailing', 'compact', 'ttl', 'onPress'];
    for (const x of [p, d])
        eq(keys.filter(k => !(k in x)), [], 'every field set: the pill is updated in place');
    eq(adapter.progress({...ev, name: ''}, null).text, 'org.gnome.Nautilus', 'no name: the app id');
    eq(adapter.progress({...ev, focus: undefined}, null).onPress, null, 'no app to focus: no onPress');
    const long = 'A File Manager With A Very Long Display Name For Testing';
    eq(adapter.progress({...ev, name: long}, null).text, long, 'long name kept whole');
    if (/"(width|height|w|h|px|size)":/.test(JSON.stringify(p)))
        throw new Error('progress: no measurements in the adapter');
}

// --- an app's own notifications: Files goes on in the background, then is done -----------
eq(appSignal('org.gnome.Nautilus.desktop', 'progress'), 'background',
    'Files closed mid-operation ("N file operations active"): it stops sending LauncherEntry');
eq(appSignal('org.gnome.Nautilus.desktop', 'transfer-complete'), 'done', '"All file operations have been completed"');
eq(appSignal('org.gnome.Nautilus.desktop', 'other'), null, 'another Files notification: nothing');
eq(appSignal('google-chrome.desktop', 'progress'), null, 'another app\'s "progress" id means nothing');
eq([appSignal(null, 'progress'), appSignal('org.gnome.Nautilus.desktop', null)], [null, null], 'missing: nothing');
{
    const b = adapter.progress({
        id: 'org.gnome.Nautilus.desktop', slug: 'nautilus', name: 'Files', icon: 'org.gnome.Nautilus',
        progress: 0.11, count: 0, countVisible: false, phase: 'background', focus: () => {},
    }, null);
    eq([b.leading, b.text, b.trailing], [{icon: 'org.gnome.Nautilus'}, 'Files · in background', null],
        'background: the app icon, no ring and no % (Files sends no more numbers)');
    eq(b.compact, {leading: {icon: 'org.gnome.Nautilus'}, text: 'Files', subtitle: 'Still working in the background'},
        'compact says so');
    eq([b.ttl, b.staleAfter], [0, BACKGROUND_STALE], 'until done; dimmed if that never comes');
    eq(b.attributes.phase, 'background', 'the tab knows the phase');
    const w = adapter.progress({
        id: 'org.gnome.Nautilus.desktop', slug: 'nautilus', name: 'Files', icon: 'org.gnome.Nautilus',
        progress: 0.57, count: 0, countVisible: false, phase: 'background', windowOpen: true, focus: () => {},
    }, null);
    eq([w.text, w.trailing, w.compact.subtitle], ['Files · working', null, 'Progress shows in Files'],
        'reopened: Files does not report to the launcher again, so no % — its own window has it');
    eq(BACKGROUND_STALE, 10 * 60 * 1000, 'stale after 10 minutes');
}

// --- Done rows for the Transfers tab: kept a while, newest first --------------------------
{
    const h = new DoneHistory();
    h.add({appId: 'a.desktop', name: 'A', icon: 'a', at: 1000});
    h.add({appId: 'b.desktop', name: 'B', icon: 'b', at: 2000});
    eq(h.list(2000).map(r => r.name), ['B', 'A'], 'newest first');
    h.add({appId: 'a.desktop', name: 'A', icon: 'a', at: 3000});
    eq(h.list(3000).map(r => `${r.name}@${r.at}`), ['A@3000', 'B@2000'], 'an app done again moves up, once');
    eq(h.list(2000 + KEEP_MS).map(r => r.name), ['A'], 'older than KEEP_MS: gone');
    eq(KEEP_MS, 10 * 60 * 1000, 'kept 10 minutes');
    for (let i = 0; i < 10; i++)
        h.add({appId: `x${i}`, name: `X${i}`, icon: 'x', at: 4000 + i});
    eq(h.list(5000).length, MAX_DONE, `at most ${MAX_DONE}`);
    h.clear();
    eq(h.list(5000), [], 'cleared with the module');
}

{
    const h = new DoneHistory({keep: 1000, max: 2});
    h.add({key: '/d/a.pdf', name: 'a.pdf', at: 0});
    h.add({key: '/d/b.pdf', name: 'b.pdf', at: 10});
    h.add({key: '/d/a.pdf', name: 'a.pdf', at: 20});
    eq(h.list(20).map(r => r.name), ['a.pdf', 'b.pdf'], 'keyed rows: the same file again moves up, once');
    h.add({key: '/d/c.pdf', name: 'c.pdf', at: 30});
    eq(h.list(30).map(r => r.name), ['c.pdf', 'a.pdf'], 'its own max');
    eq(h.list(1020).map(r => r.name), ['c.pdf'], 'its own keep');
    h.remove('/d/c.pdf');
    eq(h.list(1020), [], 'remove by key (the file is gone)');
    const apps = new DoneHistory();
    apps.add({appId: 'x.desktop', at: 0});
    apps.add({key: 'x.desktop', at: 1});
    eq(apps.list(1).length, 1, 'no key: the app id is the key');
    eq([KEEP_DOWNLOADS_MS, MAX_DOWNLOADS], [60 * 60 * 1000, 5], 'Downloaded rows: an hour, at most 5');
    eq(downloadHistory.list(0), [], 'a separate store for downloads');
}

// --- downloads: partial files (SPEC §6c) ---------------------------------------------------
eq(partialOf('report.pdf.crdownload'), {final: 'report.pdf', suffix: '.crdownload', unnamed: false}, 'Chrome\'s partial file');
eq(partialOf('Unconfirmed 123456.crdownload'), {final: 'Unconfirmed 123456', suffix: '.crdownload', unnamed: true},
    'Chrome before it names the file');
eq([partialOf('Chưa xác nhận 7.crdownload').unnamed, partialOf('Non confermato 42.crdownload').unnamed], [true, true],
    'the placeholder in other languages');
eq([partialOf('Invoice 12345.pdf.crdownload').unnamed, partialOf('Unconfirmed 1234567.crdownload').unnamed,
    partialOf('Week 12.part').unnamed, partialOf('report.crdownload').unnamed], [false, false, false, false],
'a real name: with an extension, a longer number, Firefox, no number');
eq(partialOf('video.mp4.part'), {final: 'video.mp4', suffix: '.part', unnamed: false}, 'Firefox\'s partial file');
eq([partialOf('report.pdf'), partialOf('.crdownload'), partialOf('.part'), partialOf('.com.google.Chrome.ab12'),
    partialOf('.x.part'), partialOf(''), partialOf(null), partialOf('part'), partialOf('a.partial')],
[null, null, null, null, null, null, null, null, null],
'not a partial: finished files, a bare suffix, hidden temporaries, nothing');
eq(ownerOf('.crdownload', ['nautilus', 'chrome']), 'chrome', 'the running Chromium-family browser');
eq(ownerOf('.crdownload', ['brave-browser', 'chrome']), 'brave-browser', 'the first running one, in Shell\'s order');
eq(ownerOf('.part', ['chrome', 'firefox']), 'firefox', '.part: Firefox');
eq([ownerOf('.part', ['chrome']), ownerOf('.crdownload', []), ownerOf('.zip', ['chrome'])], [null, null, null],
    'no such browser running: no app (never a guess)');
eq(renameOf('a.pdf.crdownload', 'a.pdf'), 'done', 'renamed to its final name: done');
eq(renameOf('a.pdf.part', 'a.pdf'), 'done', 'Firefox: over its placeholder');
eq(renameOf('a.pdf.crdownload', 'other.pdf'), 'done', 'to any finished name: done');
eq(renameOf('Unconfirmed 1.crdownload', 'a.pdf.crdownload'), 'renamed', 'partial to partial: the same download');
eq(renameOf('a.pdf.crdownload', null), 'gone', 'moved out of the folder');
eq([renameOf('a.pdf', 'b.pdf'), renameOf('a.pdf', 'a.pdf.part')], [null, null], 'not a download');
eq(MAX_FOLDERS, 10, 'at most 10 more folders (one inotify watch each)');
eq(watchedFolders('/home/u/Downloads', ['/data/dl/', '/home/u/Downloads', 'rel/dir', '', null, '/data/dl', '/']),
    ['/home/u/Downloads', '/data/dl', '/'], 'Downloads first, each once, absolute only, no trailing slash');
eq(watchedFolders(null, ['/a']), ['/a'], 'no Downloads folder set: the others');
eq(watchedFolders('/d', 'nope'), ['/d'], 'a broken setting: Downloads alone');
eq(watchedFolders('/d', Array.from({length: 14}, (_, i) => `/f${i}`)).length, 1 + MAX_FOLDERS,
    'Downloads plus at most 10');

// --- size and speed ------------------------------------------------------------------------
eq([sizeText(0), sizeText(1), sizeText(999), sizeText(1000), sizeText(12_345_678), sizeText(1_400_000_000),
    sizeText(999_960), sizeText(-5), sizeText(NaN)],
['0 bytes', '1 byte', '999 bytes', '1.0 kB', '12.3 MB', '1.4 GB', '1.0 MB', '0 bytes', '0 bytes'],
'sizes as GLib.format_size writes them');
{
    const a = nextRate(null, 1000, 0);
    eq(a, {size: 1000, at: 0, speed: null}, 'first sample: no speed yet');
    const b = nextRate(a, 3000, 1e6);
    eq(b.speed, 2000, 'bytes per second between two samples');
    const c = nextRate(b, 3000, 2e6);
    eq(c.speed, 1000, 'smoothed: half the last, half the new (0 now)');
    eq(nextRate(c, 500, 3e6), {size: 500, at: 3e6, speed: null}, 'shrank (restarted): start again');
    eq(nextRate(b, 4000, 1e6), {size: 4000, at: 1e6, speed: 2000}, 'same instant: size taken, speed kept');
}
eq([speedText(2_100_000), speedText(0), speedText(null)], ['2.1 MB/s', null, null], 'speed only while bytes come');

// --- the ring only when one LauncherEntry covers exactly one file ---------------------------
eq(ringFor([{owner: 'chrome'}], 'chrome', 0.4), 0.4, 'one Chrome download: its fraction');
eq(ringFor([{owner: 'chrome'}, {owner: 'chrome'}], 'chrome', 0.4), null, 'two: cannot be split');
eq(ringFor([{owner: 'chrome'}, {owner: 'firefox'}], 'chrome', 0.4), 0.4, 'another browser\'s file does not count');
eq([ringFor([{owner: 'chrome'}], 'chrome', null), ringFor([{owner: null}], null, 0.4),
    ringFor([{owner: 'firefox'}], 'chrome', 0.4)], [null, null, null], 'no fraction, no owner, not its file: none');

// --- the download pills ---------------------------------------------------------------------
{
    const focused = [], opened = [];
    const ev = {
        id: '/home/u/Downloads/report.pdf.crdownload', file: true, name: 'report.pdf', folder: 'Downloads',
        app: 'Google Chrome', size: 12_345_678, speed: 2_100_000, fraction: null, phase: 'running',
        focus: () => focused.push(1), open: () => opened.push(1),
    };
    const r = adapter.progress(ev, null);
    eq([r.leading, r.text, r.trailing], [{icon: 'folder-download-symbolic'}, 'report.pdf', {text: '12.3 MB'}],
        'running: a static download icon, the name, the size — no ring, no %');
    eq(r.compact, {leading: {icon: 'folder-download-symbolic'}, text: 'report.pdf', subtitle: '12.3 MB · 2.1 MB/s'},
        'compact: size and speed, no bar');
    eq([r.ttl, r.staleAfter], [0, DOWNLOAD_STALE], 'until it ends; dimmed when bytes stop');
    eq(r.attributes, {app: 'report.pdf', count: '12.3 MB · 2.1 MB/s', phase: 'running', file: true}, 'the tab row');
    r.onPress();
    eq(focused.length, 1, 'click: the browser');
    eq(adapter.progress({...ev, speed: null}, null).compact.subtitle, '12.3 MB', 'no speed yet: the size alone');
    const unnamed = adapter.progress({...ev, name: null}, null);
    eq([unnamed.text, unnamed.compact.text, unnamed.attributes.app], ['Google Chrome', 'Google Chrome', 'Google Chrome'],
        'not named yet: the browser\'s name');
    eq(adapter.progress({...ev, name: null, app: null}, null).text, 'Download', 'neither: "Download"');
    eq(adapter.progress({...ev, focus: null}, null).onPress, null, 'no browser known: Home');
    const ring = adapter.progress({...ev, fraction: 0.4}, null);
    eq([ring.leading, ring.trailing, ring.compact.progress, ring.compact.subtitle],
        [{progress: 0.4}, {text: '40%'}, 0.4, '12.3 MB · 2.1 MB/s · 40%'], 'one LauncherEntry covers it: the ring');
    const m = planMinimal(validate({id: 'progress:chrome:x', kind: 'progress', ...r}));
    eq([m.leading.type, m.text, m.trailing.text], ['icon', 'report.pdf', '12.3 MB'], 'planned');
    eq(planCompact(validate({id: 'progress:chrome:x', kind: 'progress', ...r})).progress, null, 'no bar planned');
    const d = adapter.progress({...ev, phase: 'done', icon: 'application-pdf-symbolic'}, null);
    eq([d.leading, d.text, d.trailing, d.ttl], [{icon: 'application-pdf-symbolic'}, 'report.pdf',
        {text: '→ Downloads'}, DOWNLOADED_TTL], 'done: the file type icon, name → folder, briefly');
    eq(d.compact.subtitle, 'Downloaded to Downloads', 'compact says where');
    d.onPress();
    eq(opened.length, 1, 'click: open the file');
    eq(d.attributes.phase, 'done', 'not a Running row');
    const bare = adapter.progress({...ev, phase: 'done', folder: null, icon: null, open: null}, null);
    eq([bare.leading, bare.trailing, bare.compact.subtitle, bare.onPress],
        [{icon: 'text-x-generic-symbolic'}, null, 'Downloaded', null], 'nothing known: a generic icon, no folder');
    const keys = ['leading', 'text', 'trailing', 'compact', 'ttl', 'staleAfter', 'onPress'];
    for (const x of [r, ring, d])
        eq(keys.filter(k => !(k in x)), [], 'every field set: a download updated in place');
    const long = 'A Very Long File Name That A Browser Might Save From A Content Disposition Header.tar.gz';
    eq(adapter.progress({...ev, name: long}, null).text, long, 'long file name kept whole');
    if (/"(width|height|w|h|px|size)":/.test(JSON.stringify([r, d])))
        throw new Error('downloads: no measurements in the adapter');
}
eq(downloadedDetail('Downloads', 'Google Chrome', '14:05'), 'Downloads · Google Chrome · 14:05', 'folder · app · time');
eq(downloadedDetail('Downloads', null, '14:05'), 'Downloads · 14:05', 'no app known: left out');

print('progress: ok');

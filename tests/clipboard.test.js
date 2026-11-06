// Run: gjs -m tests/clipboard.test.js   (no Shell needed; adapters are pure)
import adapter, {
    TTL, contentOf, imageMime, filesMime, filesOf, oneLine, filesText, copiedHere,
} from '../src/buoy@murilegus/lib/modules/clipboard/adapter.js';
import {planMinimal, planCompact} from '../src/buoy@murilegus/lib/kit/presentation.js';
import {validate, FEEDBACK} from '../src/buoy@murilegus/lib/kit/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// --- whose copy: only an app's on this machine -----------------------------------------------
eq([copiedHere('MetaSelectionSourceWayland'), copiedHere('MetaSelectionSourceX11')], [true, true],
    'a Wayland or X11 app copied');
eq(copiedHere('MetaSelectionSourceMemory'), false, 'Shell set it (screenshot, a clipboard-manager extension)');
eq(copiedHere('MetaSelectionSourceRemote'), false, 'another machine (mutter-devkit host sync, RDP/VNC)');
eq([copiedHere(''), copiedHere(null)], [false, false], 'unknown owner: nothing');

// --- what was copied, by mimetype ------------------------------------------------------------
eq(contentOf(['text/plain;charset=utf-8', 'UTF8_STRING']), 'text', 'text from a GTK app');
eq(contentOf(['STRING', 'TEXT']), 'text', 'text from an old X11 app');
eq(contentOf(['text/html', 'text/plain']), 'text', 'rich text: its plain text');
eq(contentOf(['image/png', 'image/jpeg', 'text/plain']), 'image', 'an image (a browser also offers its URL as text)');
eq(contentOf(['x-special/gnome-copied-files', 'text/uri-list', 'text/plain;charset=utf-8', 'UTF8_STRING']), 'files',
    'Files copying files: not the paths as text');
eq(contentOf(['text/uri-list']), 'files', 'another file manager');
eq(contentOf(['x-kde-passwordManagerHint', 'text/plain;charset=utf-8']), 'secret',
    'a password manager\'s secret: never read');
eq(contentOf(['image/png', 'x-kde-passwordManagerHint']), 'secret', 'the hint wins over everything');
eq([contentOf([]), contentOf(null), contentOf(['application/x-foo']), contentOf([3, null])], [null, null, null, null],
    'nothing known: no pill');
eq(imageMime(['image/jpeg', 'image/png']), 'image/png', 'PNG when offered');
eq(imageMime(['image/bmp']), 'image/bmp', 'else the first image type');
eq(imageMime(['text/plain']), null, 'no image');
eq(filesMime(['text/uri-list', 'x-special/gnome-copied-files']), 'x-special/gnome-copied-files', 'Files\' own first');
eq(filesMime(['text/uri-list']), 'text/uri-list', 'a uri-list');
eq(filesMime(['text/plain']), null, 'no files');

// --- file names ------------------------------------------------------------------------------
eq(filesOf('copy\nfile:///home/u/Docs/report%202026.pdf'), ['report 2026.pdf'], 'Files: one file, decoded');
eq(filesOf('cut\nfile:///a/x.txt\nfile:///a/photos/'), ['x.txt', 'photos'], 'cut too; a folder by its name');
eq(filesOf('# comment\r\nfile:///a/b.txt\r\n\r\nfile:///a/c.txt\r\n'), ['b.txt', 'c.txt'], 'a uri-list with CRLF and comments');
eq(filesOf('file:///a/100%25%zz.txt'), ['100%25%zz.txt'], 'a broken escape: kept as it is');
eq([filesOf(''), filesOf(null), filesOf('copy')], [[], [], []], 'nothing in it');
eq([filesText(['a.pdf']), filesText(['a', 'b', 'c']), filesText([])], ['a.pdf', '3 items', null], 'one name, or a count');

// --- the snippet: one line, never cut here ----------------------------------------------------
eq(oneLine('  hello\n\tworld  \n'), 'hello world', 'whitespace collapsed to one line');
eq([oneLine(''), oneLine(' \n '), oneLine(null)], ['', '', ''], 'nothing');
{
    const long = 'x'.repeat(2000);
    eq(oneLine(long).length, 2000, 'long text kept whole (the renderer ellipsizes)');
}

// --- the pill (SPEC §2e: minimal only, ~1 s, pill 1's widest) ---------------------------------
const copied = ev => adapter.copied({id: 'clipboard', ...ev}, null);
{
    const p = copied({what: 'text', text: 'npm install\n  --save buoy'});
    eq([p.leading, p.text, p.trailing], ['edit-copy-symbolic', 'npm install --save buoy', null], 'text: copy icon + snippet');
    eq([p.ttl, p.sizeHint, p.compact, p.expanded, p.onPress], [TTL, 'wide', null, null, null],
        '1 s, as wide as pill 1 gets, no compact, no expanded, click → Home');
    eq(TTL, 1000, 'copied is 1 s');
    eq(FEEDBACK.has('copied'), true, 'a feedback kind (pill 1, never missed)');
    const m = planMinimal(validate({id: 'copied:x:clipboard', kind: 'copied', ...p}));
    eq([m.leading.type, m.leading.icon, m.text], ['icon', 'edit-copy-symbolic', 'npm install --save buoy'], 'planned');
    eq(planCompact(validate({id: 'copied:x:clipboard', kind: 'copied', ...p})), null, 'no compact planned');
}
{
    const thumb = new class FakeBytesIcon {}();
    const p = copied({what: 'image', image: thumb});
    eq(p.text, 'Image', 'an image says so');
    eq(p.leading.art, thumb, 'with its thumbnail as art');
    const m = planMinimal(validate({id: 'copied:x:clipboard', kind: 'copied', ...p}));
    eq([m.leading.type, m.leading.gicon === thumb, m.leading.fallback], ['art', true, 'image-x-generic-symbolic'],
        'planned as art from a Gio.Icon, the image icon if it cannot load');
    eq(copied({what: 'image', image: null}).leading, 'image-x-generic-symbolic', 'unreadable image: its icon');
}
eq(copied({what: 'files', files: ['report.pdf']}).text, 'report.pdf', 'one file: its name');
eq(copied({what: 'files', files: ['a', 'b']}).text, '2 items', 'several: a count');
eq(copied({what: 'files', files: []}), null, 'no names: no pill');
eq([copied({what: 'secret'}).leading, copied({what: 'secret'}).text], ['dialog-password-symbolic', 'Copied · hidden'],
    'a secret: said, never shown');
eq([copied({what: 'hidden'}).leading, copied({what: 'hidden'}).text], ['edit-copy-symbolic', 'Copied'],
    'preview off: only that something was copied');
eq([copied({what: 'text', text: ' \n '}), copied({what: 'text', text: null}), copied({what: 'nope'})], [null, null, null],
    'empty text (a password manager clearing it) or unknown: nothing');

// --- a repeat updates the one pill in place: every field set ----------------------------------
{
    const keys = ['leading', 'text', 'trailing', 'sizeHint', 'ttl', 'compact', 'expanded', 'onPress'];
    for (const p of [copied({what: 'text', text: 'a'}), copied({what: 'image', image: null}),
        copied({what: 'files', files: ['f']}), copied({what: 'secret'}), copied({what: 'hidden'})])
        eq(keys.filter(k => !(k in p)), [], `all fields set (${p.text})`);
}

// --- no measurements (ARCHITECTURE rule 11) ---------------------------------------------------
{
    const json = JSON.stringify([copied({what: 'text', text: 'a'}), copied({what: 'files', files: ['f']})]);
    if (/"(width|height|w|h|px|size)":/.test(json))
        throw new Error(`clipboard: no measurements in the adapter's output: ${json}`);
}

print('clipboard: ok');

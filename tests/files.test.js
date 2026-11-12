// Run: gjs -m tests/files.test.js   (no Shell needed)
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {readText, listNames, ppidOf} from '../src/buoy@murilegus/lib/kit/services/files.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const dir = GLib.dir_make_tmp('buoy-files-XXXXXX');
GLib.file_set_contents(`${dir}/a.txt`, 'héllo\n');
GLib.file_set_contents(`${dir}/b.json`, '{}');

// --- readText ----------------------------------------------------------------------------
eq(await readText(`${dir}/a.txt`), 'héllo\n', 'a path: its text, UTF-8');
eq(await readText(Gio.File.new_for_path(`${dir}/b.json`)), '{}', 'a Gio.File works too');
eq(await readText(`${dir}/missing`), null, 'missing → null, not a throw');
eq(await readText(dir), null, 'a folder → null');
const off = new Gio.Cancellable();
off.cancel();
eq(await readText(`${dir}/a.txt`, off), null, 'cancelled → null');
eq((await readText('/proc/self/stat'))?.includes('('), true, '/proc files read too (their size is 0)');

// --- listNames ---------------------------------------------------------------------------
eq((await listNames(Gio.File.new_for_path(dir))).sort(), ['a.txt', 'b.json'], 'the names of the children');
let thrown = null;
try {
    await listNames(Gio.File.new_for_path(`${dir}/missing`));
} catch (e) {
    thrown = e;
}
eq(thrown?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND), true, 'missing: rejects with NOT_FOUND');
thrown = null;
try {
    await listNames(Gio.File.new_for_path(`${dir}/a.txt`));
} catch (e) {
    thrown = e;
}
eq(thrown !== null, true, 'a file is not a folder: rejects');
const empty = `${dir}/empty`;
GLib.mkdir_with_parents(empty, 0o755);
eq(await listNames(Gio.File.new_for_path(empty)), [], 'an empty folder: no names');
const many = `${dir}/many`;
GLib.mkdir_with_parents(many, 0o755);
for (let i = 0; i < 150; i++)
    GLib.file_set_contents(`${many}/${i}`, '');
eq((await listNames(Gio.File.new_for_path(many))).length, 150, 'more than one batch of 64');

// --- ppidOf ------------------------------------------------------------------------------
eq(ppidOf('1234 (bash) S 1000 1234 1234 0 -1'), 1000, 'the fourth field');
eq(ppidOf('77 (my (odd) name) R 5 77'), 5, 'a comm with spaces and parentheses');
eq(ppidOf('88 (x) Z 0 88'), 0, 'no parent');
eq(ppidOf(''), 0, 'empty');
eq(ppidOf(null), 0, 'unreadable (null)');
eq(ppidOf('garbage'), 0, 'not a stat line');

for (let i = 0; i < 150; i++)
    GLib.unlink(`${many}/${i}`);
GLib.rmdir(many);
GLib.rmdir(empty);
GLib.unlink(`${dir}/a.txt`);
GLib.unlink(`${dir}/b.json`);
GLib.rmdir(dir);

console.log('files: ok');

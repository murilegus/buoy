// Run: gjs -m tests/greeting.test.js   (pure: the first run, What's new, their lines)
import adapter, {SHOW_MS, MAX_NOTES, MORE, INTRO, caseOf, noteFor, linesOf, buSize, releaseLabel, shortcutText} from '../src/buoy@murilegus/lib/modules/greeting/adapter.js';
import notes from '../src/buoy@murilegus/lib/modules/greeting/notes.js';
import {planExpanded, typedSplit, typingMs, TYPE_MS, MAX_LINES} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {validate, tierOf, PRIORITY} from '../src/buoy@murilegus/lib/kit/model/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// --- which case (GREETING.md §11) ----------------------------------------------------------
eq(caseOf({introShown: false, versionSeen: 0, version: 1}), 'first-run', 'a fresh install');
eq(caseOf({introShown: false, versionSeen: 3, version: 5}), 'first-run', 'the intro asked again (About): first run');
eq(caseOf({introShown: true, versionSeen: 1, version: 2}), 'whats-new', 'an update');
eq(caseOf({introShown: true, versionSeen: 1, version: 4}), 'whats-new', 'skipped versions: still What\'s new');
eq(caseOf({introShown: true, versionSeen: 2, version: 2}), null, 'the same version: nothing');
eq(caseOf({introShown: true, versionSeen: 3, version: 2}), null, 'a downgrade: nothing');
eq([caseOf({introShown: true, versionSeen: 1, version: NaN}), caseOf({introShown: true, versionSeen: -1, version: 2})], [null, null],
    'no version known: nothing');
eq(caseOf({introShown: 'yes', versionSeen: 1, version: 1}), 'first-run', 'only true counts as shown');

// --- notes ----------------------------------------------------------------------------------
eq(notes[0], {version: 1, name: '0.1', date: '2026-11-08', intro: true, added: [], fixed: []}, 'v0.1: its what\'s new is the intro, released 8 November 2026');
eq(notes.every(n => n.date === null || /^\d{4}-\d{2}-\d{2}$/.test(n.date)), true, 'every release day is YYYY-MM-DD or not yet');
eq(notes.every((n, i) => i === 0 || n.version > notes[i - 1].version), true, 'newest last, versions rising');
eq(Object.isFrozen(notes) && Object.isFrozen(notes[0]), true, 'notes are frozen data');
const many = [{version: 2, name: '0.2', added: ['A'], fixed: []}, {version: 4, name: '0.4', added: ['D'], fixed: ['E']}];
eq(noteFor(many, 4).name, '0.4', 'the running version\'s entry');
eq(noteFor(many, 3), null, 'a version without notes: none');
eq(noteFor(null, 1), null, 'no list: none');

// --- lines ----------------------------------------------------------------------------------
eq(linesOf({intro: true}).lines[2], 'Super+B reaches me from the keyboard.', 'the intro: Super+B by default');
eq(linesOf({intro: true}, {shortcut: '<Primary><Alt>space'}).lines[2], 'Ctrl+Alt+Space reaches me from the keyboard.',
    'a changed shortcut: the user\'s own (Ethan)');
eq(linesOf({intro: true}, {shortcut: ''}).lines, ['Hover me for more.', 'Click me for Home.',
    'Scroll on me when I rest to see what else I show.', '⚙ in Home opens my settings.'], 'no shortcut: that line goes');
eq([shortcutText('<Super>b'), shortcutText('<Super><Shift>F5'), shortcutText('<Control>Return'), shortcutText('x')],
    ['Super+B', 'Super+Shift+F5', 'Ctrl+Return', 'X'], 'shortcuts as people write them');
eq([shortcutText(''), shortcutText(null), shortcutText('<Super>')], [null, null, null], 'none: null');
eq(INTRO.lines.length, 5, 'five basics: hover, click, Super+B, scroll, settings');
eq(INTRO.lines.length <= MAX_LINES, true, 'the intro fits the expanded block');
eq(linesOf({version: 2, name: '0.2', added: ['Calendar tab', '  Bu  waves '], fixed: ['A crash']}),
    {title: 'New in Buoy 0.2', lines: ['Calendar tab', 'Bu waves', 'Fixed: A crash'], more: false}, 'new first, then fixed, tidied');
eq(linesOf({version: 3, name: '0.3', added: ['a', 'b', 'c'], fixed: ['d', 'e']}),
    {title: 'New in Buoy 0.3', lines: ['a', 'b', 'c', 'Fixed: d'], more: true}, `more than ${MAX_NOTES}: the first four, then more`);
eq(linesOf({version: 3, name: '0.3', added: ['a', 'b', 'c'], fixed: ['d', 'e']}, {max: Infinity}).lines.length, 5, 'About: every line');
eq(linesOf({version: 7, added: ['x', '', 3]}).title, 'New in Buoy 7', 'no name: the number; empty and non-text lines dropped');
eq([buSize(5), buSize(2), buSize(1), buSize(0)], [80, 80, 60, 60], 'Bu as tall as the text: 80 for three lines, 60 for two');

// --- About's headings ------------------------------------------------------------------
eq(releaseLabel({version: 2, name: '0.2', date: '2026-12-01'}, 2), 'Buoy 0.2 — this version', 'the running one: this version');
eq(releaseLabel({version: 1, name: '0.1', date: '2026-11-08'}, 2), 'Buoy 0.1 — 8 November 2026', 'an older one: its release day');
eq(releaseLabel({version: 1, name: '0.1', date: null}, 2), 'Buoy 0.1', 'no day yet: the name');
eq([releaseLabel({version: 1, name: '0.1', date: '2026-13-01'}, 2), releaseLabel({version: 1, name: '0.1', date: '8/11/2026'}, 2)],
    ['Buoy 0.1', 'Buoy 0.1'], 'a bad day: the name');
eq(releaseLabel({version: 3, date: '2027-01-05'}, 4), 'Buoy 3 — 5 January 2027', 'no name: the number');

// --- the activity -------------------------------------------------------------------------
{
    let more = 0;
    const first = adapter.greeting({id: 'g', case: 'first-run', animations: true, onMore: () => more++});
    const a = validate({id: 'g', kind: 'greeting', ...first});
    eq([a.style, a.text, a.actions], ['transient', 'Hi, I\'m Bu.', []], 'first run: transient, the hello, no buttons');
    const intro = linesOf({intro: true});
    const typed = typingMs([intro.title, ...intro.lines], TYPE_MS);
    eq(a.ttl, typed + SHOW_MS, 'stays 12 s once the last line is typed in');
    eq(SHOW_MS, 12000, '12 s (Ethan)');
    const ex = planExpanded(a);
    eq(ex.leading, {type: 'mascot', pose: 'wave', hello: true, size: 80}, 'expanded: Bu waving 5 s, 80 px');
    eq([ex.center.type, ex.center.title, ex.center.lines, ex.center.typed, ex.center.hero],
        ['block', 'Hi, I\'m Bu.', intro.lines, true, true], 'expanded: the hello large, the basics under it, typed in');
    eq(ex.grow, 'center', 'the words take the width');
    eq([PRIORITY.greeting, tierOf(a)], [85, 2], 'above anything running, not needs-you');
    eq(adapter.greeting({case: 'first-run', animations: false}).ttl, SHOW_MS, 'animations off: shown whole, only the 12 s');

    const update = adapter.greeting({case: 'whats-new', note: {version: 3, name: '0.3', added: ['a', 'b', 'c', 'd', 'e']}, onMore: () => more++});
    eq([update.text, update.actions], ['New in Buoy 0.3', [{id: MORE, label: '…and more'}]], 'What\'s new with more: the button');
    update.onAction(MORE);
    update.onAction('other');
    eq(more, 1, '…and more opens About → What\'s new, nothing else does');
    eq(adapter.greeting({case: 'whats-new', note: {version: 2, name: '0.2', added: ['a']}}).actions, [], 'few notes: no button');
    eq(Object.keys(first).filter(k => /size|width|height/i.test(k)), [], 'no measurements');
}

// --- typing (kit) -------------------------------------------------------------------------
eq(typedSplit(['Hi.', 'Hover me.'], 0), [0, 0], 'nothing typed');
eq(typedSplit(['Hi.', 'Hover me.'], 2), [2, 0], 'the first piece first');
eq(typedSplit(['Hi.', 'Hover me.'], 5), [3, 2], 'then the next');
eq(typedSplit(['Hi.', 'Hover me.'], 99), [3, 9], 'all in, never past the end');
eq(typedSplit(['⚙ in Home'], 1), [1], 'a character, not a UTF-16 unit');
eq(typedSplit(['ab'], -3), [0], 'before the start: nothing');
eq(typingMs(['ab', 'c'], 10), 30, 'three characters at 10 ms');

print('greeting: ok');

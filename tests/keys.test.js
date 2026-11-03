// Run: gjs -m tests/keys.test.js   (pure: ask mnemonics, pill navigation)
import {mnemonics, actionForKey, step} from '../src/buoy@murilegus/lib/kit/keys.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// --- mnemonics: first letter, position when shared ---------------------------------
eq(mnemonics(['Deny', 'Allow']), ['d', 'a'], 'Allow/Deny → A/D');
eq(mnemonics(['Allow', 'Deny']), ['a', 'd'], 'order does not change the letters');
eq(mnemonics(['Deny', 'Allow', 'Always']), ['d', '2', '3'],
    'Allow and Always share A: both take their position, Deny keeps D');
eq(mnemonics(['Yes', 'No', 'Later']), ['y', 'n', 'l'], 'any labels');
eq(mnemonics(['yes', 'YES']), ['1', '2'], 'case does not tell letters apart');
eq(mnemonics(['Đồng ý', 'Từ chối']), ['d', 't'], 'Vietnamese: diacritics folded, đ → d');
eq(mnemonics(['Éteindre', 'Annuler']), ['e', 'a'], 'accented first letter folds');
eq(mnemonics(['1 hour', '5 min', 'Never']), ['1', '2', 'n'], 'labels starting with a digit take their position');
eq(mnemonics(['  Allow ', 'Deny']), ['a', 'd'], 'surrounding spaces ignored');
eq(mnemonics(['', 'Deny']), ['1', 'd'], 'an empty label takes its position');
eq(mnemonics([null, 'Deny']), ['1', 'd'], 'a missing label takes its position');
eq(mnemonics(['🙂 ok', 'Deny']), ['1', 'd'], 'a symbol is not a letter');
eq(mnemonics([]), [], 'no buttons, no keys');
eq(mnemonics(['Allow']), ['a'], 'one button');
const ten = Array.from({length: 10}, (_, i) => `a${i}`);
eq(mnemonics(ten).slice(-2), ['9', null], 'past nine buttons sharing a letter there is no key');
eq(mnemonics(['A very long label that the renderer will ellipsize', 'Deny']), ['a', 'd'],
    'long labels: only the first letter matters');

// --- actionForKey -----------------------------------------------------------------
const acts = [{id: 'deny', key: 'd'}, {id: 'allow', key: '2'}, {id: 'always', key: '3'}, {id: 'x', key: null}];
eq(actionForKey(acts, 'd'), 'deny', 'letter answers its button');
eq(actionForKey(acts, 'D'), 'deny', 'Shift held: still that button');
eq(actionForKey(acts, '3'), 'always', 'digit answers by position');
eq(actionForKey(acts, 'a'), null, 'a shared letter answers nothing (only 2 and 3 do)');
eq(actionForKey(acts, ''), null, 'a key without text (arrows, Shift) answers nothing');
eq(actionForKey(acts, null), null, 'no text at all');
eq(actionForKey(acts, 'đ'), 'deny', 'a Vietnamese layout typing đ still means D');
eq(actionForKey([], 'a'), null, 'no actions');

// --- step: between pills --------------------------------------------------------------
eq(step(0, 1, 3), 1, '→ moves right');
eq(step(2, 1, 3), 2, '→ stops at the last pill');
eq(step(0, -1, 3), 0, '← stops at the centre pill');
eq(step(2, -1, 3), 1, '← moves left');
eq(step(0, 1, 1), 0, 'one pill: nowhere to go');
eq(step(5, -1, 2), 1, 'an index past the end (a pill just ended) is clamped');
eq(step(0, 1, 0), 0, 'no pills');

console.log('keys: ok');

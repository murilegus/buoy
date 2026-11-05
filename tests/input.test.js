// Run: gjs -m tests/input.test.js   (no Shell needed; adapters are pure)
import adapter, {TTL, ICON, PANEL, labelOf, shouldFlash, CHAIN_MS, switchStep, primaryModifier} from '../src/buoy@murilegus/lib/modules/input/adapter.js';
import {planMinimal, planCompact} from '../src/buoy@murilegus/lib/kit/presentation.js';
import {FEEDBACK, PRIORITY, validate} from '../src/buoy@murilegus/lib/kit/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// --- the label, as Shell's input source indicator shows it (ui/status/keyboard.js) --------
const us = {shortName: 'en', displayName: 'English (US)', props: []};
const bamboo = {shortName: 'vi', displayName: 'Vietnamese (Bamboo)', props: []};
eq(labelOf(us), 'en', 'xkb: its short name');
eq(labelOf(null), null, 'no source: nothing');
eq(labelOf({...bamboo, props: [{key: 'InputMode', visible: true, symbol: 'V'}]}), 'V',
    'IBus InputMode symbol (1–2 graphemes) wins, as _buildPropSection');
eq(labelOf({...bamboo, props: [{key: 'InputMode', visible: true, symbol: '', label: 'Ti'}]}), 'Ti',
    'no symbol: its label');
eq(labelOf({...bamboo, props: [{key: 'InputMode', visible: true, symbol: 'Viet'}]}), 'vi',
    'three or more graphemes: Shell keeps the short name');
eq(labelOf({...bamboo, props: [{key: 'InputMode', visible: false, symbol: 'V'}]}), 'vi', 'hidden InputMode ignored');
eq(labelOf({...bamboo, props: [{key: 'Other', visible: true, symbol: 'X'}]}), 'vi', 'only InputMode counts');
eq(labelOf({...bamboo, props: [{key: 'InputMode', visible: true, symbol: 'あ'}]}), 'あ', 'one non-Latin grapheme');

// --- when to flash ----------------------------------------------------------------------------
eq(shouldFlash({switched: true, label: 'vi', lastLabel: 'en'}), true, 'a real switch (oldSource set) flashes');
eq(shouldFlash({switched: true, label: 'en', lastLabel: 'en'}), true, 'a switch flashes even if the label repeats');
eq(shouldFlash({switched: false, label: 'vi', lastLabel: 'vi'}), false,
    'oldSource null, same label: a property update that changes nothing shown does not');
eq(shouldFlash({switched: false, label: 'E', lastLabel: 'V'}), true, 'Bamboo V → E inside the same source flashes');
eq(shouldFlash({switched: false, label: 'vi', lastLabel: null}), false, 'nothing seen before (startup): no flash');
eq(shouldFlash({switched: true, label: null, lastLabel: 'en'}), false, 'no current source: nothing to show');

// --- Super+Space without GNOME's switcher: which source each press picks ---------------------
// The list is the MRU order when the press began (current first), as the switcher's items.
eq(switchStep({n: 2, chain: null, backward: false}), 1, 'a tap: the source used before, as the switcher\'s first pick');
eq(switchStep({n: 2, chain: null, backward: true}), 1, 'backward with two: the other one too');
eq(switchStep({n: 3, chain: null, backward: true}), 2, 'backward with three: the least recent');
eq(switchStep({n: 3, chain: 1, backward: false}), 2, 'Super still held, Space again: one further in that list');
eq(switchStep({n: 3, chain: 2, backward: false}), 0, 'and it wraps to where it began');
eq(switchStep({n: 3, chain: 0, backward: true}), 2, 'backward wraps the other way');
eq(switchStep({n: 1, chain: null, backward: false}), null, 'one source: nothing to switch to');
eq(switchStep({n: 0, chain: null, backward: false}), null, 'none: nothing');
eq(CHAIN_MS > 0 && CHAIN_MS <= 2000, true, 'a held chain expires (a missed release cannot stick)');
eq([primaryModifier(0), primaryModifier(1 << 26), primaryModifier((1 << 26) | 1), primaryModifier(0b1010)],
    [0, 1 << 26, 1 << 26, 0b1000], 'primaryModifier: the highest bit, as switcherPopup.js');

// --- the pill: icon + a short word (SPEC §2e) ----------------------------------------------
{
    const opened = [];
    const p = adapter.input({id: 'input', label: 'en', name: 'English (US)', open: id => opened.push(id)}, null);
    eq(p.leading, {icon: ICON}, 'the keyboard icon');
    eq(p.text, 'EN · English (US)', 'the label in capitals, then the source name');
    eq(p.ttl, TTL, 'ttl');
    eq(TTL, 1500, '~1.5 s, as the other feedback');
    eq([p.compact ?? null, p.expanded ?? null], [null, null], 'feedback is minimal only');
    p.onPress();
    eq(opened, [PANEL], 'click: Keyboard settings');
    eq(PANEL, 'gnome-keyboard-panel.desktop', 'the Keyboard panel');
    const m = planMinimal(validate({id: 'input:system:input', kind: 'input', ...p}));
    eq([m.leading.type, m.text], ['icon', 'EN · English (US)'], 'planned: icon + text');
    eq(planCompact(p), null, 'no compact');
}
eq(adapter.input({id: 'input', label: 'V', name: 'Vietnamese (Bamboo)'}, null).text, 'V · Vietnamese (Bamboo)',
    'an IBus mode symbol');
eq(adapter.input({id: 'input', label: 'あ', name: 'Japanese (Anthy)'}, null).text, 'あ · Japanese (Anthy)',
    'non-Latin label kept as is');
eq(adapter.input({id: 'input', label: 'en', name: ''}, null).text, 'EN', 'no name: the label alone');
eq(adapter.input({id: 'input', label: '', name: 'English (US)'}, null).text, 'English (US)', 'no label: the name alone');
eq(adapter.input({id: 'input', label: '', name: ''}, null), null, 'nothing: null');
eq(adapter.input({id: 'input', label: 'en', name: 'English'}, null).onPress, null, 'no opener: no onPress');
{
    const long = 'Vietnamese (Bamboo with a very long engine description from IBus)';
    eq(adapter.input({id: 'input', label: 'vi', name: long}, null).text, `VI · ${long}`, 'long name kept whole');
}
{
    const keys = ['leading', 'text', 'trailing', 'sizeHint', 'onPress', 'ttl'];
    const p = adapter.input({id: 'input', label: 'en', name: 'English'}, null);
    eq(keys.filter(k => !(k in p)), [], 'every field set: one pill updated in place');
    if (/"(width|height|w|h|px|size)":/.test(JSON.stringify(p)))
        throw new Error('input: no measurements in the adapter');
}

// --- a feedback kind (SPEC §2e) ------------------------------------------------------------
eq(FEEDBACK.has('input'), true, 'input is feedback: pill 1 for its ttl, never missed');
eq(PRIORITY.input, PRIORITY.osd, 'same priority as the other OSD feedback');

print('input: ok');

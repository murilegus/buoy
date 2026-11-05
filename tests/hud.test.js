// Run: gjs -m tests/hud.test.js   (no Shell needed; adapters are pure)
import adapter, {TTL, family, isFnLockLed, isMuted, ledOn, percent, panelFor} from '../src/buoy@murilegus/lib/modules/hud/adapter.js';
import {planMinimal, planCompact} from '../src/buoy@murilegus/lib/kit/presentation.js';
import {validate} from '../src/buoy@murilegus/lib/kit/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const osd = (iconName, level = null, extra = {}) => adapter.osd({id: 'hud', iconName, level, maxLevel: 1, ...extra}, null);

// --- families by icon (gsd-media-keys, Shell volume.js / brightnessManager.js) ------------
eq(family('audio-volume-medium-symbolic'), 'volume', 'speaker volume');
eq(family('audio-volume-overamplified-symbolic'), 'volume', 'over 100 %');
eq(family('microphone-sensitivity-low-symbolic'), 'mic', 'microphone');
eq(family('audio-input-microphone-symbolic'), 'mic', 'microphone (generic icon)');
eq(family('display-brightness-symbolic'), 'brightness', 'display brightness');
eq(family('keyboard-brightness-symbolic'), 'keyboard', 'keyboard backlight');
eq(family('battery-level-80-symbolic'), 'battery', 'battery key');
eq(family('input-touchpad-symbolic'), 'touchpad', 'touchpad on');
eq(family('touchpad-disabled-symbolic'), 'touchpad', 'touchpad off');
eq(family('airplane-mode-symbolic'), 'other', 'airplane: no family');
eq(family(''), 'other', 'no icon');
eq(family(null), 'other', 'null icon');
eq([isMuted('audio-volume-muted-symbolic'), isMuted('microphone-sensitivity-muted-symbolic'),
    isMuted('audio-volume-high-symbolic')], [true, true, false], 'muted icons');
eq([percent(0), percent(0.624), percent(1), percent(1.5), percent(-0.2)], [0, 62, 100, 150, 0],
    'percent: rounded, over 100 when amplified, never negative');
eq([panelFor('volume'), panelFor('mic'), panelFor('brightness'), panelFor('keyboard'),
    panelFor('battery'), panelFor('touchpad'), panelFor('other')],
['gnome-sound-panel.desktop', 'gnome-sound-panel.desktop', 'gnome-display-panel.desktop',
    'gnome-keyboard-panel.desktop', 'gnome-power-panel.desktop', 'gnome-mouse-panel.desktop', null],
'Settings panel per family');

// --- a level: icon + bar + its number (SPEC §2e, Ethan 2026-11-05) ------------------------
{
    const p = osd('audio-volume-medium-symbolic', 0.624);
    eq(p.leading, {icon: 'audio-volume-medium-symbolic'}, 'level: its icon');
    eq(p.text ?? null, null, 'no label: no text');
    eq(p.trailing, {bar: 0.624, label: '62%'}, 'level: bar and 0–100 % (as Notchy)');
    eq([p.ttl, p.sizeHint], [TTL, 'wide'], 'level: 1.5 s, wide');
    eq([p.compact ?? null, p.expanded ?? null], [null, null], 'feedback is minimal only');
    const m = planMinimal(validate({id: 'osd:system:hud', kind: 'osd', ...p}));
    eq([m.leading.type, m.trailing.type, m.trailing.label, m.text], ['icon', 'bar', '62%', null], 'planned: icon, bar 62%');
    eq(planCompact(p), null, 'no compact');
    eq(TTL, 1500, 'ttl ~1.5 s');
}
eq(osd('audio-volume-medium-symbolic', 0.4, {label: 'Headphones'}).text, 'Headphones', 'gsd\'s device label as text');
eq(osd('audio-volume-overamplified-symbolic', 1.3, {maxLevel: 1.5}).trailing, {bar: 1, label: '130%'},
    'over 100 %: the bar is full, the number says 130');
eq(osd('audio-volume-muted-symbolic', 0.5).trailing, {bar: 0.5, label: '50%', off: true}, 'muted: the level stays, dimmed');
eq(osd('microphone-sensitivity-muted-symbolic', 0).trailing, {bar: 0, label: '0%', off: true}, 'mic muted at 0');
eq(osd('display-brightness-symbolic', 0).trailing, {bar: 0, label: '0%'}, 'brightness 0 is a level, not a toggle');

// --- click → its Settings panel, through the source -------------------------------------
{
    const opened = [];
    const p = adapter.osd({id: 'hud', iconName: 'audio-volume-high-symbolic', level: 0.8, open: id => opened.push(id)}, null);
    p.onPress();
    eq(opened, ['gnome-sound-panel.desktop'], 'click on volume: Sound settings');
    eq(adapter.osd({id: 'hud', iconName: 'airplane-mode-symbolic', label: 'Airplane Mode Enabled', open: () => {}}, null).onPress ?? null,
        null, 'no panel: no onPress (Home)');
    eq(adapter.osd({id: 'hud', iconName: 'audio-volume-high-symbolic', level: 0.8}, null).onPress ?? null, null,
        'no opener from the source: no onPress');
}

// --- toggles: icon + a short word ---------------------------------------------------------
eq(osd('airplane-mode-symbolic', null, {label: 'Airplane Mode Enabled'}).text, 'Airplane Mode Enabled', 'gsd\'s own label');
eq(osd('bluetooth-disabled-symbolic', -1, {label: 'Bluetooth Disabled'}).trailing ?? null, null, 'level −1 (gsd: none) → no bar');
eq(osd('input-touchpad-symbolic').text, 'Touchpad on', 'touchpad on: our word');
eq(osd('touchpad-disabled-symbolic').text, 'Touchpad off', 'touchpad off');
eq(osd('rotation-locked-symbolic').text, 'Rotation locked', 'rotation locked');
eq(osd('rotation-allowed-symbolic').text, 'Rotation unlocked', 'rotation unlocked');
eq(osd('media-eject-symbolic').text, 'Eject', 'eject');
eq(osd('action-unavailable-symbolic').text, 'Nothing playing', 'unavailable (a media key, no player): said plainly');
eq(osd('screen-privacy-symbolic', null, {label: 'Privacy Screen Enabled'}).text, 'Privacy Screen Enabled', 'mutter\'s label');
eq(adapter.osd({id: 'hud', iconName: '', label: null, level: null}, null), null, 'nothing to show: null');
eq(osd('audio-volume-high-symbolic', NaN).trailing ?? null, null, 'NaN level: no bar');

// --- a Gio.Icon from the source is passed through as the icon ----------------------------
{
    const gicon = new class FakeIcon {}();
    eq(adapter.osd({id: 'hud', iconName: 'x-symbolic', gicon, level: 0.2}, null).leading.icon, gicon, 'gicon wins over the name');
}

// --- Caps Lock / Num Lock (Buoy's own) ----------------------------------------------------
eq(adapter.osd({id: 'hud', lock: 'caps', on: true, iconName: 'caps'}, null).text, 'Caps Lock on', 'caps on');
eq(adapter.osd({id: 'hud', lock: 'caps', on: false, iconName: 'caps'}, null).text, 'Caps Lock off', 'caps off');
eq(adapter.osd({id: 'hud', lock: 'num', on: true, iconName: 'num'}, null).text, 'Num Lock on', 'num on');
eq(adapter.osd({id: 'hud', lock: 'num', on: true, iconName: 'num'}, null).ttl, TTL, 'locks: same ttl');
eq(adapter.osd({id: 'hud', lock: 'fn', on: true, iconName: 'fn'}, null).text, 'Fn Lock on', 'fn on');
eq(adapter.osd({id: 'hud', lock: 'fn', on: false, iconName: 'fn'}, null).text, 'Fn Lock off', 'fn off');

// --- every output sets the same fields, so updating the one pill in place replaces them ---
{
    const keys = p => ['leading', 'text', 'trailing', 'sizeHint', 'onPress', 'ttl'].filter(k => !(k in p));
    for (const p of [osd('audio-volume-high-symbolic', 0.5), osd('input-touchpad-symbolic'),
        osd('screen-privacy-symbolic'), adapter.osd({id: 'hud', lock: 'caps', on: true, iconName: 'c'}, null)])
        eq(keys(p), [], `all fields set (${p.text ?? p.leading?.icon})`);
    const merged = {...osd('audio-volume-high-symbolic', 0.5, {label: 'Headphones'}), ...osd('input-touchpad-symbolic')};
    eq([merged.trailing, merged.text, merged.sizeHint], [null, 'Touchpad on', 'normal'],
        'a toggle after a level (stack.update merges): no bar, no device left over');
}

// --- Fn Lock: an LED class `*::fnlock` (ideapad-laptop's platform::fnlock) --------------
eq(['platform::fnlock', 'input2::capslock', 'phy0-led', 'tpacpi::fnLock', 'fnlock', null].map(isFnLockLed),
    [true, false, false, true, false, false], 'the fnlock LED by its class name');
eq([ledOn('1\n'), ledOn('0\n'), ledOn(' 255 '), ledOn(''), ledOn(null), ledOn('x')], [true, false, true, null, null, null],
    'sysfs brightness text: on, off, nothing');

// --- long text is not cut by the adapter -------------------------------------------------
{
    const long = 'Bluetooth Headphones With A Really Long Device Description From PipeWire';
    eq(osd('audio-volume-high-symbolic', 0.5, {label: long}).text, long, 'long label kept whole');
}

// --- no measurements (ARCHITECTURE rule 11) ----------------------------------------------
for (const p of [osd('audio-volume-high-symbolic', 0.5), osd('input-touchpad-symbolic')]) {
    const json = JSON.stringify(p);
    if (/"(width|height|w|h|px|size)":/.test(json))
        throw new Error(`hud: no measurements in the adapter's output: ${json}`);
}

print('hud: ok');

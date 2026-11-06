// Run: gjs -m tests/presentation.test.js   (pure: presentation data → render plan)
import {
    element, planMinimal, planExpanded, planIdle, planCompact, lightSlot, keyline, planMissed, clockTime,
    MAX_ACTIONS, MAX_ROWS, livePosition, mediaTimes, untilText,
} from '../src/buoy@murilegus/lib/kit/presentation.js';
import media from '../src/buoy@murilegus/lib/modules/media/adapter.js';
import spotify from '../src/buoy@murilegus/lib/modules/media/apps/spotify.js';
import hud from '../src/buoy@murilegus/lib/modules/hud/adapter.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

eq(MAX_ACTIONS, {minimal: 1, compact: 3, expanded: 3}, 'HIG action limits (APPLE.md B5.5) + compact transport');

// --- element ------------------------------------------------------------------
for (const empty of [null, undefined, '', '  ', false, 0, {}, {icon: ''}, {art: null}, {text: ''}])
    eq(element(empty), null, `empty element ${JSON.stringify(empty)}`);

eq(element('audio-x-generic-symbolic'), {type: 'icon', icon: 'audio-x-generic-symbolic'}, 'string = icon name');
eq(element('eq'), {type: 'glyph', name: 'eq'}, '"eq" is the equaliser glyph');
eq(element({icon: 'eq'}), {type: 'glyph', name: 'eq'}, '{icon: "eq"} too');
eq(element({art: 'file:///a.png', icon: 'audio-x-generic-symbolic'}),
    {type: 'art', src: 'file:///a.png', fallback: 'audio-x-generic-symbolic'}, 'art with icon fallback');
eq(element({art: '/tmp/a.png'}), {type: 'art', src: '/tmp/a.png', fallback: null}, 'art without fallback');
{
    const bytesIcon = new class FakeBytesIcon {}();
    const e = element({art: bytesIcon, icon: 'image-x-generic-symbolic'});
    eq([e.type, e.gicon === bytesIcon, 'src' in e, e.fallback], ['art', true, false, 'image-x-generic-symbolic'],
        'art from a Gio.Icon (a copied image): no path');
    eq(element({art: {}}), null, 'a plain object is not an icon');
}
eq(element({art: null, icon: 'x-symbolic'}), {type: 'icon', icon: 'x-symbolic'}, 'missing art → icon');
eq(element({icon: 'x-symbolic', size: 56, width: 9}), {type: 'icon', icon: 'x-symbolic'},
    'measurements from adapters are ignored (ARCHITECTURE rule 11)');
eq(element({progress: 0.25}), {type: 'ring', value: 0.25}, 'progress → ring');
eq(element({progress: 7}), {type: 'ring', value: 1}, 'ring clamps above 1');
eq(element({progress: -1}), {type: 'ring', value: 0}, 'ring clamps below 0');
eq(element({progress: NaN}), null, 'NaN progress is no element');
eq(element({progress: true}), null, 'progress: true (live, source-driven) is no static element');
eq(element({bar: 0.3}), {type: 'bar', value: 0.3}, 'bar');
eq(element({bar: 2}), {type: 'bar', value: 1}, 'bar clamps');
eq(element({bar: 0.62, label: '62'}), {type: 'bar', value: 0.62, label: '62'}, 'bar with its number (hud level)');
eq(element({bar: 1, label: 120}), {type: 'bar', value: 1, label: '120'}, 'bar label: a number becomes text; the bar clamps, the label does not');
eq(element({bar: 0.5, label: '  '}), {type: 'bar', value: 0.5}, 'bar: a blank label is dropped');
eq(element({bar: 0.5, off: true}), {type: 'bar', value: 0.5, off: true}, 'bar off (muted): dimmed, level kept');
eq(element({bar: 0.5, off: 'yes'}), {type: 'bar', value: 0.5}, 'bar off must be true, nothing else');
eq(element({countdown: 30}), {type: 'text', text: '0:30'}, 'countdown m:ss');
eq(element({countdown: 3725}), {type: 'text', text: '1:02:05'}, 'countdown h:mm:ss');
eq(element({countdown: -5}), {type: 'text', text: '0:00'}, 'negative countdown');
eq(element({countdown: 59.6}), {type: 'text', text: '1:00'}, 'countdown rounds');
eq(element({text: 'VI'}), {type: 'text', text: 'VI'}, 'text element');
eq(element({text: 42}), {type: 'text', text: '42'}, 'numeric text');
{
    class FakeGIcon {}
    const gicon = new FakeGIcon();
    const e = element(gicon);
    if (e?.type !== 'icon' || e.gicon !== gicon)
        throw new Error('non-plain object is passed through as a Gio.Icon');
    if (element({icon: gicon})?.gicon !== gicon)
        throw new Error('{icon: Gio.Icon} passes the icon through');
}

// --- keyline ------------------------------------------------------------------
eq(keyline('#1DB954'), '#1db954', 'brand colour accepted, normalised');
eq(keyline('#abc'), '#abc', 'short hex');
for (const bad of ['#EF9F27', '#e24b4a', '#F0997B', '#5DCAA5', '#3A3A3A'])
    eq(keyline(bad), null, `reserved state colour ${bad} refused (INDICATORS.md)`);
for (const bad of [null, undefined, 'red', '#12345', 'rgb(1,2,3)', 42, ''])
    eq(keyline(bad), null, `invalid keyline ${bad}`);

// --- minimal --------------------------------------------------------------------
const track = {
    id: 'x', title: 'Monument Valley', artist: 'Lumen Coast', status: 'Playing',
    art: 'file:///tmp/cover.png', length: 30,
};
{
    const c = planMinimal(media.media(track, null));
    eq(c.leading, {type: 'art', src: 'file:///tmp/cover.png', fallback: 'audio-x-generic-symbolic'},
        'media minimal leading = art');
    eq(c.text, 'Monument Valley · Lumen Coast', 'media minimal text');
    eq(c.trailing, {type: 'glyph', name: 'eq'}, 'media minimal trailing = eq glyph');
    eq(c.action, null, 'media: no button in minimal (minimalAction: false; the compact has them)');
    eq([c.keyline, c.stale], [null, false], 'no keyline, not stale');
}
{
    const c = planMinimal(spotify.media({...track, ad: true, position: 0, length: 30000, at: 1000}, null));
    eq([c.text, c.trailing], ['Ad', {type: 'until', at: 31000}], 'spotify ad: a live countdown in trailing');
}
{
    const c = planMinimal(hud.osd({iconName: 'audio-volume-high-symbolic', level: 0.4}));
    eq([c.leading, c.text, c.trailing], [{type: 'icon', icon: 'audio-volume-high-symbolic'}, null,
        {type: 'bar', value: 0.4, label: '40%'}], 'hud: icon + bar and its percentage, no text');
}
{
    const long = 'x'.repeat(500);
    eq(planMinimal({text: long}).text, long, 'long text is not truncated (the renderer ellipsizes)');
    eq(planMinimal({text: '  padded  '}).text, 'padded', 'text trimmed');
    eq(planMinimal({text: '   '}).text, null, 'blank text → null');
    eq(planMinimal({}), {leading: null, text: null, trailing: null, action: null, keyline: null, stale: false, light: null, badge: null},
        'empty presentation');
    eq(planMinimal({isStale: true, keyline: '#1DB954'}).stale, true, 'isStale → stale');
    eq(planMinimal({keyline: '#1DB954'}).keyline, '#1db954', 'keyline carried');
}
{
    const actions = [{label: 'no id'}, {id: 'bare'}, {id: 'a', label: 'A'}, {id: 'b', icon: 'b-symbolic'},
        {id: 'c', label: 'C'}, {id: 'd', label: 'D'}, {id: 'e', label: 'E'}, null, 'str'];
    eq(planMinimal({actions}).action, {id: 'a', label: 'A', icon: null},
        'minimal keeps the first valid action (no id / no label+icon dropped)');
    eq(planExpanded({actions, expanded: true}).actions.map(a => a.id), ['a', 'b', 'c'], 'expanded keeps 3');
    eq(planMinimal({actions: 'nope'}).action, null, 'non-array actions ignored');
}

// --- expanded -------------------------------------------------------------------
eq(planExpanded(media.media(track, null)) !== null, true, 'media has an expanded plan');
eq(planExpanded({text: 'x'}), null, 'no expanded → no plan');
eq(planExpanded({text: 'x', expanded: 'yes'}), null, 'non-object, non-true expanded → no plan');
{
    const e = planExpanded(media.media(track, null));
    eq(e.leading, {type: 'art', src: 'file:///tmp/cover.png', fallback: 'audio-x-generic-symbolic'},
        'expanded leading from the adapter, with the icon behind the art');
    eq(e.center, {type: 'block', title: 'Monument Valley', subtitle: 'Lumen Coast', bar: null},
        'center block');
    eq(e.trailing, {type: 'glyph', name: 'eq'}, 'trailing falls back to the minimal one');
    eq(e.bottom, {type: 'actions'}, 'transport → actions row');
    eq(e.actions.map(a => a.id), ['playpause'], 'expanded actions');
    eq(e.grow, 'center', 'center takes the free width by default');
}
{
    const e = planExpanded({
        leading: 'a-symbolic', text: 'Copying 3 files', trailing: {progress: 0.4},
        actions: [{id: 'cancel', label: 'Cancel'}], expanded: true,
    });
    eq([e.leading, e.center, e.trailing, e.bottom],
        [{type: 'icon', icon: 'a-symbolic'}, {type: 'block', title: 'Copying 3 files', subtitle: null, bar: null},
            {type: 'ring', value: 0.4}, {type: 'actions'}],
        'expanded: true = enlarged minimal, same elements and order (APPLE.md B2)');
}
{
    const e = planExpanded({
        leading: 'a-symbolic', text: 't', trailing: 'b-symbolic',
        expanded: {leading: null, center: {title: 'T', progress: 0.5}, trailing: {icon: 'c-symbolic', priority: 5}},
    });
    eq(e.leading, null, 'explicit null region stays empty');
    eq(e.center, {type: 'block', title: 'T', subtitle: null, bar: 0.5}, 'numeric progress → bar under the text');
    eq(e.trailing, {type: 'icon', icon: 'c-symbolic'}, 'explicit region wins over minimal');
    eq(e.grow, 'trailing', 'highest priority region takes the free width');
    eq(e.bottom, null, 'no actions → no bottom row');
}
{
    eq(planExpanded({expanded: {bottom: {transport: true}}}), null, 'transport without actions, nothing else → null');
    eq(planExpanded({expanded: {}}), null, 'empty expanded → null');
    eq(planExpanded({expanded: {center: {priority: 9}}}), null, 'priority alone is not content');
    const e = planExpanded({text: 't', expanded: {leading: {icon: 'x', priority: 2}, center: {title: 'c', priority: 2}}});
    eq(e.grow, 'center', 'priority tie keeps center');
}

// ask (kit/stack.js shape): question + one button in minimal, every option in expanded
{
    const ask = {
        text: 'Allow edit?', expanded: true,
        actions: [{id: 'Deny', label: 'Deny'}, {id: 'Allow', label: 'Allow'}],
    };
    eq(planMinimal(ask).action?.id, 'Deny', 'ask minimal shows one button');
    const e = planExpanded(ask);
    eq([e.center?.title, e.bottom, e.actions.map(a => a.id)], ['Allow edit?', {type: 'actions'}, ['Deny', 'Allow']],
        'ask expanded: question + every option');
    eq(e.actions.some(a => 'key' in a), false,
        'no keys without kind ask (only asks are answered from the keyboard)');
    const three = [{id: 'Deny', label: 'Deny'}, {id: 'Allow', label: 'Allow'}, {id: 'Always', label: 'Always'}];
    const keyed = planExpanded({...ask, kind: 'ask', actions: three});
    eq(keyed.actions.map(a => a.key), ['d', '2', '3'], 'ask expanded: each action carries its key (kit/keys.js)');
    eq(planMinimal({...ask, kind: 'ask'}).action, {id: 'Deny', label: 'Deny', icon: null}, 'minimal ask action has no key');
}

// --- missed history: the amber light's compact (INDICATORS.md, 2026-11-05) -------------
const local = (h, m) => new Date(2026, 10, 3, h, m).getTime();
eq(planMissed([]), null, 'nothing missed: no compact');
eq(planMissed(null), null, 'no list: no compact');
{
    const tabIcon = k => ({timer: 'alarm-symbolic', progress: 'folder-download-symbolic'}[k] ?? null);
    const m = planMissed([
        {kind: 'progress', text: 'Copy done', at: local(22, 41)},
        {kind: 'timer', text: '', at: local(22, 5)},
        {kind: 'agent', text: 'Claude finished', at: local(21, 30)},
        {kind: 'x', text: 'fourth', at: local(20, 0)},
    ], tabIcon);
    eq(m.title, 'Missed · 4', 'the count is the whole history');
    eq(m.rows.length, MAX_ROWS, 'at most 3 rows');
    eq(m.rows[0], {icon: {type: 'icon', icon: 'folder-download-symbolic'}, text: 'Copy done', detail: '22:41'},
        'a row: its tab icon, its text, the time it ended');
    eq(m.rows[1].text, 'timer', 'empty text falls back to the kind');
    eq(m.rows[2].icon, {type: 'icon', icon: 'view-app-grid-symbolic'}, 'a kind with no tab: the generic icon');
    eq([m.tall, m.light], [true, 'missed'], 'always the 88 px compact, on the amber light');
    eq(planMissed([{kind: 'x', text: 'a'}]).rows[0].detail, null, 'no time: no detail');
}
eq(clockTime(local(14, 2)), '14:02', '24 h clock, zero-padded minutes');
eq(clockTime(local(9, 5)), '09:05', 'zero-padded hours');
eq(clockTime(NaN), '', 'no time: empty');

// --- buoy light slot (SPEC §2a-i, INDICATORS.md) ------------------------------------
eq(lightSlot('off', {idle: true}), 'off', 'grey off light only in idle');
eq(lightSlot('off', {idle: false}), null, 'no slot in minimal when off');
for (const l of ['missed', 'waiting']) {
    eq(lightSlot(l, {idle: true}), l, `${l} in idle`);
    eq(lightSlot(l, {idle: false}), l, `${l} in minimal`);
}
eq(lightSlot('bogus', {idle: true}), 'off', 'unknown light in idle → off');
eq(lightSlot(undefined, {idle: false}), null, 'no light in minimal');
eq(planIdle({light: 'missed'}), {light: 'missed', leading: null, text: null, trailing: null}, 'idle none carries the light');
eq(planIdle({}), {light: 'off', leading: null, text: null, trailing: null}, 'idle none: grey light');
eq(planMinimal({text: 't'}, {light: 'waiting'}).light, 'waiting', 'minimal carries a red light');
eq(planMinimal({text: 't'}, {light: 'off'}).light, null, 'minimal drops the off light');

// --- compact (the hover tier, Buoy's own; no Apple equivalent) ------------------
eq(planCompact({text: 't'}), null, 'no compact field → no compact');
eq(planCompact({text: 't', compact: true}), null, 'compact must be an object');
eq(planCompact({compact: {}}), null, 'empty compact → no compact');
{
    const acts = [{id: 'prev', icon: 'p-symbolic'}, {id: 'pp', icon: 'q-symbolic'},
        {id: 'next', icon: 'n-symbolic'}, {id: 'x', label: 'X'}];
    const p = planCompact({
        keyline: '#1DB954', isStale: true, actions: acts,
        compact: {leading: 'a-symbolic', text: 'Song', transport: true},
    }, {light: 'missed'});
    eq([p.leading, p.text, p.trailing], [{type: 'icon', icon: 'a-symbolic'}, 'Song', null], 'compact zones');
    eq(p.actions.map(a => a.id), ['prev', 'pp', 'next'], 'transport → up to 3 activity actions');
    eq([p.keyline, p.stale, p.light], ['#1db954', true, 'missed'], 'compact inherits keyline, stale, light');
    eq(planCompact({actions: acts, compact: {text: 'x'}}).actions, [], 'no transport → no buttons');
    eq(planCompact({compact: {transport: true}}), null, 'transport without actions or content → no compact');
}

// --- compact: two lines, a bar or rows (SPEC §2, §4, 2026-11-05) ---------------------
{
    const p = planCompact({compact: {leading: {art: 'file:///a.png'}, text: 'Song', subtitle: 'Artist · Album', progress: 0.42}});
    eq([p.text, p.subtitle, p.progress, p.tall], ['Song', 'Artist · Album', 0.42, true], 'title, subtitle, a bar → tall');
    eq(planCompact({compact: {text: 'x', progress: 7}}).progress, 1, 'progress clamps to 1');
    eq(planCompact({compact: {text: 'x', progress: '0.5'}}).progress, null, 'progress must be a number');
    eq(planCompact({compact: {text: 'x'}}).tall, false, 'one row → 56 px');
    eq(planCompact({compact: {subtitle: 'only the second line'}}).subtitle, 'only the second line', 'a subtitle alone is content');
    const rowsIn = [{icon: 'a-symbolic', text: 'one', detail: '1:00'}, {text: '  '}, 'nope',
        {text: 'two'}, {text: 'three'}, {text: 'four'}];
    const r = planCompact({compact: {rows: rowsIn}});
    eq(r.rows.map(x => x.text), ['one', 'two', 'three'], 'rows: blank and non-objects dropped, at most 3');
    eq(r.rows[0], {icon: {type: 'icon', icon: 'a-symbolic'}, text: 'one', detail: '1:00'}, 'a row');
    eq(r.rows[1], {icon: null, text: 'two', detail: null}, 'a row without icon or detail');
    eq(r.tall, true, 'rows → tall');
    eq(planCompact({compact: {rows: 'no'}}), null, 'rows must be a list');
    const long = 'x'.repeat(500);
    eq(planCompact({compact: {text: long, subtitle: long}}).subtitle, long, 'long text is not cut here (the renderer ellipsizes)');
}

// --- live progress (media, 2026-11-05): runs while shown, times beside it ---------------
{
    const p = planCompact({compact: {text: 's', progress: {position: 92000, length: 221000, at: 1000, playing: true}}});
    eq(p.live, {position: 92000, length: 221000, at: 1000, playing: true}, 'a live position is carried');
    eq(p.progress, 92000 / 221000, 'its fraction when read');
    eq(p.tall, true, 'a live bar → tall');
    eq(planCompact({compact: {text: 's', progress: {position: 5, length: 0}}}).progress, null, 'no length → no bar');
    eq(planCompact({compact: {text: 's', progress: {position: 'x', length: 10}}}).progress, null, 'position must be a number');
    eq(planCompact({compact: {text: 's', progress: {position: 999, length: 10}}}).live.position, 10, 'position clamps to the length');
    eq(planCompact({compact: {text: 's', progress: 0.3}}).live, null, 'a plain fraction is not live');
    const live = {position: 92000, length: 221000, at: 1000, playing: true};
    eq(livePosition(live, 4000), 95000, 'runs from `at` while playing');
    eq(livePosition({...live, playing: false}, 4000), 92000, 'paused: stays');
    eq(livePosition(live, 10 ** 9), 221000, 'never past the end');
    eq(livePosition({...live, at: 0}, 4000), 92000, 'no read time: stays');
    eq(livePosition(live, 500), 92000, 'a clock behind `at` never runs backwards');
    eq(mediaTimes(92000, 221000), ['1:32', '\u22122:09'], 'elapsed and remaining (minus sign)');
    eq(mediaTimes(0, 3725000), ['0:00', '\u22121:02:05'], 'hours when the track has them');
    eq(mediaTimes(300000, 200000)[1], '\u22120:00', 'remaining never negative');
}
eq(element({until: 31000}), {type: 'until', at: 31000}, 'a live countdown element');
eq(untilText(31000, 1500), '0:30', 'what is left, rounded');
eq(untilText(1000, 5000), '0:00', 'never negative');

// --- side pills: leading + trailing, text dropped (SPEC §2c, APPLE §B3) -----------------
{
    const timer = {leading: 'alarm-symbolic', text: 'Tea', trailing: {countdown: 240}};
    eq(planMinimal(timer, {side: true}).text, null, 'side pill drops text');
    eq(planMinimal(timer, {side: true}).trailing, {type: 'text', text: '4:00'}, 'side pill keeps the countdown in trailing');
    eq(planMinimal(timer).text, 'Tea', 'pill 1 keeps text');
    eq(planMinimal({text: 'only text'}, {side: true}).text, 'only text', 'nothing else to show: the text stays');
    eq(planMinimal({leading: 'a-symbolic', text: 't'}, {side: true, more: 2}).badge, '+2', 'side pill still carries +N');
}

// --- +N badge (SPEC §2c: the last pill carries it) ----------------------------------
eq(planMinimal({text: 't'}, {more: 2}).badge, '+2', '+N badge');
for (const none of [0, -1, undefined, NaN, '3'])
    eq(planMinimal({text: 't'}, {more: none}).badge, null, `no badge for ${none}`);
eq(planMinimal({}, {more: 4}).badge, '+4', 'badge alone still counts as content');
eq(planMinimal({actions: [{id: 'a', label: 'A'}]}).action?.id, 'a', 'an activity keeps its minimal button by default');
eq(planMinimal({actions: [{id: 'a', label: 'A'}], minimalAction: false}).action, null, 'minimalAction: false drops it');

console.log('presentation: ok');

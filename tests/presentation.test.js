// Run: gjs -m tests/presentation.test.js   (pure: presentation data → render plan)
import {element, planCompact, planExpanded, planIdle, planPeek, lightSlot, keyline, MAX_ACTIONS} from
    '../src/buoy@murilegus/lib/kit/presentation.js';
import media from '../src/buoy@murilegus/lib/modules/media/adapter.js';
import spotify from '../src/buoy@murilegus/lib/modules/media/apps/spotify.js';
import hud from '../src/buoy@murilegus/lib/modules/hud/adapter.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

eq(MAX_ACTIONS, {compact: 1, expanded: 3, peek: 3}, 'HIG action limits (APPLE.md B5.5) + peek transport');

// --- element ------------------------------------------------------------------
for (const empty of [null, undefined, '', '  ', false, 0, {}, {icon: ''}, {art: null}, {text: ''}])
    eq(element(empty), null, `empty element ${JSON.stringify(empty)}`);

eq(element('audio-x-generic-symbolic'), {type: 'icon', icon: 'audio-x-generic-symbolic'}, 'string = icon name');
eq(element('eq'), {type: 'glyph', name: 'eq'}, '"eq" is the equaliser glyph');
eq(element({icon: 'eq'}), {type: 'glyph', name: 'eq'}, '{icon: "eq"} too');
eq(element({art: 'file:///a.png', icon: 'audio-x-generic-symbolic'}),
    {type: 'art', src: 'file:///a.png', fallback: 'audio-x-generic-symbolic'}, 'art with icon fallback');
eq(element({art: '/tmp/a.png'}), {type: 'art', src: '/tmp/a.png', fallback: null}, 'art without fallback');
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

// --- compact --------------------------------------------------------------------
const track = {
    id: 'x', title: 'Monument Valley', artist: 'Lumen Coast', status: 'Playing',
    art: 'file:///tmp/cover.png', length: 30,
};
{
    const c = planCompact(media.media(track, null));
    eq(c.leading, {type: 'art', src: 'file:///tmp/cover.png', fallback: 'audio-x-generic-symbolic'},
        'media compact leading = art');
    eq(c.text, 'Monument Valley · Lumen Coast', 'media compact text');
    eq(c.trailing, {type: 'glyph', name: 'eq'}, 'media compact trailing = eq glyph');
    eq(c.action, {id: 'playpause', label: null, icon: 'media-playback-start-symbolic'}, 'one compact action');
    eq([c.keyline, c.stale], [null, false], 'no keyline, not stale');
}
{
    const c = planCompact(spotify.media({...track, title: 'Advertisement'}, null));
    eq([c.text, c.trailing], ['Ad', {type: 'text', text: '0:30'}], 'spotify ad: countdown trailing');
}
{
    const c = planCompact(hud.osd({icon: 'audio-volume-high-symbolic', level: 0.4}));
    eq([c.leading, c.text, c.trailing], [{type: 'icon', icon: 'audio-volume-high-symbolic'}, null,
        {type: 'bar', value: 0.4}], 'hud: icon + bar, no text');
}
{
    const long = 'x'.repeat(500);
    eq(planCompact({text: long}).text, long, 'long text is not truncated (the renderer ellipsizes)');
    eq(planCompact({text: '  padded  '}).text, 'padded', 'text trimmed');
    eq(planCompact({text: '   '}).text, null, 'blank text → null');
    eq(planCompact({}), {leading: null, text: null, trailing: null, action: null, keyline: null, stale: false, light: null, badge: null},
        'empty presentation');
    eq(planCompact({isStale: true, keyline: '#1DB954'}).stale, true, 'isStale → stale');
    eq(planCompact({keyline: '#1DB954'}).keyline, '#1db954', 'keyline carried');
}
{
    const actions = [{label: 'no id'}, {id: 'bare'}, {id: 'a', label: 'A'}, {id: 'b', icon: 'b-symbolic'},
        {id: 'c', label: 'C'}, {id: 'd', label: 'D'}, {id: 'e', label: 'E'}, null, 'str'];
    eq(planCompact({actions}).action, {id: 'a', label: 'A', icon: null},
        'compact keeps the first valid action (no id / no label+icon dropped)');
    eq(planExpanded({actions, expanded: true}).actions.map(a => a.id), ['a', 'b', 'c'], 'expanded keeps 3');
    eq(planCompact({actions: 'nope'}).action, null, 'non-array actions ignored');
}

// --- expanded -------------------------------------------------------------------
eq(planExpanded(media.media(track, null)) !== null, true, 'media has an expanded plan');
eq(planExpanded({text: 'x'}), null, 'no expanded → no plan');
eq(planExpanded({text: 'x', expanded: 'yes'}), null, 'non-object, non-true expanded → no plan');
{
    const e = planExpanded(media.media(track, null));
    eq(e.leading, {type: 'art', src: 'file:///tmp/cover.png', fallback: null},
        'expanded leading from the adapter (size ignored)');
    eq(e.center, {type: 'block', title: 'Monument Valley', subtitle: 'Lumen Coast', bar: null},
        'center block; progress: true is source-driven, not static');
    eq(e.trailing, {type: 'glyph', name: 'eq'}, 'trailing falls back to the compact one');
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
        'expanded: true = enlarged compact, same elements and order (APPLE.md B2)');
}
{
    const e = planExpanded({
        leading: 'a-symbolic', text: 't', trailing: 'b-symbolic',
        expanded: {leading: null, center: {title: 'T', progress: 0.5}, trailing: {icon: 'c-symbolic', priority: 5}},
    });
    eq(e.leading, null, 'explicit null region stays empty');
    eq(e.center, {type: 'block', title: 'T', subtitle: null, bar: 0.5}, 'numeric progress → bar under the text');
    eq(e.trailing, {type: 'icon', icon: 'c-symbolic'}, 'explicit region wins over compact');
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

// ask (kit/stack.js shape): question + one button in compact, every option in expanded
{
    const ask = {
        text: 'Allow edit?', expanded: true,
        actions: [{id: 'Deny', label: 'Deny'}, {id: 'Allow', label: 'Allow'}],
    };
    eq(planCompact(ask).action?.id, 'Deny', 'ask compact shows one button');
    const e = planExpanded(ask);
    eq([e.center?.title, e.bottom, e.actions.map(a => a.id)], ['Allow edit?', {type: 'actions'}, ['Deny', 'Allow']],
        'ask expanded: question + every option');
    eq(e.actions.some(a => 'key' in a), false,
        'no keys without kind ask (only asks are answered from the keyboard)');
    const three = [{id: 'Deny', label: 'Deny'}, {id: 'Allow', label: 'Allow'}, {id: 'Always', label: 'Always'}];
    const keyed = planExpanded({...ask, kind: 'ask', actions: three});
    eq(keyed.actions.map(a => a.key), ['d', '2', '3'], 'ask expanded: each action carries its key (kit/keys.js)');
    eq(planCompact({...ask, kind: 'ask'}).action, {id: 'Deny', label: 'Deny', icon: null}, 'compact ask action has no key');
}

// --- buoy light slot (SPEC §2a-i, INDICATORS.md) ------------------------------------
eq(lightSlot('off', {idle: true}), 'off', 'grey off light only in idle');
eq(lightSlot('off', {idle: false}), null, 'no slot in compact when off');
for (const l of ['missed', 'waiting']) {
    eq(lightSlot(l, {idle: true}), l, `${l} in idle`);
    eq(lightSlot(l, {idle: false}), l, `${l} in compact`);
}
eq(lightSlot('bogus', {idle: true}), 'off', 'unknown light in idle → off');
eq(lightSlot(undefined, {idle: false}), null, 'no light in compact');
eq(planIdle({light: 'missed'}), {light: 'missed'}, 'idle plan carries the light');
eq(planIdle({}), {light: 'off'}, 'idle none: grey light');
eq(planCompact({text: 't'}, {light: 'waiting'}).light, 'waiting', 'compact carries a red light');
eq(planCompact({text: 't'}, {light: 'off'}).light, null, 'compact drops the off light');

// --- peek (hover, Buoy's own; no Apple equivalent) -----------------------------------
eq(planPeek({text: 't'}), null, 'no peek field → no peek');
eq(planPeek({text: 't', peek: true}), null, 'peek must be an object');
eq(planPeek({peek: {}}), null, 'empty peek → no peek');
{
    const acts = [{id: 'prev', icon: 'p-symbolic'}, {id: 'pp', icon: 'q-symbolic'},
        {id: 'next', icon: 'n-symbolic'}, {id: 'x', label: 'X'}];
    const p = planPeek({
        keyline: '#1DB954', isStale: true, actions: acts,
        peek: {leading: 'a-symbolic', text: 'Song', transport: true},
    }, {light: 'missed'});
    eq([p.leading, p.text, p.trailing], [{type: 'icon', icon: 'a-symbolic'}, 'Song', null], 'peek zones');
    eq(p.actions.map(a => a.id), ['prev', 'pp', 'next'], 'transport → up to 3 activity actions');
    eq([p.keyline, p.stale, p.light], ['#1db954', true, 'missed'], 'peek inherits keyline, stale, light');
    eq(planPeek({actions: acts, peek: {text: 'x'}}).actions, [], 'no transport → no buttons');
    eq(planPeek({peek: {transport: true}}), null, 'transport without actions or content → no peek');
}

// --- +N badge (SPEC §2c: the last pill carries it) ----------------------------------
eq(planCompact({text: 't'}, {more: 2}).badge, '+2', '+N badge');
for (const none of [0, -1, undefined, NaN, '3'])
    eq(planCompact({text: 't'}, {more: none}).badge, null, `no badge for ${none}`);
eq(planCompact({}, {more: 4}).badge, '+4', 'badge alone still counts as content');

console.log('presentation: ok');

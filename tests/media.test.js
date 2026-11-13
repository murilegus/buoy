// Run: gjs -m tests/media.test.js   (no Shell needed; adapters are pure)
import adapter, {transport, liveOf, ICON, PAUSED_ICON, PAUSED_EQ} from '../src/buoy@murilegus/lib/modules/media/adapter.js';
import spotify from '../src/buoy@murilegus/lib/modules/media/apps/spotify.js';
import {planMinimal, planCompact, planExpanded} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {artSide, cardHeight, subLine, controls, seekOf, chipNames} from '../src/buoy@murilegus/lib/modules/media/layout.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const raise = () => {}, onAction = () => {};
const track = {
    id: 'org.mpris.MediaPlayer2.spotify', title: 'Monument Valley', artist: 'Lumen Coast',
    album: 'Tides', art: 'https://i.scdn.co/image/ab', appName: 'Spotify', status: 'Playing',
    canPrev: true, canNext: true, canSeek: true, position: 92000, length: 221000, at: 1000,
    shuffle: false, loop: 'None', raise, onAction,
};

// --- minimal: art · title · artist · equaliser / ⏸, no button (Ethan, 2026-11-05) ----------
const p = adapter.media(track, null);
eq(p.text, 'Monument Valley · Lumen Coast', 'title · artist');
eq(p.leading, {art: 'https://i.scdn.co/image/ab', icon: ICON}, 'art with the generic icon behind it');
eq(p.trailing, 'eq', 'playing: the equaliser');
eq(adapter.media({...track, status: 'Paused'}, null).trailing, PAUSED_EQ, 'paused: the equaliser stopped low (was ⏸)');
// the equaliser in the cover's main colour (design/pill "Equaliser", 2026-11-13)
const tinted = adapter.media({...track, tint: '#db286a'}, null);
eq(tinted.trailing, {glyph: 'eq', color: '#db286a'}, 'a cover colour: the equaliser takes it');
eq(adapter.media({...track, tint: '#db286a', status: 'Paused'}, null).trailing, {glyph: PAUSED_EQ, color: '#db286a'}, 'paused: stopped low, the same colour');
eq([adapter.media({...track, tint: ''}, null).trailing, adapter.media({...track, tint: null}, null).trailing, adapter.media({...track, tint: 7}, null).trailing],
    ['eq', 'eq', 'eq'], 'no colour (a cover without one, or not read yet): the plain equaliser');
eq([tinted.attributes.tint, p.attributes.tint], ['#db286a', null], 'the colour as an attribute too: the Media tab\'s chips');
eq(planMinimal(tinted).trailing, {type: 'glyph', name: 'eq', color: '#db286a'}, 'the pill\'s trailing carries it');
eq(planMinimal(p).action, null, 'no button in minimal');
eq(planMinimal(p, {side: true}).text, null, 'side pill: art + glyph only');
eq([p.onPress, p.onAction], [raise, onAction], 'click raises the player; buttons go to the source');

// --- paused pills wait (the kit's linger, 2026-11-07), playing ones stay -------------------
eq([p.ttl ?? 0, p.linger], [0, false], 'playing: until it stops');
eq([adapter.media({...track, status: 'Paused'}, null).linger, adapter.media({...track, status: 'Paused'}, null).ttl ?? 0], [true, 0],
    'paused: it waits (the kit ends it after activity-linger), no ttl of its own');
eq([adapter.media({...track, status: 'Paused'}, null).staleAfter, p.staleAfter], [10000, 0],
    'paused: dims after 10 s and steps behind what plays (PRIORITY.md); playing never stale');

// --- transport: only what the player can -------------------------------------------------
eq(transport(track).map(a => a.id), ['prev', 'playpause', 'next'], 'all three');
eq(transport({...track, canPrev: false, canNext: false}).map(a => a.id), ['playpause'], 'a player that cannot skip');
eq(transport(track)[1].icon, PAUSED_ICON, 'playing: the button pauses');
eq(transport({...track, status: 'Paused'})[1].icon, 'media-playback-start-symbolic', 'paused: the button plays');

// --- compact: two lines, transport, live position ----------------------------------------
const c = planCompact(p);
eq([c.text, c.subtitle], ['Monument Valley', 'Lumen Coast · Spotify'], 'title over artist · app');
eq(c.actions.map(a => a.id), ['prev', 'playpause', 'next'], 'transport in the compact');
eq(c.live, {position: 92000, length: 221000, at: 1000, playing: true}, 'a live position');
// the equaliser in the ⏸ slot, as on the pill (design/compact "Nhạc", 2026-11-13)
eq(c.trailing, {type: 'glyph', name: 'eq'}, 'playing: the equaliser in the compact');
eq(planCompact(adapter.media({...track, status: 'Paused'}, null)).trailing, {type: 'glyph', name: PAUSED_EQ}, 'paused: stopped low');
eq(adapter.media({...track, tint: '#db286a'}, null).compact.trailing, {glyph: 'eq', color: '#db286a'}, 'the compact\'s in the cover\'s colour too');
eq(planCompact(adapter.media({...track, length: 0}, null)).live, null, 'no length (a stream): no bar');
eq(planCompact(adapter.media({...track, position: undefined}, null)).live, null, 'no position: no bar');
eq(adapter.media({...track, compactOnHover: false}, null).compact, null, '`media-compact-on-hover` off: no compact');
eq(liveOf({...track, status: 'Paused'}).playing, false, 'paused: the bar holds');

// --- expanded (an alert): art, title, artist, transport ------------------------------------
const e = planExpanded(p);
if (!e || e.actions.length !== 3)
    throw new Error('expanded keeps the transport');

// --- missing and odd fields ----------------------------------------------------------------
const bare = adapter.media({id: 'x', status: 'Playing'}, null);
eq([bare.text, bare.leading.art], ['Unknown title', null], 'no metadata: a title, the icon');
eq(adapter.media({...track, artist: ''}, null).text, 'Monument Valley', 'no artist: the title alone');
eq(planCompact(adapter.media({...track, artist: '', appName: ''}, null)).subtitle, null, 'no artist nor app: no subtitle');
const long = 'x'.repeat(400);
eq(adapter.media({...track, title: long}, null).text, `${long} · Lumen Coast`, 'long text is not cut (the renderer ellipsizes)');

// --- a profile's title template is the registry's job (tests/registry.test.js) -----------
eq(adapter.media(track, {title: 'custom'}).text, 'Monument Valley · Lumen Coast', 'adapter ignores profile.title');

// --- Spotify: an ad says "Ad" and counts down to its end -------------------------------
const ad = {...track, ad: true, title: 'Advertisement', position: 5000, length: 30000, at: 10000};
const q = spotify.media(ad, null);
eq(q.text, 'Ad', 'ad text');
eq(q.trailing, {until: 35000}, 'counts down to at + length − position');
eq(q.actions.map(a => a.id), ['playpause'], 'nothing to skip');
eq([q.compact.text, q.compact.subtitle, q.compact.transport], ['Advertisement', 'Spotify', false], 'ad compact');
eq(spotify.media({...ad, status: 'Paused'}, null).trailing, PAUSED_EQ, 'a paused ad: no countdown');
eq(spotify.media(track, null).text, 'Monument Valley · Lumen Coast', 'a song through the override: unchanged');

// ARCHITECTURE rule 11: no measurements anywhere in adapter output
const MEASURES = new Set(['size', 'width', 'height', 'x', 'y', 'px']);
function noMeasures(v, path) {
    if (v === null || typeof v !== 'object')
        return;
    for (const [k, child] of Object.entries(v)) {
        if (MEASURES.has(k))
            throw new Error(`${path}.${k}: adapters must not send measurements`);
        noMeasures(child, `${path}.${k}`);
    }
}
noMeasures(p, 'media');
noMeasures(q, 'spotify ad');

{
    // what the player can do: the tab's controls (design/media, 2026-11-13)
    const st = adapter.media({...track, canPrev: false, canNext: true, appIcon: 'gicon'}, null);
    eq([st.state.canPrev, st.state.canNext, st.attributes.appIcon], [false, true, 'gicon'], 'canPrev, canNext and the app icon pass through');
    eq(adapter.media({...track, appIcon: undefined}, null).attributes.appIcon, null, 'no app icon: null');
}

// --- the Media tab (layout.js, design/media M1, 2026-11-13) ---------------------------------
eq([cardHeight(212, 1), cardHeight(276, 1), cardHeight(308, 1)], [212, 276, 308], 'one player: the card is the body (1920 / 2560 / 3440)');
eq(cardHeight(212, 2), 172, 'more players: less the chips 32 and 8');
eq([cardHeight(NaN, 1), cardHeight(20, 3)], [0, 0], 'nothing measured, or too short: 0, never negative');
eq([artSide(212), artSide(276), artSide(308), artSide(172)], [196, 260, 292, 156], 'the art: the card less 8 above and below');
eq([artSide(10), artSide(undefined)], [0, 0], 'never negative');
eq(subLine({artist: 'Hải Đăng', app: 'Spotify', album: 'X'}), 'Hải Đăng · Spotify', 'artist · player; the album has its own line');
eq([subLine({app: 'Firefox'}), subLine({artist: 'A', app: ' '}), subLine()], ['Firefox', 'A', ''], 'what is there');
eq(subLine({artist: 'Hải Đăng', app: 'Spotify', album: 'X'}, {album: true}), 'Hải Đăng · X · Spotify', 'album joined: artist · album · player');
eq([subLine({album: 'X', app: 'VLC'}, {album: true}), subLine({artist: 'A', album: '  '}, {album: true}), subLine({album: 'X'}, {album: true})],
    ['X · VLC', 'A', 'X'], 'album joined: only what is there');
eq(subLine({artist: 'A', album: 'X', app: 'P'}, {album: false}), 'A · P', 'album: false keeps it out');
eq(subLine({}, {album: true}), '', 'album joined, nothing at all');

const ids = list => list.map(k => `${k.id}:${k.enabled ? '+' : '-'}${k.on ? '*' : ''}`);
eq(ids(controls({status: 'Playing', canPrev: true, canNext: true, shuffle: false, loop: 'None'})),
    ['shuffle:+', 'prev:+', 'playpause:+', 'next:+', 'loop:+'], 'a full player: all five, none on');
eq(ids(controls({status: 'Playing', canPrev: false, canNext: false, shuffle: null, loop: null})),
    ['shuffle:-', 'prev:-', 'playpause:+', 'next:-', 'loop:-'], 'play/pause only (a web page): all five, the rest disabled');
eq(ids(controls({status: 'Paused', canPrev: true, canNext: true, shuffle: true, loop: 'Track'})),
    ['shuffle:+*', 'prev:+', 'playpause:+', 'next:+', 'loop:+*'], 'shuffle and repeat on');
eq(controls({status: 'Paused'})[2].icon, 'media-playback-start-symbolic', 'paused: ▶');
eq(controls({status: 'Playing'})[2].icon, 'media-playback-pause-symbolic', 'playing: ⏸');
eq([controls({loop: 'Track'})[4].icon, controls({loop: 'Playlist'})[4].icon], ['media-playlist-repeat-song-symbolic', 'media-playlist-repeat-symbolic'],
    'repeat one track: its own icon');
eq(controls({loop: 'None'})[4].on, false, 'repeat off');
eq(controls().map(k => k.kind), ['toggle', 'skip', 'main', 'skip', 'toggle'], 'their looks: toggles, skips, the main one');

const live = {position: 1000, length: 60000, at: 0, playing: true};
eq(seekOf({canSeek: true, live}), {live, enabled: true}, 'a track the player can seek');
eq(seekOf({canSeek: false, live}).enabled, false, 'can not seek: disabled, still there');
eq(seekOf({canSeek: true, live: null}), {live: null, enabled: false}, 'a stream (no length): empty and disabled');
eq(seekOf({canSeek: true, live: {...live, length: 0}}).live, null, 'a zero length is none');

const w = [{named: 100, logo: 40}, {named: 90, logo: 56}, {named: 120, logo: 40}];
eq(chipNames(w, 0, 400, 6), [true, true, true], 'they fit: every chip named');
eq(chipNames(w, 1, 300, 6), [false, true, false], 'they do not: only the chosen one named');
eq(chipNames(w, 0, 322, 6), [true, true, true], 'exactly the room: named');
eq(chipNames([], 0, 300, 6), [], 'no chips');

console.log('media adapter: ok');

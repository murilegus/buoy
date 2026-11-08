// Run: gjs -m tests/media.test.js   (no Shell needed; adapters are pure)
import adapter, {transport, liveOf, ICON, PAUSED_ICON, PAUSED_EQ} from '../src/buoy@murilegus/lib/modules/media/adapter.js';
import spotify from '../src/buoy@murilegus/lib/modules/media/apps/spotify.js';
import {planMinimal, planCompact, planExpanded} from '../src/buoy@murilegus/lib/kit/presentation.js';
import {artSize, metaLine, ART_MIN, ART_MAX} from '../src/buoy@murilegus/lib/modules/media/layout.js';

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

// --- the tab's layout A (layout.js, 2026-11-08): the art as tall as the room ---------------
eq(artSize(205, 524), 204, '1920 / 1366, one player: the room 205 tall decides, even → 204');
eq(artSize(173, 524), 172, '1920, two players: the room under the chips (173) → 172');
eq(artSize(283, 680), 272, '2560: the width caps it (40% of 680 = 272)');
eq(artSize(305, 720), ART_MAX, 'a room and width past the cap → ART_MAX');
eq(artSize(150, 900), 150, 'a short room on a wide tab: the room decides');
eq(artSize(151, 900), 150, 'rounded down to even');
eq(artSize(40, 524), ART_MIN, 'never under ART_MIN');
eq(artSize(205, 100), ART_MIN, 'a narrow tab still gets ART_MIN');
eq(artSize(NaN, 524), ART_MIN, 'no room measured yet → ART_MIN');
eq(artSize(205, undefined), ART_MIN, 'no width measured yet → ART_MIN');
eq(metaLine({album: 'Single', app: 'Rhythmbox'}), 'Single · Rhythmbox', 'album · app');
eq(metaLine({app: 'Firefox'}), 'Firefox', 'no album: the app alone');
eq(metaLine({album: 'Tides', app: ' '}), 'Tides', 'a blank app is dropped');
eq(metaLine({}), '', 'neither');
eq(metaLine(), '', 'no attributes');
const longAlbum = 'An album title long enough to need the label to ellipsize it on screen';
eq(metaLine({album: longAlbum, app: 'Spotify'}), `${longAlbum} · Spotify`, 'long text is not cut here (the label ellipsizes)');

console.log('media adapter: ok');

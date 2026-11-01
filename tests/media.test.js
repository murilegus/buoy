// Run: gjs -m tests/media.test.js   (no Shell needed; adapters are pure)
import adapter from '../src/buoy@murilegus/lib/modules/media/adapter.js';
import spotify from '../src/buoy@murilegus/lib/modules/media/apps/spotify.js';

const track = {id: 'x', title: 'Monument Valley', artist: 'Lumen Coast', status: 'Playing', art: null};
const ad = {...track, title: 'Advertisement', length: 30};

const p = adapter.media(track, null);
if (p.text !== 'Monument Valley · Lumen Coast') throw new Error(`default text: ${p.text}`);
if (p.trailing.icon !== 'eq') throw new Error('playing glyph');

const q = spotify.media(ad, null);
if (q.text !== 'Ad') throw new Error(`spotify ad text: ${q.text}`);
if (q.trailing.countdown !== 30) throw new Error('ad countdown');

const r = adapter.media(track, {title: 'custom'});
if (r.text !== 'custom') throw new Error('profile title override');

console.log('media adapter: ok');

// Run: gjs -m tests/media.test.js   (no Shell needed; adapters are pure)
import adapter from '../src/buoy@murilegus/lib/modules/media/adapter.js';
import spotify from '../src/buoy@murilegus/lib/modules/media/apps/spotify.js';

const track = {id: 'x', title: 'Monument Valley', artist: 'Lumen Coast', status: 'Playing', art: null};
const ad = {...track, title: 'Advertisement', length: 30};

const p = adapter.media(track, null);
if (p.text !== 'Monument Valley · Lumen Coast')
    throw new Error(`default text: ${p.text}`);
if (p.trailing.icon !== 'eq')
    throw new Error('playing glyph');

const q = spotify.media(ad, null);
if (q.text !== 'Ad')
    throw new Error(`spotify ad text: ${q.text}`);
if (q.trailing.countdown !== 30)
    throw new Error('ad countdown');

// a profile's title template is the registry's job (tests/registry.test.js), not the adapter's
const r = adapter.media(track, {title: 'custom'});
if (r.text !== 'Monument Valley · Lumen Coast')
    throw new Error(`adapter must not apply the profile title itself: ${r.text}`);

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

console.log('media adapter: ok');

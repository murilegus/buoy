import base, {liveOf} from '../adapter.js';

// Spotify: an ad comes as a track whose id is under /com/spotify/ad/ (older builds: the
// title 'Advertisement'); the source sets `ev.ad`. The pill says "Ad" and counts down to
// its end; nothing to skip, so no transport.
export default {
    media(ev, profile) {
        const p = /** @type {Record<string, any>} a presentation (CONTRACT.md) */ (base.media(ev, profile));
        if (!ev.ad)
            return p;
        const live = liveOf(ev);
        const end = live && live.playing && live.at ? live.at + live.length - live.position : null;
        p.text = 'Ad';
        p.trailing = end ? {until: end} : p.trailing;
        p.actions = p.actions.filter(a => a.id === 'playpause');
        if (p.compact)
            p.compact = {...p.compact, text: 'Advertisement', subtitle: 'Spotify', transport: false};
        return p;
    },
};

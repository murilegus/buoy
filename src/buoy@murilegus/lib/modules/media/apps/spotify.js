import base from '../adapter.js';

// Spotify: ads arrive as metadata with title 'Advertisement'.
export default {
    media(ev, profile) {
        const p = base.media(ev, profile);
        if (ev.title === 'Advertisement') {
            p.text = 'Ad';
            p.trailing = {countdown: ev.length};
        }
        return p;
    },
};

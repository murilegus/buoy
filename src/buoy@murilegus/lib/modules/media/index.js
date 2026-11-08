import {MprisSource} from './source.js';
import adapter from './adapter.js';
import spotify from './apps/spotify.js';
import {MediaTab} from './tab.js';
import {MediaHome} from './home.js';

export default {
    id: 'media',
    title: 'Media',
    icon: 'audio-x-generic-symbolic',
    kinds: ['media'],
    source: MprisSource,
    adapter,
    tab: MediaTab,
    // Home's Now playing, in its start column (SPEC §3)
    home: {Block: MediaHome, column: 'start', order: 0},
    apps: {spotify},
};

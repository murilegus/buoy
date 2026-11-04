import {MprisSource} from './source.js';
import adapter from './adapter.js';
import spotify from './apps/spotify.js';
import {MediaTab} from './tab.js';

export default {
    id: 'media',
    title: 'Media',
    icon: 'audio-x-generic-symbolic',
    kinds: ['media'],
    source: MprisSource,
    adapter,
    tab: MediaTab,
    apps: {spotify},
};

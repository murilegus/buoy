import {MprisSource} from './source.js';
import adapter from './adapter.js';
import spotify from './apps/spotify.js';
import {MediaTab} from './tab.js';
import {MediaCard} from './home.js';

export default {
    id: 'media',
    title: 'Media',
    icon: 'audio-x-generic-symbolic',
    kinds: ['media'],
    source: MprisSource,
    adapter,
    tab: MediaTab,
    // Home's main card while a player is first in the stack (design/home)
    home: {Card: MediaCard},
    apps: {spotify},
};

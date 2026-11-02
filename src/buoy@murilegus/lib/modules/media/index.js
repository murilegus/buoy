import {MprisSource} from './source.js';
import adapter from './adapter.js';
import spotify from './apps/spotify.js';

export default {
    id: 'media',
    title: 'Media',
    icon: 'audio-x-generic-symbolic',
    kinds: ['media'],
    source: MprisSource,
    adapter,
    apps: {spotify},
    schema: {'media-peek-on-hover': {type: 'b', default: true}},
};

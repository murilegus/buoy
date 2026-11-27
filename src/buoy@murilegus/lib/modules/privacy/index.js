import {PrivacySource} from './source.js';
import adapter from './adapter.js';
import {InUseGlance} from './glance.js';

// The privacy dot and the screen's activities (FEATURES M4 "Privacy dot"): the microphone,
// the camera and the screen as one dot at pill 1's right end; a recording or a share in
// the pill with its clock and Stop, in place of GNOME's buttons in the bar. No tab
// (design/compact): a click opens Home, where the recording is the main card or a tile.
// "In a call" (camera and microphone) and Home's "in use" tile: design/compact "Đang gọi" (2026-11-27).
export default {id: 'privacy', kinds: ['screen'], noTab: true, source: PrivacySource, adapter, home: {Glance: InUseGlance, order: 5}};

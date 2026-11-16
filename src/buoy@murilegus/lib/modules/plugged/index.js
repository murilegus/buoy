import {PluggedSource} from './source.js';
import adapter from './adapter.js';

// A display or headphones plugged in (FEATURES M4 "Headphones / display plugged"): a 3 s flash;
// a display's, hovered, has Join / Mirror / External Only. No tab: a click opens Settings →
// Displays or Sound; the Device tab lists them once it is made.
export default {id: 'plugged', kinds: ['device'], noTab: true, source: PluggedSource, adapter};

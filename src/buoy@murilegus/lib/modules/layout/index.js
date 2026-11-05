import {LayoutSource} from './source.js';
import adapter from './adapter.js';

// The input source as feedback (SPEC §2e): a short pill when it changes. No tab.
export default {id: 'layout', kinds: ['layout'], source: LayoutSource, adapter};

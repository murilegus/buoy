import {InputChangeSource} from './source.js';
import adapter from './adapter.js';

// The input source as feedback (SPEC §2e): a short pill when it changes. No tab.
export default {id: 'input', kinds: ['input'], source: InputChangeSource, adapter};

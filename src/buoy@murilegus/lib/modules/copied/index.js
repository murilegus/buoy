import {ClipboardSource} from './source.js';
import adapter from './adapter.js';

// The copied feedback (SPEC §2e): a short flash of what you copied. Its own module again
// since 2026-11-07 (Ethan): the flash and the Clipboard tab are switched on and off apart
// (modules-copied, modules-clipboard). Was one module `clipboard` from 2026-11-05.
export default {
    id: 'copied',
    kinds: ['copied'],
    source: ClipboardSource,
    adapter,
};

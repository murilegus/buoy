import {ClipboardSource} from './source.js';
import adapter from './adapter.js';
import {ClipboardTab} from './tab.js';

// The copied feedback (SPEC §2e) and the Clipboard tab (SPEC §2b): `copied` is a feedback
// kind, so the module has no kind tab; its tab.js is standalone, in ⋯ until pinned (empty
// until the M5 history). Was two modules, `copied` and `clipboard` (2026-11-05).
export default {
    id: 'clipboard',
    title: 'Clipboard',
    icon: 'edit-paste-symbolic',
    kinds: ['copied'],
    source: ClipboardSource,
    adapter,
    tab: ClipboardTab,
};

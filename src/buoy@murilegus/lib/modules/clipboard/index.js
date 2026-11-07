import {ClipboardTab} from './tab.js';

// The Clipboard tab (SPEC §2b): standalone, in the strip's slot or pinned, in ⋯ until
// then (empty until the M5 history). The copied flash is the `copied` module (split again
// 2026-11-07, Ethan: two switches in prefs).
export default {
    id: 'clipboard',
    title: 'Clipboard',
    icon: 'edit-paste-symbolic',
    kinds: [],
    source: null,
    adapter: {},
    tab: ClipboardTab,
};

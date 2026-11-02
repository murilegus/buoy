import {ClipboardTab} from './tab.js';

// Standalone tab (SPEC §2b): no kinds, no source; lives in ⋯ until pinned. Empty for now.
export default {
    id: 'clipboard',
    title: 'Clipboard',
    icon: 'edit-paste-symbolic',
    kinds: [],
    source: null,
    adapter: {},
    tab: ClipboardTab,
};

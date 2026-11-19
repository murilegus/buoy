import {AttentionSource} from './source.js';
import adapter from './adapter.js';

// A window that asks for attention (FEATURES M4 "Attention on another workspace"; design/compact
// "Cửa sổ cần chú ý", 2026-11-19, Ethan): a pill that stays till you go to it, in place of GNOME's
// "“…” is ready" notification. No tab: its pill's click goes to the window.
export default {
    id: 'attention',
    title: 'Attention',
    icon: 'view-app-grid-symbolic',
    kinds: ['attention'],
    source: AttentionSource,
    adapter,
    noTab: true,
};

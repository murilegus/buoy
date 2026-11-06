import {ProgressSource} from './source.js';
import adapter from './adapter.js';
import {TransfersTab} from './tab.js';

// App progress from Unity's LauncherEntry and browser downloads from their partial files
// (SPEC §6c): one pill per app or file, the Transfers tab.
export default {
    id: 'progress',
    title: 'Transfers',
    icon: 'folder-download-symbolic',
    kinds: ['progress'],
    source: ProgressSource,
    adapter,
    tab: TransfersTab,
};

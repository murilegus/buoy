import {LauncherEntrySource} from './source.js';
import adapter from './adapter.js';
import {TransfersTab} from './tab.js';

// App progress from Unity's LauncherEntry (SPEC §6c): one pill per app, the Transfers tab.
export default {
    id: 'progress',
    title: 'Transfers',
    icon: 'folder-download-symbolic',
    kinds: ['progress'],
    source: LauncherEntrySource,
    adapter,
    tab: TransfersTab,
};

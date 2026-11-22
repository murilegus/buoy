import {TerminalSource} from './source.js';
import adapter from './adapter.js';

// A terminal command that finished in a tab you are not in (FEATURES M4 "Terminal command
// finished in an unfocused tab"; design/compact "Lệnh terminal xong", 2026-11-21, Ethan):
// Ptyxis's "Command completed" as a pill, its exit code and time from Buoy's shell hook. No tab:
// its pill's click goes to the terminal's tab.
export default {
    id: 'terminal',
    title: 'Terminal',
    icon: 'utilities-terminal-symbolic',
    kinds: ['terminal'],
    source: TerminalSource,
    adapter,
    noTab: true,
};

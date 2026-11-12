import {AgentSource} from './source.js';
import adapter from './adapter.js';
import {AgentsTab} from './tab.js';

// Coding agents' sessions in the pill (docs/CODING-AGENTS.md): Claude Code's hooks call
// D-Bus `Agent`; one pill per session, Bu's pose from each event, permission prompts as
// asks, and the Claude Code tab listing the sessions. Kind `ask` is this module's too:
// a click on a prompt's pill opens this tab (2026-11-07; replaces the stub `ask`).
export default {
    id: 'agent',
    title: 'Claude Code',
    // Claude's tray glyph, the white one for a dark bar, as Claude Desktop installs it
    // (Ethan 2026-11-07: the tray's mark, not the app icon); not shipped with Buoy, and
    // without Claude Desktop the strip's generic icon (kit/ui/present/elements.js iconProps)
    icon: '/usr/lib/claude-desktop/resources/TrayIconLinux-Dark.png',
    // the tab only while a session or a prompt is there (Ethan, 2026-11-07)
    tabWhileLive: true,
    kinds: ['agent', 'ask'],
    source: AgentSource,
    adapter,
    tab: AgentsTab,
};

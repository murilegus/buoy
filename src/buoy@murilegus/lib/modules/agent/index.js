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
    // Claude Desktop's own icon (hicolor `claude-desktop`, Ethan 2026-11-07); not
    // installed (the CLI alone), the strip's generic one (kit/home.js)
    icon: 'claude-desktop',
    // the tab only while a session or a prompt is there (Ethan, 2026-11-07)
    tabWhileLive: true,
    kinds: ['agent', 'ask'],
    source: AgentSource,
    adapter,
    tab: AgentsTab,
};

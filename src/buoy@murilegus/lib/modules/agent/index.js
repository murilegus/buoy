import {AgentSource} from './source.js';
import adapter from './adapter.js';

// Coding agents' sessions in the pill (docs/CODING-AGENTS.md): Claude Code's hooks call
// D-Bus `Agent`; one pill per session, Bu's pose from each event, permission prompts as
// asks. Replaces the stub `ask` module (2026-11-07).
export default {
    id: 'agent',
    kinds: ['agent'],
    source: AgentSource,
    adapter,
};

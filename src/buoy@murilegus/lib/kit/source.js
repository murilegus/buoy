/**
 * Base class for a module's source.js. A source watches one system facility
 * and calls stack.surface / update / end. Event-driven only — never poll
 * while the activity is not visible. disable() ends every activity it surfaced:
 * a module turned off in prefs leaves nothing behind (2026-11-03).
 */
export class Source {
    enable(stack) {
        this._stack = stack;
    }

    disable() {
        this._stack = null;
    }
}

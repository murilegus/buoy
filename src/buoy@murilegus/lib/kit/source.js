/**
 * Base class for a module's source.js. A source watches one system facility
 * and calls stack.surface / update / end. Event-driven only — never poll
 * while the activity is not visible.
 */
export class Source {
    enable(stack) {
        this._stack = stack;
    }

    disable() {
        this._stack = null;
    }
}

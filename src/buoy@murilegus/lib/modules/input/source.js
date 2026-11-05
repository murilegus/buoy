import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {getInputSourceManager} from 'resource:///org/gnome/shell/ui/status/keyboard.js';

import {Source} from '../../kit/source.js';
import {labelOf, shouldFlash} from './adapter.js';

const ID = 'input';

/**
 * The input source as feedback (SPEC §2e). Shell's InputSourceManager (ui/status/
 * keyboard.js) covers xkb layouts and IBus engines alike and emits
 * `current-source-changed`: with the old source on a switch (Super+Space, the menu, a
 * per-window source on focus), with null when the current source's IBus properties are
 * registered or updated — an engine's own mode, such as Bamboo's V / E. The pill shows
 * what Shell's indicator shows (labelOf) and the source's name; nothing at enable, and
 * nothing when a property update leaves the label as it was. Signals only.
 */
export class InputChangeSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._manager = getInputSourceManager();
        this._last = labelOf(plain(this._manager.currentSource));
        this._changedId = this._manager.connect('current-source-changed', (_m, old) => this._changed(old));
    }

    _changed(old) {
        const now = this._manager?.currentSource ?? null;
        const source = plain(now);
        const label = labelOf(source);
        const flash = shouldFlash({switched: !!old && old !== now, label, lastLabel: this._last});
        this._last = label;
        if (!flash || !this._stack)
            return;
        const a = this._registry?.build('input', 'system', {
            id: ID, label, name: source.displayName ?? '', open: openPanel,
        });
        if (!a)
            return;
        if (this._stack.has(a.id) && this._stack.update(a.id, a))
            return;
        this._stack.surface(a);
    }

    disable() {
        if (this._changedId)
            this._manager.disconnect(this._changedId);
        this._changedId = 0;
        this._manager = null;
        if (this._stack?.has(`input:system:${ID}`))
            this._stack.end(`input:system:${ID}`);
        super.disable();
    }
}

// Shell's InputSource and its IBus.PropList, as the plain data labelOf() reads.
function plain(source) {
    if (!source)
        return null;
    const props = [];
    const list = source.properties ?? null;
    for (let i = 0, p; list && (p = list.get(i)) !== null; i++) {
        props.push({
            key: p.get_key(), visible: p.get_visible(),
            symbol: p.get_symbol?.()?.get_text() ?? '', label: p.get_label?.()?.get_text() ?? '',
        });
    }
    return {shortName: source.shortName, displayName: source.displayName, props};
}

// A click opens Keyboard settings, as Shell's own menus open their panels.
function openPanel(desktopId) {
    const app = Shell.AppSystem.get_default().lookup_app(desktopId);
    if (!app)
        return;
    Main.overview.hide();
    app.activate();
}

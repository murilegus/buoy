import Shell from 'gi://Shell';

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {getInputSourceManager, InputSourcePopup} from 'resource:///org/gnome/shell/ui/status/keyboard.js';

import {Source} from '../../kit/source.js';
import {CHAIN_MS, labelOf, primaryModifier, shouldFlash, switchStep} from './adapter.js';

const ID = 'input';

/**
 * The input source as feedback (SPEC §2e). Shell's InputSourceManager (ui/status/
 * keyboard.js) covers xkb layouts and IBus engines alike and emits
 * `current-source-changed`: with the old source on a switch (Super+Space, the menu, a
 * per-window source on focus), with null when the current source's IBus properties are
 * registered or updated — an engine's own mode, such as Bamboo's V / E. The pill shows
 * what Shell's indicator shows (labelOf) and the source's name; nothing at enable, and
 * nothing when a property update leaves the label as it was. Signals only.
 *
 * With `input-replace-switcher` on, holding Super+Space no longer opens GNOME's
 * switcher list: the keybinding calls a bound _switchInputSource (keyboard.js, so it
 * cannot be wrapped), which builds an InputSourcePopup and calls show(); returning false
 * from show() makes it fade and destroy the popup before it ever appears or grabs. In
 * its place each press switches at once — the source used before, as the switcher's
 * first pick; with Super still held, one further along the MRU list taken at the first
 * press (switchStep) — and the pill above shows the result.
 */
export class InputChangeSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._manager = getInputSourceManager();
        this._last = labelOf(plain(this._manager.currentSource));
        this._changedId = this._manager.connect('current-source-changed', (_m, old) => this._changed(old));

        this._chain = null;
        this._injections = new InjectionManager();
        const source = this;
        this._injections.overrideMethod(InputSourcePopup.prototype, 'show', original => function (backward, binding, mask) {
            // eslint-disable-next-line no-invalid-this -- the popup Shell built
            const popup = this;
            if (!source._replacingSwitcher())
                return original.call(popup, backward, binding, mask);
            popup.opacity = 0;                 // destroyed at once, never faded in
            source._press(popup._items, backward, mask);
            return false;                      // _switchInputSource fades and destroys it
        });
    }

    _replacingSwitcher() {
        return this._stack !== null && this._settings?.get_boolean('input-replace-switcher') !== false;
    }

    // One Super+Space press: pick from the MRU list of the chain's first press.
    _press(items, backward, mask) {
        const now = GLib.get_monotonic_time() / 1000;
        const [, , mods] = global.get_pointer();
        const modifier = primaryModifier(mask);
        const held = !!(modifier && mods & modifier);
        const chain = this._chain && now - this._chain.at < CHAIN_MS ? this._chain : null;
        const list = chain?.list ?? [...items];
        const step = switchStep({n: list.length, chain: chain?.step ?? null, backward});
        this._chain = held && step !== null ? {list, step, at: now} : null;
        if (step !== null)
            list[step].activate(true);
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
        this._injections?.clear();
        this._injections = null;
        this._chain = null;
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

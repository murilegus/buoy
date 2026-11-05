import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    planPrefs, nestedIn, setPinned, addApp, sampleFor, packDict, switchOn, switchValue, GNOME_CLOCK, GNOME_DOCK,
    NESTED, SLIDERS, choiceLabel, dockMonitor, dockMonitorChoices, dockMonitorValue, displaysFromState,
} from './lib/kit/settings.js';
import {slugOf, profileDir} from './lib/kit/registry.js';
import {PATH} from './lib/kit/dbus.js';

const IFACE = 'org.gnome.Shell.Extensions.Buoy';

/**
 * Buoy's prefs (FEATURES M1 "GSettings schema + prefs.js", 2026-11-03). The schema XML is
 * the source of every key's title and text; lib/kit/settings.js says where it goes.
 *
 *   Island    when idle (idle-content), each idle plan's keys, the pill (expanded width,
 *             Super+B, when Bu rests), developer mode, version (was General, 2026-11-04)
 *   Modules   one expander per module: its switch, its own keys, a pin for standalone
 *             tabs, "Show a sample" (Surface over D-Bus, like any script)
 *   Apps      hidden and plain apps (slugged as the registry does), the profiles folder
 *   Panel     the top bar's clusters (M2)
 */
/**
 * An Adw row whose title and subtitle are plain text. Adw rows read them as Pango markup
 * by default, so schema text such as "Date & Time" warned and showed nothing
 * (2026-11-05). use_markup goes first: GObject sets construct properties in no promised
 * order, and a subtitle set before it is still parsed.
 *
 * @param {Function} Cls  an Adw.PreferencesRow subclass
 * @param {object} props  its properties; title and subtitle are set afterwards
 * @param {string} [props.title]
 * @param {string} [props.subtitle]
 * @returns {Adw.PreferencesRow}
 */
function textRow(Cls, {title = '', subtitle, ...props}) {
    const row = new Cls({...props, use_markup: false});
    row.title = title;
    if (subtitle !== undefined)
        row.subtitle = subtitle;
    return row;
}

export default class BuoyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        this._settings = settings;
        this._window = window;
        // rows listen to the settings; the settings outlive the window
        this._ids = [];
        window.connect('close-request', () => {
            for (const id of this._ids)
                settings.disconnect(id);
            this._ids = [];
            return false;
        });
        const schema = settings.settings_schema;
        const plan = planPrefs(this._schemaOrder(schema).map(name => ({name})));
        const key = name => schema.get_key(name);

        window.set_default_size(620, 640);
        window.search_enabled = true;
        window.add(this._islandPage(plan, key));
        window.add(this._modulesPage(plan, key));
        window.add(this._appsPage(plan, key));
        window.add(this._panelPage(plan, key));
        window.add(this._windowsPage(plan, key));
    }

    // Keys in the order the XML lists them (list_keys() sorts by name).
    _schemaOrder(schema) {
        const path = `${this.path}/schemas/org.gnome.shell.extensions.buoy.gschema.xml`;
        try {
            const [, bytes] = GLib.file_get_contents(path);
            const names = [...new TextDecoder().decode(bytes).matchAll(/<key name="([^"]+)"/g)].map(m => m[1]);
            return names.filter(n => schema.has_key(n));
        } catch {
            return schema.list_keys(); // installed without the XML: alphabetical is fine
        }
    }

    // --- Island -------------------------------------------------------------------------

    // Island (ARCHITECTURE rule 9, SPEC §2a-iii; was General until 2026-11-04): what the
    // idle pill shows and each idle plan's own keys under it, then the pill's size and
    // shortcut. #101 adds Automatic and the plans' order; Developer and About move to
    // their own page with #102.
    _islandPage(plan, key) {
        const page = new Adw.PreferencesPage({title: 'Island', icon_name: 'focus-top-bar-symbolic'});

        const idle = new Adw.PreferencesGroup({title: 'When Idle'});
        for (const name of plan.idle)
            idle.add(this._row(key(name)));
        page.add(idle);

        const plans = plan.plans.filter(p => p.keys.length || p.enableKey);
        if (plans.length) {
            const group = new Adw.PreferencesGroup({title: 'Plans'});
            for (const p of plans)
                group.add(this._planRow(p, key));
            page.add(group);
        }

        const island = new Adw.PreferencesGroup({title: 'Pill'});
        for (const name of plan.general)
            island.add(this._row(key(name)));
        page.add(island);

        if (plan.developer.length) {
            const dev = new Adw.PreferencesGroup({title: 'Developer'});
            for (const name of plan.developer)
                dev.add(this._row(key(name)));
            page.add(dev);
        }

        const about = new Adw.PreferencesGroup({title: 'About'});
        about.add(new Adw.ActionRow({
            title: 'Version',
            subtitle: String(this.metadata['version-name'] ?? this.metadata.version ?? 'dev'),
        }));
        page.add(about);
        return page;
    }

    // A row for one key, by its type and name. Rows built from schema text are plain
    // text (textRow).
    _row(k) {
        const name = k.get_name();
        const title = k.get_summary(), subtitle = k.get_description();
        const type = k.get_value_type().dup_string();
        if (name.startsWith('keybind-'))
            return this._shortcutRow(k);
        if (type === 'b') {
            const row = textRow(Adw.SwitchRow, {title, subtitle});
            this._settings.bind(name, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            return row;
        }
        if (type === 'i' && name in SLIDERS)
            return this._sliderRow(k, SLIDERS[name]);
        if (type === 'i') {
            const [kind, range] = k.get_range().recursiveUnpack();
            const [lo, hi] = kind === 'range' ? range : [0, 10000];
            const row = textRow(Adw.SpinRow, {
                title, subtitle,
                adjustment: new Gtk.Adjustment({lower: lo, upper: hi, step_increment: 10, page_increment: 50}),
            });
            this._settings.bind(name, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            if (lo === 0) {
                // 0 means "derive it" for these keys (expanded-width): say so
                row.connect('output', () => {
                    if (row.value !== 0)
                        return false;
                    row.text = 'Auto'; // the entry is as wide as the range's digits
                    return true;
                });
            }
            return row;
        }
        if (type === 's' && k.get_range().recursiveUnpack()[0] === 'enum')
            return this._choiceRow(k);
        throw new Error(`prefs.js has no row for ${name} (${type})`);
    }

    // A string key with <choices>: one drop-down entry per choice, in schema order. With
    // nested keys (settings.js NESTED) it is an expander: the drop-down in its header, the
    // nested rows inside, insensitive while the choice leaves them without effect.
    _choiceRow(k) {
        const name = k.get_name();
        const nested = nestedIn(name);
        if (!nested.length) {
            const row = textRow(Adw.ComboRow, {title: k.get_summary(), subtitle: k.get_description()});
            this._bindChoice(name, k, row);
            return row;
        }
        const row = textRow(Adw.ExpanderRow, {title: k.get_summary(), subtitle: k.get_description()});
        const drop = new Gtk.DropDown({valign: Gtk.Align.CENTER});
        drop.update_property([Gtk.AccessibleProperty.LABEL], [k.get_summary()]);
        this._bindChoice(name, k, drop);
        row.add_suffix(drop);
        const schema = this._settings.settings_schema;
        const children = nested.map(n => {
            const child = this._row(schema.get_key(n));
            row.add_row(child);
            return [n, child];
        });
        const sync = () => {
            const value = this._settings.get_string(name);
            for (const [n, child] of children)
                child.sensitive = value !== NESTED[n].idleWhen;
        };
        this._ids.push(this._settings.connect(`changed::${name}`, sync));
        sync();
        return row;
    }

    // `widget` is an Adw.ComboRow or a Gtk.DropDown: both have `model` and `selected`.
    _bindChoice(name, k, widget) {
        const [, choices] = k.get_range().recursiveUnpack();
        widget.model = Gtk.StringList.new(choices.map(c => choiceLabel(name, c)));
        const sync = () => {
            const i = choices.indexOf(this._settings.get_string(name));
            if (i >= 0 && widget.selected !== i)
                widget.selected = i;
        };
        sync();
        widget.connect('notify::selected', () => {
            const value = choices[widget.selected];
            if (value && this._settings.get_string(name) !== value)
                this._settings.set_string(name, value);
        });
        this._ids.push(this._settings.connect(`changed::${name}`, sync));
    }

    // An integer key with a <range> as a slider, its value printed with the unit. The
    // slider and the value have fixed widths, so sliders on neighbouring rows line up
    // whatever their subtitles and values are.
    _sliderRow(k, unit) {
        const [, [lo, hi]] = k.get_range().recursiveUnpack();
        const row = textRow(Adw.ActionRow, {title: k.get_summary(), subtitle: k.get_description()});
        const value = new Gtk.Label({
            width_chars: 6, xalign: 1, valign: Gtk.Align.CENTER, css_classes: ['dim-label', 'numeric'],
        });
        const scale = new Gtk.Scale({
            adjustment: new Gtk.Adjustment({lower: lo, upper: hi, step_increment: 1, page_increment: 5}),
            digits: 0, round_digits: 0, draw_value: false,
            width_request: 180, valign: Gtk.Align.CENTER,
        });
        scale.update_property([Gtk.AccessibleProperty.LABEL], [k.get_summary()]);
        this._settings.bind(k.get_name(), scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const show = () => {
            value.label = `${Math.round(scale.adjustment.value)} ${unit}`;
        };
        scale.adjustment.connect('value-changed', show);
        show();
        row.add_suffix(value);
        row.add_suffix(scale);
        return row;
    }

    // Super+B: shows the accelerator; click to record a new one (Esc cancels, Backspace
    // disables), Reset puts the default back.
    _shortcutRow(k) {
        const name = k.get_name();
        const row = textRow(Adw.ActionRow, {title: k.get_summary(), subtitle: k.get_description(), activatable: true});
        const label = new Gtk.ShortcutLabel({disabled_text: 'Disabled', valign: Gtk.Align.CENTER});
        const reset = new Gtk.Button({
            icon_name: 'edit-undo-symbolic', valign: Gtk.Align.CENTER,
            tooltip_text: 'Reset', css_classes: ['flat'],
        });
        reset.update_property([Gtk.AccessibleProperty.LABEL], ['Reset the shortcut']);
        reset.connect('clicked', () => this._settings.reset(name));
        row.add_suffix(label);
        row.add_suffix(reset);
        const sync = () => {
            label.accelerator = this._settings.get_strv(name)[0] ?? '';
            reset.sensitive = this._settings.get_user_value(name) !== null;
        };
        this._ids.push(this._settings.connect(`changed::${name}`, sync));
        sync();
        row.connect('activated', () => this._recordShortcut(name, k.get_summary()));
        return row;
    }

    _recordShortcut(name, title) {
        const dialog = new Adw.Dialog({title, content_width: 360});
        const view = new Adw.ToolbarView();
        view.add_top_bar(new Adw.HeaderBar());
        view.set_content(new Adw.StatusPage({
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            title: 'Press the new shortcut',
            description: 'Esc cancels · Backspace disables it',
        }));
        dialog.set_child(view);
        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_c, keyval, _code, state) => {
            const mods = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
            if (!mods && keyval === Gdk.KEY_Escape) {
                dialog.close();
            } else if (!mods && keyval === Gdk.KEY_BackSpace) {
                this._settings.set_strv(name, []);
                dialog.close();
            } else if (mods && Gtk.accelerator_valid(keyval, mods)) {
                // a shortcut needs a modifier: a bare letter would steal typing everywhere
                this._settings.set_strv(name, [Gtk.accelerator_name(Gdk.keyval_to_lower(keyval), mods)]);
                dialog.close();
            }
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(keys);
        dialog.present(this._window);
    }

    // --- Modules ------------------------------------------------------------------------

    _modulesPage(plan, key) {
        const page = new Adw.PreferencesPage({title: 'Modules', icon_name: 'view-grid-symbolic'});
        const group = new Adw.PreferencesGroup({
            title: 'Modules',
            description: 'Turning one off removes it and its tab at once.',
        });
        for (const m of plan.modules)
            group.add(this._moduleRow(m, key));
        page.add(group);
        return page;
    }

    // One idle plan: its own keys inside. Its module's switch stays on Modules; while the
    // module is off the plan does not exist (rule 6), so the row says where to turn it on.
    _planRow(p, key) {
        const title = p.enableKey ? key(p.enableKey).get_summary() : p.id;
        const row = textRow(Adw.ExpanderRow, {title});
        for (const name of p.keys)
            row.add_row(this._row(key(name)));
        if (p.enableKey) {
            const sync = () => {
                const on = this._settings.get_boolean(p.enableKey);
                row.sensitive = on;
                row.subtitle = on ? '' : 'Turn on in Modules';
                if (!on)
                    row.expanded = false;
            };
            this._ids.push(this._settings.connect(`changed::${p.enableKey}`, sync));
            sync();
        }
        return row;
    }

    _moduleRow(m, key) {
        const k = key(m.enableKey);
        const row = textRow(Adw.ExpanderRow, {title: k.get_summary(), subtitle: k.get_description(), show_enable_switch: true});
        this._settings.bind(m.enableKey, row, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
        for (const name of m.keys)
            row.add_row(this._row(key(name)));
        if (m.standalone)
            row.add_row(this._pinRow(m.id));
        if (m.sample) {
            const sample = new Adw.ButtonRow({title: 'Show a sample', start_icon_name: 'media-playback-start-symbolic'});
            sample.connect('activated', () => this._showSample(m.id));
            row.add_row(sample);
        }
        return row;
    }

    _pinRow(id) {
        const row = new Adw.SwitchRow({
            title: 'Pin to the strip',
            subtitle: 'Always shown as its own tab, besides the slot.',
        });
        const sync = () => {
            row.active = this._settings.get_strv('tabs-pinned').includes(id);
        };
        this._ids.push(this._settings.connect('changed::tabs-pinned', sync));
        sync();
        row.connect('notify::active', () => {
            const now = this._settings.get_strv('tabs-pinned');
            const next = setPinned(now, id, row.active);
            if (next.join() !== now.join())
                this._settings.set_strv('tabs-pinned', next);
        });
        return row;
    }

    // The same path a script takes (docs/DBUS.md), so it shows what the island really draws.
    _showSample(id) {
        Gio.DBus.session.call(
            'org.gnome.Shell', PATH, IFACE, 'Surface',
            new GLib.Variant('(a{sv})', [packDict(sampleFor(id))]),
            new GLib.VariantType('(s)'), Gio.DBusCallFlags.NONE, 2000, null,
            (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (e) {
                    // not exported: the extension is off (or the Shell is not ours)
                    const gone = ['UnknownMethod', 'UnknownObject', 'UnknownInterface']
                        .some(n => Gio.DBusError.get_remote_error(e) === `org.freedesktop.DBus.Error.${n}`);
                    this._toast(gone ? 'Buoy is not running: turn the extension on first' : `No sample: ${e.message}`);
                }
            });
    }

    _toast(title) {
        this._window.add_toast(new Adw.Toast({title, timeout: 4}));
    }

    // --- Apps ---------------------------------------------------------------------------

    // --- Panel --------------------------------------------------------------------------

    _panelPage(plan, key) {
        const page = new Adw.PreferencesPage({title: 'Panel', icon_name: 'preferences-desktop-display-symbolic'});
        const clusters = new Adw.PreferencesGroup({
            title: 'Clusters',
            description: 'The app on the left, the system indicators and clock on the right.',
        });
        for (const name of plan.panel)
            clusters.add(this._row(key(name)));
        page.add(clusters);
        const clock = this._clockGroup();
        if (clock)
            page.add(clock);
        const dock = this._dockGroup();
        if (dock)
            page.add(dock);
        return page;
    }

    // --- Windows ------------------------------------------------------------------------

    // window-corners* (SPEC §1a): the switch, then the radius, which does nothing while the
    // switch is off.
    _windowsPage(plan, key) {
        const page = new Adw.PreferencesPage({title: 'Windows', icon_name: 'window-maximize-symbolic'});
        const group = new Adw.PreferencesGroup({
            title: 'Under the Top Bar',
            description: 'Maximized, tiled, or moved up against the bar.',
        });
        const rows = new Map(plan.windows.map(name => [name, this._row(key(name))]));
        rows.forEach(row => group.add(row));
        const radius = rows.get('window-corners-radius');
        if (radius && rows.has('window-corners'))
            this._settings.bind('window-corners', radius, 'sensitive', Gio.SettingsBindFlags.GET);
        page.add(group);
        return page;
    }

    // Ubuntu Dock's own keys (kit/settings.js GNOME_DOCK): the rows of Settings → Ubuntu
    // Desktop → Dock, on the same keys, so each side follows the other's changes. Shown only
    // where the dock's schema is installed.
    _dockGroup() {
        const source = Gio.SettingsSchemaSource.get_default();
        const entries = GNOME_DOCK.filter(e => source?.lookup(e.schema, true)?.has_key(e.key));
        if (!entries.length)
            return null;
        const group = new Adw.PreferencesGroup({
            title: 'Dock',
            description: 'The same settings as Ubuntu\'s Dock: synced both ways.',
        });
        const gs = new Gio.Settings({schema_id: entries[0].schema});
        const watch = (keys, fn) => {
            const ids = keys.map(k => gs.connect(`changed::${k}`, fn));
            this._window.connect('close-request', () => {
                ids.forEach(id => gs.disconnect(id));
                return false;
            });
        };
        let monitor = false;
        for (const e of entries) {
            if (e.row === 'monitor') {
                if (!monitor)
                    group.add(this._dockMonitorRow(gs, watch));
                monitor = true;
            } else if (e.min !== undefined) {
                group.add(this._dockSliderRow(gs, e));
            } else if (e.choices) {
                group.add(this._dockChoiceRow(gs, e, watch));
            } else {
                const row = new Adw.SwitchRow({title: e.title, subtitle: e.subtitle ?? ''});
                gs.bind(e.key, row, 'active',
                    e.invert ? Gio.SettingsBindFlags.INVERT_BOOLEAN : Gio.SettingsBindFlags.DEFAULT);
                group.add(row);
            }
        }
        return group;
    }

    // As _sliderRow, on a dock key with GNOME_DOCK's bounds.
    _dockSliderRow(gs, e) {
        const row = new Adw.ActionRow({title: e.title});
        const value = new Gtk.Label({
            width_chars: 6, xalign: 1, valign: Gtk.Align.CENTER, css_classes: ['dim-label', 'numeric'],
        });
        const scale = new Gtk.Scale({
            adjustment: new Gtk.Adjustment({lower: e.min, upper: e.max, step_increment: 1, page_increment: 4}),
            digits: 0, round_digits: 0, draw_value: false,
            width_request: 180, valign: Gtk.Align.CENTER,
        });
        scale.update_property([Gtk.AccessibleProperty.LABEL], [e.title]);
        gs.bind(e.key, scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const show = () => {
            value.label = `${Math.round(scale.adjustment.value)} ${e.unit}`;
        };
        scale.adjustment.connect('value-changed', show);
        show();
        row.add_suffix(value);
        row.add_suffix(scale);
        return row;
    }

    // A dock enum as a drop-down with GNOME_DOCK's labels; a value set elsewhere that the
    // list lacks (TOP) is shown as it is rather than changed.
    _dockChoiceRow(gs, e, watch) {
        const row = new Adw.ComboRow({title: e.title});
        let values = [];
        let syncing = false;     // a new model resets the selection: not the user's
        const sync = () => {
            syncing = true;
            const current = gs.get_string(e.key);
            const next = Object.keys(e.choices).includes(current) ? Object.keys(e.choices) : [...Object.keys(e.choices), current];
            if (next.join() !== values.join()) {
                values = next;
                row.model = Gtk.StringList.new(values.map(v => e.choices[v] ?? v));
            }
            if (row.selected !== values.indexOf(current))
                row.selected = values.indexOf(current);
            syncing = false;
        };
        sync();
        row.connect('notify::selected', () => {
            if (syncing)
                return;
            const value = values[row.selected];
            if (value && gs.get_string(e.key) !== value)
                gs.set_string(e.key, value);
        });
        watch([e.key], sync);
        return row;
    }

    // "Show on": all displays, the primary one, or one by its connector — two dock keys
    // behind one drop-down (kit/settings.js dockMonitor*). Displays are named and numbered
    // from Mutter, as Settings does (org.gnome.Mutter.DisplayConfig GetCurrentState, asked
    // again on MonitorsChanged); Gdk's connectors stand in until it answers.
    _dockMonitorRow(gs, watch) {
        const row = new Adw.ComboRow({title: 'Show on'});
        let choices = [];
        let displays = [];
        const list = Gdk.Display.get_default()?.get_monitors();
        for (let i = 0; i < (list?.get_n_items() ?? 0); i++) {
            const connector = list.get_item(i).get_connector();
            if (connector)
                displays.push({connector, name: connector, builtin: false, primary: false});
        }
        const DC = ['org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig'];
        const ask = () => Gio.DBus.session.call(...DC, 'GetCurrentState', null, null,
            Gio.DBusCallFlags.NONE, -1, null, (bus, res) => {
                try {
                    const [, monitors, logical] = bus.call_finish(res).recursiveUnpack();
                    displays = displaysFromState(monitors, logical);
                    sync();
                } catch (e) {
                    console.debug(`Buoy prefs: no display names from Mutter: ${e.message}`);
                }
            });
        const changed = Gio.DBus.session.signal_subscribe(DC[0], DC[2], 'MonitorsChanged', DC[1], null,
            Gio.DBusSignalFlags.NONE, ask);
        this._window.connect('close-request', () => {
            Gio.DBus.session.signal_unsubscribe(changed);
            return false;
        });
        // replacing the model resets the selection: that is not the user choosing
        let syncing = false;
        const sync = () => {
            syncing = true;
            const current = dockMonitor(gs.get_boolean('multi-monitor'), gs.get_string('preferred-monitor-by-connector'));
            const next = dockMonitorChoices(displays, current);
            if (next.map(c => c.join()).join() !== choices.map(c => c.join()).join()) {
                choices = next;
                row.model = Gtk.StringList.new(choices.map(c => c[1]));
            }
            const i = choices.findIndex(c => c[0] === current);
            if (row.selected !== i)
                row.selected = i;
            syncing = false;
        };
        sync();
        row.connect('notify::selected', () => {
            if (syncing)
                return;
            const choice = choices[row.selected]?.[0];
            if (!choice || choice === dockMonitor(gs.get_boolean('multi-monitor'), gs.get_string('preferred-monitor-by-connector')))
                return;
            const {multi, connector} = dockMonitorValue(choice);
            gs.set_boolean('multi-monitor', multi);
            if (connector !== null)
                gs.set_string('preferred-monitor-by-connector', connector);
        });
        watch(['multi-monitor', 'preferred-monitor-by-connector'], sync);
        ask();
        return row;
    }

    // GNOME's own clock keys (kit/settings.js GNOME_CLOCK): one set of values for this
    // page and Settings → Date & Time, each side follows the other's changes.
    _clockGroup() {
        const source = Gio.SettingsSchemaSource.get_default();
        const entries = GNOME_CLOCK.filter(e => source?.lookup(e.schema, true)?.has_key(e.key));
        if (!entries.length)
            return null;
        const group = new Adw.PreferencesGroup({
            title: 'Clock',
            description: 'The same settings as GNOME\'s Date &amp; Time: synced both ways.',
        });
        const schemas = new Map();
        for (const e of entries) {
            if (!schemas.has(e.schema))
                schemas.set(e.schema, new Gio.Settings({schema_id: e.schema}));
            const gs = schemas.get(e.schema);
            const row = new Adw.SwitchRow({title: e.title, subtitle: e.subtitle ?? ''});
            if (!e.on) {
                gs.bind(e.key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            } else {
                const sync = () => {
                    const on = switchOn(e, gs.get_string(e.key));
                    if (row.active !== on)
                        row.active = on;
                };
                sync();
                row.connect('notify::active', () => {
                    const value = switchValue(e, row.active);
                    if (gs.get_string(e.key) !== value)
                        gs.set_string(e.key, value);
                });
                const id = gs.connect(`changed::${e.key}`, sync);
                this._window.connect('close-request', () => {
                    gs.disconnect(id);
                    return false;
                });
            }
            group.add(row);
        }
        return group;
    }

    _appsPage(plan, key) {
        const page = new Adw.PreferencesPage({title: 'Apps', icon_name: 'application-x-executable-symbolic'});
        for (const name of plan.apps)
            page.add(this._appList(key(name)));

        const profiles = new Adw.PreferencesGroup({
            title: 'App profiles',
            description: 'One JSON file per app changes its icon, title, priority or what it shows. Saved files apply at once.',
        });
        const dir = profileDir();
        const row = new Adw.ActionRow({title: 'Profiles folder', subtitle: dir});
        const open = new Gtk.Button({label: 'Open', valign: Gtk.Align.CENTER});
        open.connect('clicked', () => {
            const file = Gio.File.new_for_path(dir);
            try {
                file.make_directory_with_parents(null);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                    return this._toast(`Cannot create ${dir}: ${e.message}`);
            }
            new Gtk.FileLauncher({file}).launch(this._window, null, null);
            return undefined;
        });
        row.add_suffix(open);
        profiles.add(row);
        page.add(profiles);
        return page;
    }

    // apps-hidden / apps-plain: one row per app with a remove button, an entry to add one.
    // What is saved is the slug (the registry compares slugs), shown as the row's subtitle.
    _appList(k) {
        const name = k.get_name();
        // a group's title and description are always markup (no use-markup on
        // Adw.PreferencesGroup): escape the schema text
        const group = new Adw.PreferencesGroup({
            title: GLib.markup_escape_text(k.get_summary(), -1),
            description: GLib.markup_escape_text(k.get_description(), -1),
        });
        const entry = new Adw.EntryRow({title: 'Add an app (name, desktop id or MPRIS name)', show_apply_button: true});
        entry.connect('apply', () => {
            const slug = slugOf(entry.text.trim());
            if (entry.text.trim())
                this._settings.set_strv(name, addApp(this._settings.get_strv(name), slug));
            entry.text = '';
        });
        let rows = [];
        const sync = () => {
            for (const r of rows)
                group.remove(r);
            rows = this._settings.get_strv(name).map(slug => {
                const row = new Adw.ActionRow({title: slug});
                const remove = new Gtk.Button({
                    icon_name: 'list-remove-symbolic', valign: Gtk.Align.CENTER,
                    tooltip_text: 'Remove', css_classes: ['flat'],
                });
                remove.update_property([Gtk.AccessibleProperty.LABEL], [`Remove ${slug}`]);
                remove.connect('clicked', () => this._settings.set_strv(name,
                    this._settings.get_strv(name).filter(s => s !== slug)));
                row.add_suffix(remove);
                group.add(row);
                return row;
            });
            group.remove(entry);
            group.add(entry);
        };
        group.add(entry);
        this._ids.push(this._settings.connect(`changed::${name}`, sync));
        sync();
        return group;
    }
}

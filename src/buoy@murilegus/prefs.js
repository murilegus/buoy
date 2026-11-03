import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {planPrefs, nestedIn, setPinned, addApp, sampleFor, packDict, NESTED, SLIDERS} from './lib/kit/settings.js';
import {slugOf, profileDir} from './lib/kit/registry.js';
import {PATH} from './lib/kit/dbus.js';

const IFACE = 'org.gnome.Shell.Extensions.Buoy';

/**
 * Buoy's prefs (FEATURES M1 "GSettings schema + prefs.js", 2026-11-03). The schema XML is
 * the source of every key's title and text; lib/kit/settings.js says where it goes.
 *
 *   General   the island (expanded width, Super+B), developer mode, version
 *   Modules   one expander per module: its switch, its own keys, a pin for standalone
 *             tabs, "Show a sample" (Surface over D-Bus, like any script)
 *   Apps      hidden and plain apps (slugged as the registry does), the profiles folder
 *   Panel     the top bar's clusters (M2)
 */
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
        window.add(this._generalPage(plan, key));
        window.add(this._modulesPage(plan, key));
        window.add(this._appsPage(plan, key));
        window.add(this._panelPage(plan, key));
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

    // --- General ------------------------------------------------------------------------

    _generalPage(plan, key) {
        const page = new Adw.PreferencesPage({title: 'General', icon_name: 'preferences-system-symbolic'});
        const island = new Adw.PreferencesGroup({title: 'Island'});
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

    // A row for one key, by its type and name.
    _row(k) {
        const name = k.get_name();
        const title = k.get_summary(), subtitle = k.get_description();
        const type = k.get_value_type().dup_string();
        if (name.startsWith('keybind-'))
            return this._shortcutRow(k);
        if (type === 'b') {
            const row = new Adw.SwitchRow({title, subtitle});
            this._settings.bind(name, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            return row;
        }
        if (type === 'i' && name in SLIDERS)
            return this._sliderRow(k, SLIDERS[name]);
        if (type === 'i') {
            const [kind, range] = k.get_range().recursiveUnpack();
            const [lo, hi] = kind === 'range' ? range : [0, 10000];
            const row = new Adw.SpinRow({
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
            const row = new Adw.ComboRow({title: k.get_summary(), subtitle: k.get_description()});
            this._bindChoice(name, k, row);
            return row;
        }
        const row = new Adw.ExpanderRow({title: k.get_summary(), subtitle: k.get_description()});
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
        widget.model = Gtk.StringList.new(choices.map(c => c[0].toUpperCase() + c.slice(1)));
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

    // An integer key with a <range> as a slider, its value printed with the unit.
    _sliderRow(k, unit) {
        const [, [lo, hi]] = k.get_range().recursiveUnpack();
        const row = new Adw.ActionRow({title: k.get_summary(), subtitle: k.get_description()});
        const scale = new Gtk.Scale({
            adjustment: new Gtk.Adjustment({lower: lo, upper: hi, step_increment: 1, page_increment: 5}),
            digits: 0, round_digits: 0, draw_value: true, value_pos: Gtk.PositionType.LEFT,
            hexpand: true, width_request: 200, valign: Gtk.Align.CENTER,
        });
        scale.set_format_value_func((_s, v) => `${Math.round(v)} ${unit}`);
        scale.update_property([Gtk.AccessibleProperty.LABEL], [k.get_summary()]);
        this._settings.bind(k.get_name(), scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(scale);
        return row;
    }

    // Super+B: shows the accelerator; click to record a new one (Esc cancels, Backspace
    // disables), Reset puts the default back.
    _shortcutRow(k) {
        const name = k.get_name();
        const row = new Adw.ActionRow({title: k.get_summary(), subtitle: k.get_description(), activatable: true});
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

    _moduleRow(m, key) {
        const k = key(m.enableKey);
        const row = new Adw.ExpanderRow({title: k.get_summary(), subtitle: k.get_description(), show_enable_switch: true});
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
        return page;
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
        const group = new Adw.PreferencesGroup({title: k.get_summary(), description: k.get_description()});
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

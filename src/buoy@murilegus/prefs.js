import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Placeholder so the island's ⚙ opens a window (Shell only offers prefs when prefs.js
// exists). The real pages — one per module from index.js#schema, Panel, Windows — are
// FEATURES.md M1 "GSettings schema + prefs.js".
export default class BuoyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage({title: 'Buoy', icon_name: 'emblem-system-symbolic'});
        const group = new Adw.PreferencesGroup({
            title: 'Settings are on the way',
            description: 'Module, panel and window settings arrive with the prefs item.',
        });
        group.add(new Adw.ActionRow({
            title: 'Version',
            subtitle: String(this.metadata['version-name'] ?? this.metadata.version ?? 'dev'),
            activatable: false,
        }));
        page.add(group);
        window.add(page);
        window.set_default_size(560, 320);
    }
}

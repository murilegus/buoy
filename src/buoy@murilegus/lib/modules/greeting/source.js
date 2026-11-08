import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Source} from '../../kit/source.js';
import {caseOf, noteFor} from './adapter.js';
import notes from './notes.js';

const KIND = 'greeting';

/**
 * The first run and What's new (GREETING.md §11), decided at `enable` from
 * `greeting-intro-shown`, `greeting-version-seen` and the running `metadata.json` `version`:
 *
 * - First run (a fresh install): Bu's introduction. What's new (an update): the running
 *   version's notes (notes.js). Neither: nothing; a newer version without notes still
 *   counts as seen.
 * - It waits for Shell's startup to finish (`Main.layoutManager` `startup-complete`) and
 *   for the island to be seen (stack.whenSeen: not over a fullscreen window), then shows
 *   once — a transient activity, expanded on its own — and writes both keys.
 * - About's "Show Bu's introduction again" sets `greeting-intro-shown` false: the
 *   introduction shows again at once.
 * - "…and more" writes `prefs-page` = `whats-new` and opens prefs, which shows About →
 *   What's new (Shell's OpenExtensionPrefs passes no page on, GREETING.md §11).
 * - No timer of its own: the greeting's time is its ttl, the typing is the kit's.
 */
export class GreetingSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._ext = Extension.lookupByURL(import.meta.url);
        this._version = this._ext?.metadata?.version ?? 0;
        this._id = null;
        this._cancelSeen = null;
        this._writing = false;
        settings?.connectObject('changed::greeting-intro-shown', () => {
            if (!this._writing && !settings.get_boolean('greeting-intro-shown'))
                this._schedule();          // About asked for the introduction again
        }, this);
        this._schedule();
    }

    disable() {
        this._cancelSeen?.();
        this._cancelSeen = null;
        Main.layoutManager.disconnectObject(this);
        this._settings?.disconnectObject(this);
        if (this._id && this._stack?.has(this._id))
            this._stack.end(this._id);
        this._id = null;
        super.disable();
    }

    _case() {
        return caseOf({
            introShown: this._settings.get_boolean('greeting-intro-shown'),
            versionSeen: this._settings.get_int('greeting-version-seen'),
            version: this._version,
        });
    }

    // Once Shell has started and the island is seen
    _schedule() {
        this._cancelSeen?.();
        this._cancelSeen = null;
        Main.layoutManager.disconnectObject(this);
        if (!this._case()) {
            this._markSeen();              // a newer version with nothing to say, or a downgrade
            return;
        }
        if (Main.layoutManager._startingUp) {
            Main.layoutManager.connectObject('startup-complete', () => {
                Main.layoutManager.disconnectObject(this);
                this._schedule();
            }, this);
            return;
        }
        this._cancelSeen = this._stack.whenSeen(() => {
            this._cancelSeen = null;
            this._show();
        });
    }

    _show() {
        if (!this._stack)
            return;
        const kind = this._case();
        const note = kind === 'whats-new' ? noteFor(notes, this._version) : null;
        if (!kind || (kind === 'whats-new' && !note)) {
            this._markSeen();
            return;
        }
        const a = this._registry?.build(KIND, 'buoy', {
            id: 'greeting',
            case: kind,
            note,
            animations: St.Settings.get().enable_animations,
            onMore: () => this._openWhatsNew(),
        });
        if (a)
            this._id = this._stack.surface(a);
        this._markSeen();
    }

    // Both keys once it showed: the first run counts as this version seen, so a later
    // update speaks only of what came after it (GREETING.md §11)
    _markSeen() {
        const s = this._settings;
        if (!s)
            return;
        this._writing = true;
        try {
            if (!s.get_boolean('greeting-intro-shown'))
                s.set_boolean('greeting-intro-shown', true);
            if (Number.isInteger(this._version) && s.get_int('greeting-version-seen') < this._version)
                s.set_int('greeting-version-seen', this._version);
        } finally {
            this._writing = false;
        }
    }

    _openWhatsNew() {
        this._settings?.set_string('prefs-page', 'whats-new');
        if (this._id && this._stack?.has(this._id))
            this._stack.end(this._id);
        this._ext?.openPreferences();
    }
}

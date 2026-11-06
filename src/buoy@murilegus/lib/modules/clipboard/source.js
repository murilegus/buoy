import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Source} from '../../kit/source.js';
import {contentOf, filesMime, filesOf, imageMime} from './adapter.js';

const ID = 'clipboard';
const PREVIEW_KEY = 'clipboard-show-preview';
// The snippet is one line ellipsized at pill 1's widest: a few hundred characters are
// plenty, and a label is never handed a megabyte that was copied
const SNIPPET = 500;

/**
 * The copied feedback (SPEC §2e, FEATURES M3 "clipboard: copied"). GNOME shows nothing
 * when something is copied; mutter tells every owner change on its MetaSelection
 * (`owner-changed`, core/meta-selection.c meta_selection_set_owner), which is where Buoy
 * listens — a signal, no polling.
 *
 * - The clipboard only (not PRIMARY, which changes with every text selection) and a real
 *   new owner (null: cleared, e.g. the app quit).
 * - Silent when Shell set it itself: the owner is a MetaSelectionSourceMemory
 *   (st-clipboard.c st_clipboard_set_content → meta_selection_source_memory_new) — a
 *   screenshot (its notification is the feedback), Looking Glass, later the Clipboard
 *   tab's own paste.
 * - What it is comes from the owner's mimetypes (adapter.js contentOf); the content is
 *   read through St.Clipboard only to show it, and only with `clipboard-show-preview`
 *   on. A password manager's secret is never read. Nothing is kept (history is M5).
 * - The app is the focused one (the copy came from its window): apps-hidden and profiles
 *   apply to it, so a password manager can be hidden by name too.
 */
export class ClipboardSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._serial = 0;
        this._shown = null;           // the stack id of the copied pill
        this._clipboard = St.Clipboard.get_default();
        global.display.get_selection().connectObject('owner-changed',
            (_s, type, owner) => this._changed(type, owner), this);
    }

    _changed(type, owner) {
        if (type !== Meta.SelectionType.SELECTION_CLIPBOARD || !owner || !this._stack)
            return;
        if (owner instanceof Meta.SelectionSourceMemory)
            return;
        const serial = ++this._serial;    // a later copy wins over a read still running
        const mimetypes = owner.get_mimetypes() ?? [];
        const what = contentOf(mimetypes);
        if (!what)
            return;
        // a window with no .desktop gets a made-up id ("window:1"): no app then
        const focus = Shell.WindowTracker.get_default().focus_app;
        const app = focus && !focus.is_window_backed() ? focus.get_id() : 'system';
        const show = ev => {
            if (serial === this._serial)
                this._show(app, ev);
        };
        if (what === 'secret' || this._settings?.get_boolean(PREVIEW_KEY) === false) {
            show({what: what === 'secret' ? 'secret' : 'hidden'});
            return;
        }
        const CLIPBOARD = St.ClipboardType.CLIPBOARD;
        if (what === 'text') {
            this._clipboard.get_text(CLIPBOARD, (_c, text) => show({what, text: text?.slice(0, SNIPPET) ?? null}));
        } else if (what === 'files') {
            this._clipboard.get_content(CLIPBOARD, filesMime(mimetypes), (_c, bytes) =>
                show({what, files: filesOf(decode(bytes))}));
        } else if (what === 'image') {
            // the bytes as an icon: St's texture cache decodes it off the main loop at the
            // art's size; dropped with the pill, nothing is written anywhere
            this._clipboard.get_content(CLIPBOARD, imageMime(mimetypes), (_c, bytes) =>
                show({what, image: bytes?.get_size() ? Gio.BytesIcon.new(bytes) : null}));
        }
    }

    _show(app, ev) {
        if (!this._stack)
            return;
        const a = this._registry?.build('copied', app, {id: ID, ...ev});
        if (!a)
            return;
        // one pill: a copy in another app replaces the last one's (ids differ by app)
        if (this._shown && this._shown !== a.id && this._stack.has(this._shown))
            this._stack.end(this._shown);
        if (this._stack.has(a.id) && this._stack.update(a.id, a)) {
            this._shown = a.id;
            return;
        }
        this._shown = this._stack.surface(a);
    }

    disable() {
        global.display.get_selection().disconnectObject(this);
        this._serial++;                   // reads still running land nowhere
        if (this._shown && this._stack?.has(this._shown))
            this._stack.end(this._shown);
        this._shown = null;
        this._clipboard = null;
        super.disable();
    }
}

function decode(bytes) {
    const data = bytes?.get_data?.() ?? bytes?.toArray?.();
    return data ? new TextDecoder().decode(data) : null;
}

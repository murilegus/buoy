import {Source} from '../../kit/source.js';
// TODO: use Gio.DBusProxy on org.mpris.MediaPlayer2.* via the
// org.freedesktop.DBus NameOwnerChanged signal to discover players, then
// PropertiesChanged for Metadata / PlaybackStatus. GNOME has a ready-made
// MprisPlayer in resource:///org/gnome/shell/ui/mpris.js — reuse it.
//
// Events to emit:  build('media', busName, {id: busName, title, artist, art, status, raise})
// Lifecycle:       push on Playing, update on track change, end on Stopped/name vanished.

export class MprisSource extends Source {
    enable(stack) {
        super.enable(stack);
    }

    disable() {
        super.disable();
    }
}

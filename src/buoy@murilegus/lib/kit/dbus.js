// TODO: export org.gnome.Shell.Extensions.Buoy on the session bus.
// Methods: Surface(a{sv}) → s id · Update(s id, a{sv}, b alert) · End(s id, i dismissalMs)
//          Schedule(a{sv}, t startAt) · Ask(s id, s question, as options) → s choice
// Callers send presentation data directly; no adapter lookup.
export class BuoyDBus {
    export() {}
    unexport() {}
}

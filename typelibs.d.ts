// Types only, for `pnpm check`: the gi:// typelibs Buoy imports that have no @girs package
// in devDependencies, typed as far as Buoy calls them. A script file (no import/export),
// so these are ambient modules; ambient.d.ts, a module, can only augment.

declare module 'gi://GLibUnix' {
    const GLibUnix: {
        fd_add_full(priority: number, fd: number, condition: import('@girs/glib-2.0').default.IOCondition,
            func: () => boolean): number;
    };
    export default GLibUnix;
}
declare module 'gi://GWeather' {
    namespace GWeather {
        type Location = any;
    }
    const GWeather: any;
    export default GWeather;
}
declare module 'gi://GWeather?version=4.0' {
    const GWeather: any;
    export default GWeather;
}
declare module 'gi://Geoclue' {
    const Geoclue: any;
    export default Geoclue;
}
declare module 'gi://Soup?version=3.0' {
    const Soup: any;
    export default Soup;
}
// Shell's mount operation (js/ui/shellMountOperation.js), which @girs/gnome-shell does not type
declare module 'resource:///org/gnome/shell/ui/shellMountOperation.js' {
    export class ShellMountOperation {
        constructor(source: any, params?: {existingDialog?: any});
        mountOp: any;
        close(): void;
    }
}

// ui/endSessionDialog.js (a Shell module, not a typelib): @girs has no types for it (greeting's Leaving wraps its _confirm)
declare module 'resource:///org/gnome/shell/ui/endSessionDialog.js' {
    export class EndSessionDialog {
        _type: number;                                  // endSessionDialog.js OpenAsync
        _checkBox: {visible: boolean, checked: boolean}; // endSessionDialog.js _init
        _confirm(signal: string): Promise<void>;        // endSessionDialog.js _confirm
    }
}


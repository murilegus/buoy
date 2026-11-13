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

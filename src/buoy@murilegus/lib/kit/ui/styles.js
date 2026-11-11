import Gio from 'gi://Gio';
import St from 'gi://St';

// A module's own CSS (ARCHITECTURE "Stylesheets", 2026-11-12): lib/modules/<id>/stylesheet.css,
// loaded while the module runs, the way Shell loads an extension's stylesheet.css
// (ui/extensionSystem.js _loadExtensionStylesheet: St.Theme.load_stylesheet, a missing
// file is no error). Shell's theme reload loads it again into the new theme (ui/main.js
// loadTheme), and the St.Theme finds it by file to unload it (st-theme.c
// st_theme_unload_stylesheet).

const theme = () => St.ThemeContext.get_for_stage(global.stage).get_theme();

/**
 * @param {Gio.File} dir  the extension's folder
 * @param {string} id  the module's id, its folder's name
 * @returns {?Gio.File} the stylesheet loaded, for unloadStyle(); null when the module has
 *   none or it does not parse (logged)
 */
export function loadStyle(dir, id) {
    const file = dir.resolve_relative_path(`lib/modules/${id}/stylesheet.css`);
    try {
        theme().load_stylesheet(file);
        return file;
    } catch (e) {
        if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            console.warn(`Buoy: ${id}'s stylesheet: ${e.message}`);
        return null;
    }
}

/**
 * @param {?Gio.File} file  what loadStyle() returned
 */
export function unloadStyle(file) {
    if (file)
        theme().unload_stylesheet(file);
}

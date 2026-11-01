// TODO: presentation data → St actors.
// Input (from adapter):  {leading, text, trailing, expanded:{leading,trailing,center,bottom}, actions}
//   leading/trailing: {icon?: Gio.Icon|string, text?: string, progress?: 0..1, art?: path}
// Output: {compact: Clutter.Actor, expanded?: Clutter.Actor}
// This is the only file that turns content into actors. Adapters never do.
/**
 * @param {object} _p  presentation data
 * @returns {?import('gi://Clutter').default.Actor}
 */
export function buildCompact(_p) {
    return null;
}

/**
 * @param {object} _p  presentation data
 * @returns {?import('gi://Clutter').default.Actor}
 */
export function buildExpanded(_p) {
    return null;
}

/**
 * What the left cluster shows (SPEC §1, decided 2026-10-30). Pure: panel.js feeds it the
 * focused app, the workspace and the hover, and draws the result.
 *
 *   focused app              [▣ Firefox]          hover: [▣ Firefox · ⊞ 2]
 *   no app, or the Overview  [⊞ 2]                or the name the user gave it
 *   …with left-cluster-empty = hidden: nothing
 */

// Last resort when an app has neither its own icon nor a monochrome one: a plain window
// (Yaru has it, Adwaita does not), else two windows (both themes). Not the executable's
// gears, which read as Settings at 16 px (Ethan 2026-11-04).
export const GENERIC_APP_ICONS = ['window-symbolic', 'focus-windows-symbolic'];

/**
 * The icons to fall back on when the app's own icon is missing, best first (Ethan
 * 2026-11-04: the app's own icon first; then its monochrome `<icon>-symbolic`, which GNOME
 * apps and many others ship in hicolor/symbolic/apps; then GENERIC_APP_ICONS).
 *
 * @param {string|null} icon  the app's themed icon name (desktop file `Icon=`), null for a file icon
 * @param {string|null} id  the app id (`org.gnome.Calculator.desktop`)
 * @returns {string[]} names, no duplicates, always ending with GENERIC_APP_ICONS
 */
export function fallbackIcons(icon, id) {
    const bases = [icon, id?.replace(/\.desktop$/, '')]
        .filter(b => b && !b.includes('/'))
        .map(b => b.replace(/-symbolic$/, ''));
    return [...new Set([...bases.map(b => `${b}-symbolic`), ...GENERIC_APP_ICONS])];
}

/**
 * @param {number} index  0-based workspace index
 * @param {string[]} names  `org.gnome.desktop.wm.preferences workspace-names`
 * @returns {string|null} the name the user set for it, or null (unset or blank)
 */
export function workspaceName(index, names) {
    const name = names[index]?.trim();
    return name || null;
}

/**
 * @param {object} state
 * @param {string|null} state.app  focused app's name; null for none
 * @param {number} state.index  active workspace, 0-based
 * @param {string[]} state.names  workspace names
 * @param {boolean} state.hover  pointer over the cluster
 * @param {boolean} state.overview  the Overview is showing (it has no focused window)
 * @param {string} state.empty  `left-cluster-empty`: workspace | hidden
 * @returns {{visible: boolean, icon: ('app'|'grid'|null), text: string, extra: (string|null)}}
 *   `extra` is the hover's secondary item after "·", drawn with the grid icon
 */
export function leftCluster({app, index, names, hover, overview, empty}) {
    const name = workspaceName(index, names);
    if (app && !overview)
        return {visible: true, icon: 'app', text: app, extra: hover ? name ?? `${index + 1}` : null};
    if (empty === 'hidden')
        return {visible: false, icon: null, text: '', extra: null};
    return {visible: true, icon: 'grid', text: name ?? `${index + 1}`, extra: null};
}

// GNOME's panel button fill over its own hover (Shell 50 _drawing.scss panel_button: the
// foreground at .17 on hover, .28 open, .32 open and hovered): the steps above
// `cluster-opacity`, in percent, so the default 17 matches a stock button exactly.
export const OPEN_STEP = 11;
export const OPEN_HOVER_STEP = 15;

/**
 * How strongly a cluster's background is drawn, in the cluster's foreground colour as
 * GNOME fills a panel button (2026-11-04: same colour and steps as a tray button's hover).
 *
 * @param {object} look
 * @param {string} look.mode  `cluster-background`: never | hover | always
 * @param {number} look.opacity  `cluster-opacity`, percent
 * @param {object} state
 * @param {boolean} state.hover  pointer over the cluster
 * @param {boolean} state.open  its menu is open
 * @returns {number} alpha, 0–1
 */
export function clusterFill({mode, opacity}, {hover, open}) {
    if (mode === 'never' || (mode === 'hover' && !hover && !open))
        return 0;
    let step = 0;
    if (open)
        step = hover ? OPEN_HOVER_STEP : OPEN_STEP;
    return Math.min(100, opacity + step) / 100;
}

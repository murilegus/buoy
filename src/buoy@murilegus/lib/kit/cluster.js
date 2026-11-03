/**
 * What the left cluster shows (SPEC §1, decided 2026-10-30). Pure: panel.js feeds it the
 * focused app, the workspace and the hover, and draws the result.
 *
 *   focused app              [▣ Firefox]          hover: [▣ Firefox · ⊞ 2]
 *   no app, or the Overview  [⊞ Workspace 2]      or the name the user gave it
 *   …with left-cluster-empty = hidden: nothing
 */

/**
 * The monochrome icon names to try for an app, best first (Ethan 2026-11-04: they match the
 * system indicators; the app's own coloured icon is the fallback). GNOME apps and many
 * others ship `<icon>-symbolic` in hicolor/symbolic/apps.
 *
 * @param {string|null} icon  the app's themed icon name (desktop file `Icon=`), null for a file icon
 * @param {string|null} id  the app id (`org.gnome.Calculator.desktop`)
 * @returns {string[]} names, no duplicates; empty when there is nothing to try
 */
export function symbolicNames(icon, id) {
    const bases = [icon, id?.replace(/\.desktop$/, '')]
        .filter(b => b && !b.includes('/'))
        .map(b => b.replace(/-symbolic$/, ''));
    return [...new Set(bases)].map(b => `${b}-symbolic`);
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
    return {visible: true, icon: 'grid', text: name ?? `Workspace ${index + 1}`, extra: null};
}

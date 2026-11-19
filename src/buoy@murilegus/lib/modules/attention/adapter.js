/**
 * attention adapter (FEATURES M4 "Attention on another workspace"; design/compact "Cửa sổ cần chú
 * ý", 2026-11-19, Ethan): a window that asks for attention — Mutter's demands-attention or urgent
 * (a link opened in a browser elsewhere, an app ready late, a terminal's bell) — as GNOME tells
 * it with "“…” is ready" (ui/windowAttentionHandler.js). Pure: the source reads the windows.
 *
 * Event: {id, appName, appIcon, title, workspace, more, at, shared, activate, dismiss}
 *   appIcon    the app's icon (a Gio.Icon), or null
 *   title      the window's title
 *   workspace  its workspace's number (1…) when not the one shown, else null
 *   more       the app's other windows asking too
 *   at         ms since the epoch it asked
 *   shared     the screen is shared or recorded: only the app is named
 *   activate() go to it: its workspace, its focus; dismiss() the pill goes, the window still asks
 */

export const GO = 'go';
export const DISMISS = 'dismiss';
const ICON = 'view-app-grid-symbolic';

export default {
    attention(ev) {
        const app = typeof ev.appName === 'string' && ev.appName.trim() ? ev.appName.trim() : 'App';
        const own = typeof ev.title === 'string' ? ev.title.trim() : '';
        const title = ev.shared === true || !own ? app : own;
        const ws = Number.isInteger(ev.workspace) && ev.workspace > 0 ? ev.workspace : null;
        const more = Number.isInteger(ev.more) && ev.more > 0 ? ev.more : 0;
        const icon = ev.appIcon ?? ICON;
        const line = [title !== app ? app : null, ws ? `Workspace ${ws}` : null, more ? `+${more}` : null].filter(Boolean);
        // every output sets the same fields: a new window, a new title, another workspace update in place
        return {
            text: title,
            leading: icon,
            // its workspace's number in a square (as the overview's thumbnails), "+1" before it
            trailing: ws || more ? {workspace: ws, more} : null,
            compact: {
                card: {
                    icon, app: line.length ? line.join(' · ') : app, at: Number.isFinite(ev.at) ? ev.at : null,
                    picture: null, title, body: null, close: DISMISS, actionsOnHover: false, tight: true,
                },
            },
            expanded: null,
            actions: [{id: GO, label: 'Go to Window', icon: 'go-jump-symbolic'}],
            minimalAction: false,
            // it stays till the window is focused, stops asking or goes (the source ends it)
            ttl: 0,
            pressFirst: true,
            onPress: ev.activate ?? null,
            onAction: id => {
                if (id === GO)
                    ev.activate?.();
                else if (id === DISMISS)
                    ev.dismiss?.();
            },
            attributes: {app, title, workspace: ws},
        };
    },
};

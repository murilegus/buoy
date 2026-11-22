/**
 * terminal adapter (FEATURES M4 "Terminal command finished in an unfocused tab"; design/compact
 * "Lệnh terminal xong", 2026-11-21, Ethan): Ptyxis's "Command completed" as a pill — the command,
 * ✓ or ✕ and its time from Buoy's shell hook when it ran (hooks/shell.sh), Go to Tab. Pure.
 *
 * Event: {id, cmd, exit, duration, dir, appName, appIcon, more, at, shared, activate, dismiss}
 *   cmd        the command line: the typed one (hook, zsh), else Ptyxis's
 *   exit       its exit code, or null (no hook)
 *   duration   ms it ran, or null (no hook)
 *   dir        where it ran, ~ for home, or ''
 *   more       other tabs whose command finished too
 *   at         ms since the epoch it finished
 *   shared     the screen is shared or recorded: no command, no directory
 *   activate() Ptyxis shows the tab (its notification's own action); dismiss() the
 *              notification goes
 */
import {longTime, shortTime} from './finished.js';

export const GO = 'go';
export const DISMISS = 'dismiss';
const ICON = 'utilities-terminal-symbolic';

export default {
    terminal(ev) {
        const app = typeof ev.appName === 'string' && ev.appName.trim() ? ev.appName.trim() : 'Terminal';
        const own = typeof ev.cmd === 'string' ? ev.cmd.trim() : '';
        const title = ev.shared === true || !own ? 'Command finished' : own;
        const exit = Number.isInteger(ev.exit) && ev.exit >= 0 ? ev.exit : null;
        const time = exit !== null && Number.isFinite(ev.duration) && ev.duration >= 0 ? ev.duration : null;
        const more = Number.isInteger(ev.more) && ev.more > 0 ? ev.more : 0;
        const dir = ev.shared === true || typeof ev.dir !== 'string' ? '' : ev.dir.trim();
        const icon = ev.appIcon ?? ICON;
        // ✓ or ✕ and its time; "+1" before (design/compact "Lệnh terminal xong")
        /** @type {?object} */
        let trailing = more ? {text: `+${more}`} : null;
        if (exit !== null) {
            trailing = {
                icon: exit === 0 ? 'object-select-symbolic' : 'window-close-symbolic',
                label: time !== null ? shortTime(time) : `exit ${exit}`, ...more ? {more} : {},
            };
        }
        const line = exit !== null
            ? [`exit ${exit}`, time !== null ? longTime(time) : null, dir || null]
            : [app, dir || null];
        return {
            text: title,
            leading: icon,
            trailing,
            compact: {
                card: {
                    icon, app: line.filter(Boolean).join(' · '), at: Number.isFinite(ev.at) ? ev.at : null,
                    picture: null, title, body: null, close: DISMISS, actionsOnHover: false, tight: true,
                },
            },
            expanded: null,
            actions: [{id: GO, label: 'Go to Tab', icon: 'go-jump-symbolic'}],
            minimalAction: false,
            // it stays till the tab is seen (Ptyxis takes its notification back) or ×
            ttl: 0,
            pressFirst: true,
            onPress: ev.activate ?? null,
            onAction: id => {
                if (id === GO)
                    ev.activate?.();
                else if (id === DISMISS)
                    ev.dismiss?.();
            },
            attributes: {app, cmd: title, exit},
        };
    },
};

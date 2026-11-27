/**
 * privacy adapter (FEATURES M4 "Privacy dot", design/compact "Chia sẻ và quay màn hình"):
 * a screen recording or a screen share is an activity of its own in the pill, with its
 * clock and a Stop button, in place of GNOME's two buttons in the bar. The microphone and
 * the camera are only the dot (kit/model/stack.js setPrivacy), never an activity.
 * Pure: the source watches Shell and Mutter and says what runs since when.
 *
 * Event: {id: 'recording'|'sharing', what: 'shell'|'portal'|'sharing', since, onAction}
 *   shell    Shell's own screencast (the screenshot UI)
 *   portal   an app recording through the portal (a recording MetaRemoteAccessHandle):
 *            Mutter gives no app name
 *   sharing  every non-recording remote access handle (a call sharing the screen, remote
 *            desktop), stopped together as GNOME's button does
 *   since    ms since the epoch: when it started
 */

import {clockTime} from '../../kit/model/presentation.js';

const WHAT = {
    call: {icon: 'camera-video-symbolic', title: 'In a call'},
    shell: {icon: 'media-record-symbolic', title: 'Recording the screen'},
    portal: {icon: 'media-record-symbolic', title: 'An app is recording the screen'},
    sharing: {icon: 'screen-shared-symbolic', title: 'Sharing the screen'},
};

// the icon alone: a round button of the compact (■, design/compact)
const STOP = {id: 'stop', icon: 'media-playback-stop-symbolic'};

export const MUTE = 'mute';
export const NOTIFY = 'notify';

// a call (design/compact "Đang gọi", 2026-11-27): the camera and the microphone both on; Mute or
// Unmute the microphone (cream), and, while Buoy holds Do Not Disturb, notifications back
function call(ev) {
    const since = Number.isFinite(ev.since) ? ev.since : null;
    const app = typeof ev.app === 'string' && ev.app.trim() ? ev.app.trim() : null;
    const title = app ? `In a call · ${app}` : 'In a call';
    const icon = WHAT.call.icon;
    /** @type {object[]} */
    const actions = [ev.muted === true
        ? {id: MUTE, label: 'Unmute', icon: 'microphone-sensitivity-muted-symbolic', main: true}
        : {id: MUTE, label: 'Mute', icon: 'audio-input-microphone-symbolic', main: true}];
    if (ev.dnd === true)
        actions.push({id: NOTIFY, label: 'Allow Notifications'});
    return {
        leading: icon,
        text: 'In a call',
        trailing: since === null ? null : {elapsed: since},
        actions,
        minimalAction: false,
        // a card, for the buttons' words; the running clock is the pill's, the card says since when
        compact: {
            card: {
                icon: null, picture: {icon, backdrop: true}, title, at: null, body: null, close: null,
                app: [since === null ? null : `Since ${clockTime(since)}`, ev.dnd === true ? 'Do Not Disturb on' : null].filter(Boolean).join(' · ') || null,
                actionsOnHover: false, tight: true,
            },
        },
        tile: since === null ? null : {caption: 'In a call'},
        ttl: 0,
        onAction: typeof ev.onAction === 'function' ? ev.onAction : null,
        attributes: {app, muted: ev.muted === true, dnd: ev.dnd === true},
    };
}

export default {
    screen(ev) {
        if (ev?.what === 'call')
            return call(ev);
        const w = WHAT[ev?.what];
        if (!w)
            return null;
        const since = Number.isFinite(ev.since) ? ev.since : null;
        const from = since === null ? null : clockTime(since);
        return {
            // the clock in trailing, which every pill shows (CONTRACT §3 "One minimal for
            // every place"): a side pill keeps it
            leading: w.icon,
            text: null,
            trailing: since === null ? null : {elapsed: since},
            actions: [STOP],
            // Stop only in the compact (and Home's card): not a button one brushes in the bar
            minimalAction: false,
            compact: {
                leading: {icon: w.icon, backdrop: true},
                text: w.title,
                subtitle: since === null ? null : {elapsed: since, text: from ? `from ${from}` : null},
                transport: true,
            },
            // Home's tile: the icon, the clock running, a short caption (design/home)
            tile: since === null ? null : {caption: ev.what === 'sharing' ? 'Sharing' : 'Recording'},
            ttl: 0,
            onAction: typeof ev.onAction === 'function' ? ev.onAction : null,
        };
    },
};

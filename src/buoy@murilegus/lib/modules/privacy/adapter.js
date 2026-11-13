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
    shell: {icon: 'media-record-symbolic', title: 'Recording the screen'},
    portal: {icon: 'media-record-symbolic', title: 'An app is recording the screen'},
    sharing: {icon: 'screen-shared-symbolic', title: 'Sharing the screen'},
};

// the icon alone: a round button of the compact (■, design/compact)
const STOP = {id: 'stop', icon: 'media-playback-stop-symbolic'};

export default {
    screen(ev) {
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

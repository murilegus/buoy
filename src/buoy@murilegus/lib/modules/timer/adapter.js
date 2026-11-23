/**
 * timer adapter (FEATURES M4 "Timer"; design/compact "Hẹn giờ", 2026-11-22, Ethan). Pure: the
 * source keeps the timers (model.js).
 *
 * Event, running: {kind: 'running', title, seconds, end, left, paused, more, act}
 *   seconds  its length; end: ms since the epoch it ends (running); left: ms left (paused)
 *   more     other timers running or paused
 * Event, ended: {kind: 'ended', title, name, seconds, at, pomodoro, next, clocks, act}
 *   pomodoro the turn that ended, or null; next: the next turn's title ("Break", "Focus 3/4")
 *   and length, or null
 *   clocks   GNOME Clocks' own timer ended: no Restart
 * act(id): an action's id (the constants below)
 */
import {clockText, hourText, lengthText} from './model.js';

export const PAUSE = 'pause';
export const RESUME = 'resume';
export const ADD = 'add';
export const STOP = 'stop';
export const DISMISS = 'dismiss';
export const RESTART = 'restart';
export const DONE = 'done';
export const NEXT = 'next';
export const AGAIN = 'again';

const ICON = 'alarm-symbolic';

function running(ev) {
    const total = Math.max(1, ev.seconds) * 1000;
    const paused = ev.paused === true;
    const more = Number.isInteger(ev.more) && ev.more > 0 ? ev.more : 0;
    const left = Math.max(0, Number(ev.left) || 0);   // paused only: running reads its end
    // the ring left: drawn again once a second while shown (kit until-ring); paused, still
    const lead = paused ? {progress: Math.min(1, left / total)} : {ring: {from: ev.end - total, until: ev.end}};
    const line = paused ? `Paused · ${clockText(left)} left` : `${lengthText(ev.seconds)} · ends ${hourText(ev.end)}`;
    return {
        text: ev.title,
        leading: lead,
        trailing: paused ? {text: more ? `+${more} ${clockText(left)}` : clockText(left)} : {until: ev.end, ...more ? {more} : {}},
        compact: {
            card: {icon: lead, app: line, at: null, picture: null, title: ev.title, body: null, close: DISMISS, actionsOnHover: false, tight: true},
        },
        expanded: null,
        actions: [
            paused
                ? {id: RESUME, label: 'Resume', icon: 'media-playback-start-symbolic', main: true}
                : {id: PAUSE, label: 'Pause', icon: 'media-playback-pause-symbolic', main: true},
            {id: ADD, label: '+1 min'},
            {id: STOP, label: 'Stop', icon: 'media-playback-stop-symbolic'},
        ],
        minimalAction: false,
        ttl: 0,
        attributes: {title: ev.title, paused},
    };
}

function ended(ev) {
    const name = typeof ev.name === 'string' && ev.name.trim() ? ev.name.trim() : '';
    const p = ev.pomodoro ?? null;
    const next = p ? ev.next ?? null : null;
    let title = ev.clocks === true ? 'Time\'s up' : `Time's up · ${name || 'Timer'}`;
    let line = ev.clocks === true ? 'Clocks' : `${lengthText(ev.seconds)} · ${hourText(ev.at)}`;
    /** @type {object[]} */
    let actions = ev.clocks === true
        ? [{id: DONE, label: 'Done', main: true}]
        : [{id: RESTART, label: 'Restart', icon: 'view-refresh-symbolic'}, {id: DONE, label: 'Done', main: true}];
    if (next) {
        // Pomodoro: the next turn waits for you (design/compact "Hẹn giờ", 5)
        title = `${next.title} · ${lengthText(next.seconds)}`;
        line = p.phase === 'work' ? `Round ${p.round}/${p.rounds} done · ${lengthText(ev.seconds)}` : `Break over · ${lengthText(ev.seconds)}`;
        actions = p.phase === 'work'
            ? [{id: NEXT, label: 'Take a Break', main: true}, {id: AGAIN, label: 'Keep Going'}, {id: STOP, label: 'Stop'}]
            : [{id: NEXT, label: 'Start Focus', main: true}, {id: STOP, label: 'Stop'}];
    }
    return {
        text: next ? next.title : 'Time\'s up',
        leading: ICON,
        trailing: null,
        compact: {
            // the alarm on its fill-2 plate, as a picture (no logo badge)
            card: {icon: null, app: line, at: null, picture: {icon: ICON, backdrop: true}, title, body: null, close: DONE, actionsOnHover: false, tight: true},
        },
        expanded: null,
        actions,
        minimalAction: false,
        // it stays, its card open, till you answer (design/compact "Hẹn giờ", 4), as a critical
        // notification's (kit/ui/island.js alertStays)
        ttl: 0,
        alertStays: true,
        attributes: {title, ended: true},
    };
}

export default {
    timer(ev) {
        const out = ev.kind === 'ended' ? ended(ev) : running(ev);
        return {...out, onAction: id => ev.act?.(id)};
    },
};

/**
 * call adapter (FEATURES M4 "Phone via GSConnect", part 3; design/device "Cuộc gọi và tab Điện
 * thoại", 2026-11-18, Ethan): a call on the phone, as GSConnect tells it. Pure: the source reads
 * GSConnect's call notifications (model/phone.js callOf) and passes plain fields and callbacks.
 *
 * Event: {id, caller, state, photo, phoneName, since, muted, hidden, canMute, mute, hide}
 *   state      'ringing' | 'talking'
 *   photo      the caller's picture KDE Connect sends (a Gio.Icon), or null
 *   phoneName  the phone's name ("Redmi Note 14"), or null
 *   since      ms since the epoch the call was answered (talking), or null
 *   muted      Mute ran (the phone silent, still ringing); hidden: its card's × ran
 *   canMute    GSConnect can silence it now; mute(), hide()
 */

export const MUTE = 'mute';
export const HIDE = 'hide';
/** A call's green (iOS's system green on dark, as the camera's dot: design/colours). */
export const GREEN = '#30d158';

const CALL_ICON = 'call-start-symbolic';
const PHONE_ICON = 'phone-symbolic';
const MUTE_ICON = 'audio-volume-muted-symbolic';

export default {
    call(ev) {
        const ringing = ev.state === 'ringing';
        const quiet = ev.muted === true || ev.hidden === true;
        const photo = ev.photo ? {art: ev.photo, round: true, icon: PHONE_ICON} : null;
        const handset = {icon: CALL_ICON, color: GREEN};
        let trailing = null;
        if (ringing)
            trailing = {text: ev.muted === true ? 'Silenced' : 'Incoming', color: GREEN};
        else if (Number.isFinite(ev.since))
            trailing = {elapsed: ev.since, color: GREEN};
        const where = [ringing ? 'Incoming Call' : 'On a Call', ev.phoneName].filter(Boolean).join(' · ');
        const mute = ringing && ev.canMute === true && ev.muted !== true;
        // every output sets the same fields: ringing → talking updates in place
        return {
            text: ev.caller || 'Unknown',
            leading: ringing && photo ? photo : handset,
            trailing,
            compact: {
                card: {
                    // the photo with the phone on its corner; without one, the green handset at 40
                    icon: photo ? PHONE_ICON : handset, app: where, at: null, picture: photo,
                    title: ev.caller || 'Unknown', body: null,
                    close: ringing ? HIDE : null, actionsOnHover: false, tight: true,
                },
            },
            expanded: null,
            actions: mute ? [{id: MUTE, label: 'Mute', icon: MUTE_ICON}] : [],
            minimalAction: false,
            ttl: 0,
            // ringing: the card opens at once and stays till it stops (or you silence or hide it)
            needsYou: ringing && !quiet,
            alertStays: ringing && !quiet,
            onAction: id => {
                if (id === MUTE)
                    ev.mute?.();
                else if (id === HIDE)
                    ev.hide?.();
            },
            onPress: null,
            attributes: {caller: ev.caller ?? '', state: ringing ? 'ringing' : 'talking'},
        };
    },
};

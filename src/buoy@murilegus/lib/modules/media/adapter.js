// Pure: event → presentation data. No St, no Main, no timers.
export default {
    media(ev, profile) {
        return {
            attributes: {title: ev.title, artist: ev.artist, art: ev.art},
            state: {status: ev.status},
            leading: {art: ev.art, icon: 'audio-x-generic-symbolic'},
            text: profile?.title ?? `${ev.title} · ${ev.artist}`,
            trailing: {icon: ev.status === 'Playing' ? 'eq' : 'media-playback-pause-symbolic'},
            expanded: {
                leading: {art: ev.art},
                center: {title: ev.title, subtitle: ev.artist, progress: true},
                bottom: {transport: true},
            },
            actions: [{id: 'playpause', icon: 'media-playback-start-symbolic'}],
            onPress: ev.raise,
        };
    },
};

export default {
    osd(ev) {
        return {leading: {icon: ev.icon}, trailing: {bar: ev.level}, ttl: 1500};
    },
};

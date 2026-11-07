import {NotificationSource} from './source.js';
import adapter from './adapter.js';
import {NotificationsTab} from './tab.js';

// GNOME's notifications on the island (docs/NOTIFICATIONS.md): the banner GNOME would show
// becomes a pill, its compact a card with the notification's own buttons; the
// Notifications tab lists Shell's own list, with Do Not Disturb (§6).
export default {
    id: 'notification',
    title: 'Notifications',
    icon: 'preferences-system-notifications-symbolic',
    kinds: ['notification'],
    source: NotificationSource,
    adapter,
    tab: NotificationsTab,
};

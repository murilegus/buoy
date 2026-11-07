import {NotificationSource} from './source.js';
import adapter from './adapter.js';

// GNOME's notifications on the island (docs/NOTIFICATIONS.md): the banner GNOME would show
// becomes a pill, its compact the notification's own buttons. The Notifications tab is
// step 2 (§6); until then the tab shows empty.
export default {
    id: 'notification',
    title: 'Notifications',
    icon: 'preferences-system-notifications-symbolic',
    kinds: ['notification'],
    source: NotificationSource,
    adapter,
};

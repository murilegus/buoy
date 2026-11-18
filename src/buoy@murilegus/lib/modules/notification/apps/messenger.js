import base, {senderPicture} from '../adapter.js';

// Messenger on the phone (FEATURES M4 "Phone via GSConnect", part 2):
// its sender's photo, round
export default {
    notification: ev => senderPicture(base.notification(ev), ev),
};

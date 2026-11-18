import base, {ride} from '../adapter.js';

// Grab on the phone (FEATURES M4 "Phone via GSConnect", part 2):
// a driver found, coming, arrived, with the licence plate
export default {
    notification: ev => ride(base.notification(ev), ev),
};

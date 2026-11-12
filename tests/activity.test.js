// Run: gjs -m tests/activity.test.js
import {validate, PRIORITY} from '../src/buoy@murilegus/lib/kit/model/activity.js';

const a = validate({id: 'media:spotify:1', kind: 'media'});
if (a.priority !== PRIORITY.media)
    throw new Error('default priority');
if (a.ttl !== 0 || a.style !== 'standard')
    throw new Error('defaults');
if (a.alert !== false || a.alertStays !== false)
    throw new Error('alert defaults: no alert, and an alert closes on its own');
if (validate({id: 'n', kind: 'notification', alert: true, alertStays: true}).alertStays !== true)
    throw new Error('alertStays kept');

const b = validate({id: 'x', kind: 'osd', ttl: 99 * 60 * 60 * 1000});
if (b.ttl !== 8 * 60 * 60 * 1000)
    throw new Error('ttl cap 8h');

let threw = false;
try {
    validate({kind: 'media'});
} catch {
    threw = true;
}
if (!threw)
    throw new Error('missing id must throw');

console.log('activity contract: ok');

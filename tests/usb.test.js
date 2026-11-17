// Run: gjs -m tests/usb.test.js   (pure: FEATURES M4 "USB / phone / webcam plugged", design/device "Đang cắm")
import {cameraOf, diffById, driveKind, formatSize, spaceLine, usbShows} from '../src/buoy@murilegus/lib/kit/model/drives.js';
import adapter, {TTL, WRITING_TTL} from '../src/buoy@murilegus/lib/modules/usb/adapter.js';
import {validate, PRIORITY} from '../src/buoy@murilegus/lib/kit/model/activity.js';
import {planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function ok(cond, msg) {
    if (!cond)
        throw new Error(msg);
}

// --- sizes ------------------------------------------------------------------------------------------
eq([formatSize(41.2e9), formatSize(64e9), formatSize(7.46e9), formatSize(820e6), formatSize(1.5e12), formatSize(512), formatSize(0)],
    ['41 GB', '64 GB', '7.5 GB', '820 MB', '1.5 TB', '512 bytes', '0 bytes'], 'sizes: powers of 1000 as GNOME, one decimal under 10');
eq([formatSize(null), formatSize(NaN), formatSize(-1)], [null, null, null], 'sizes: unknown');
eq([spaceLine(41.2e9, 64e9), spaceLine(41.2e9, null), spaceLine(41.2e9, 0), spaceLine(null, 64e9)],
    ['41 GB free of 64 GB', '41 GB free', '41 GB free', null], 'space: free of size; free alone; nothing without the free space');

// --- which mounts are a drive plugged in -------------------------------------------------------------
const M = o => ({hasVolume: true, volumeClass: 'device', path: '/media/ethan/USB', scheme: 'file', removable: true, ...o});
eq(driveKind(M()), 'drive', 'a USB stick on a removable drive');
eq([driveKind(M({scheme: 'mtp', path: null, removable: false})), driveKind(M({scheme: 'gphoto2', removable: false})), driveKind(M({scheme: 'afc'}))],
    ['phone', 'phone', 'phone'], 'a phone in file transfer mode (gvfs mtp, gphoto2, afc): no drive, still one');
eq([driveKind(M({hasVolume: false})), driveKind(M({volumeClass: 'network'})), driveKind(M({path: '/home/ethan/.cache/x'})), driveKind(M({removable: false})), driveKind(null)],
    [null, null, null, null, null], 'not one: no volume, a network share, a hidden path (Shell\'s autorun), the computer\'s own disk, nothing');

// --- webcams ---------------------------------------------------------------------------------------
eq(cameraOf({id: 'video2', index: '0\n', removable: 'removable\n', product: 'HD Pro Webcam C920\n', name: 'HD Pro Webcam C920'}),
    {id: 'video2', name: 'HD Pro Webcam C920'}, 'a webcam plugged in: its USB product name');
eq([cameraOf({id: 'video0', index: '0', removable: 'fixed', product: 'Integrated Camera'}), cameraOf({id: 'video3', index: '1', removable: 'removable'})],
    [null, null], 'not one: built in (a "fixed" port, Ethan\'s laptop), a second node (metadata)');
eq([cameraOf({id: 'video4', index: '0', removable: 'unknown', product: null, name: 'Integrated C: Integrated'}).name, cameraOf({id: 'v', index: '0'}).name],
    ['Integrated C', 'Webcam'], 'name: the kernel\'s before its colon, else "Webcam"');
eq(diffById(null, [{id: 'a'}]), {added: [], removed: []}, 'first reading: nothing said');
eq(diffById([{id: 'a'}, {id: 'b'}], [{id: 'b'}, {id: 'c'}]), {added: [{id: 'c'}], removed: [{id: 'a'}]}, 'came and went');

// --- the pills ---------------------------------------------------------------------------------------
const build = ev => {
    const d = adapter.usb(ev);
    return d ? validate({id: 'usb:system:drive', kind: 'usb', app: 'system', ...d}) : null;
};
const line = a => {
    const p = planMinimal(a);
    return [p.leading?.icon ?? null, p.text, p.trailing];
};
let did = null;
const usb = build({
    what: 'drive-in', name: 'USB 64 GB', kind: 'drive', free: 41.2e9, size: 64e9, open: () => {
        did = 'open';
    }, eject: () => {
        did = 'eject';
    },
});
eq(line(usb), ['drive-removable-media-symbolic', 'USB 64 GB', null], 'drive in: its icon and name');
eq([usb.ttl, usb.priority, usb.kind, usb.actions.map(a => a.label)], [TTL, PRIORITY.device, 'usb', ['Open', 'Eject']],
    'drive in: 3 s, the devices\' priority, Open and Eject');
eq([usb.compact.card.title, usb.compact.card.app], ['USB 64 GB', '41 GB free of 64 GB'], 'drive in: its compact, the free space under its name');
usb.onAction('eject');
eq(did, 'eject', 'Eject ejects');
usb.onAction('open');
eq(did, 'open', 'Open opens');
did = null;
usb.onPress();
eq(did, 'open', 'a click opens it');
eq(build({what: 'drive-in', name: 'USB 64 GB', kind: 'drive', open: () => {}}).compact.card.app, null, 'drive in: no free space yet, no line');
const ph = build({what: 'drive-in', name: 'Redmi Note 14', kind: 'phone', open: () => {}, eject: () => {}});
eq([line(ph)[0], ph.attributes.kind], ['phone-symbolic', 'phone'], 'a phone (MTP): the phone icon');
const bare = build({what: 'drive-in', name: 'X', kind: 'drive'});
eq([bare.compact, bare.actions.length, bare.onAction], [null, 0, null], 'no opener nor eject: a flash only');
eq([line(build({what: 'writing', name: 'USB 64 GB'}))[1], build({what: 'writing', name: 'USB 64 GB'}).ttl], ['Writing to USB 64 GB', WRITING_TTL],
    'writing: stays until the eject says how it went');
eq(['safe', 'failed', 'drive-out'].map(what => line(build({what, name: 'USB 64 GB'}))[1]),
    ['Safe to remove USB 64 GB', 'Couldn\'t eject USB 64 GB', 'Unplugged USB 64 GB'], 'eject done, failed, pulled out');
eq(line(build({what: 'drive-out', name: '', kind: 'phone'})), ['phone-symbolic', 'Unplugged Phone', null], 'a phone pulled out without a name');
eq([line(build({what: 'camera-in', name: 'HD Pro Webcam C920'})), line(build({what: 'camera-out', name: 'HD Pro Webcam C920'}))[1]],
    [['camera-web-symbolic', 'HD Pro Webcam C920', null], 'Unplugged HD Pro Webcam C920'], 'webcam in and out');
const long = 'A drive with a really long label that goes on and on';
eq(line(build({what: 'drive-in', name: long}))[1], long, 'long name: not cut in the adapter');
eq([adapter.usb({what: 'nope'}), adapter.usb(null)], [null, null], 'anything else: nothing');
ok(build({what: 'safe', name: 'X'}).onPress === null, 'a flash without a click');

// --- GNOME's own notifications -------------------------------------------------------------------
const pill = {attributes: {what: 'drive-in', name: 'USB 64 GB'}};
eq([usbShows('“USB 64 GB” connected', null, pill), usbShows('“Other” connected', null, pill), usbShows('“USB 64 GB” connected', null, null),
    usbShows('Writing data to USB 64 GB', 'media-removable-symbolic', null), usbShows('Hello', null, {attributes: {what: 'safe', name: 'Hello'}})],
[true, false, false, true, false], 'GNOME\'s notifications: autorun\'s for the drive shown, Shell\'s unmount ones; nothing else');

print('usb: ok');

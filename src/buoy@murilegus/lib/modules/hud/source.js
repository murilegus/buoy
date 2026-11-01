import {Source} from '../../kit/source.js';
// TODO: wrap Main.osdWindowManager.show(monitor, icon, label, level, maxLevel)
// so volume/brightness changes land on the island instead of the centre OSD.
//
// Events to emit:  build('osd', 'system', {id: 'osd', icon, level})

export class OsdSource extends Source {}

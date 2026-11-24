import {PrintSource} from './source.js';
import adapter from './adapter.js';

// Print jobs (FEATURES M4 "Print job progress"; design/compact "Lệnh in", 2026-11-23, Ethan): the
// job in the pill from CUPS's own signals, its end, the printer's problems, in place of gsd's
// "Printers" notifications. No tab: a click opens Settings → Printers.
export default {id: 'print', kinds: ['print'], noTab: true, source: PrintSource, adapter};

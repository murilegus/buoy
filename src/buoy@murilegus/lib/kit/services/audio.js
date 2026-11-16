import Gvc from 'gi://Gvc';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';

/**
 * Where the sound goes, from the Gvc mixer Shell's Quick Settings already holds
 * (ui/status/volume.js getMixerControl): Buoy makes no mixer of its own (FEATURES M4
 * "Headphones / display plugged", design/compact "Cắm màn hình và tai nghe").
 *
 * When the output moves to or from headphones GNOME shows the volume OSD
 * (OutputStreamSlider._portChanged → showOSD), the same OSD as a volume key. The plugged
 * module's headphones flash says it instead: it registers a watcher here, and the HUD asks
 * outputMoving() before turning an OSD into a pill. GNOME connected to the mixer and the
 * stream before Buoy, so its OSD comes first, while the watcher still holds the last output.
 */

/** @returns {Gvc.MixerControl} Shell's mixer */
export function mixer() {
    return getMixerControl();
}

/**
 * @param {?Gvc.MixerControl} control
 * @returns {?Gvc.MixerStream} the default output, once the mixer is ready
 */
export function defaultSink(control) {
    return control?.get_state() === Gvc.MixerControlState.READY ? control.get_default_sink() : null;
}

/**
 * @param {Gvc.MixerControl} control
 * @param {?Gvc.MixerStream} sink
 * @returns {?{id: number, formFactor: ?string, port: ?string, description: ?string, level: ?number, muted: boolean}}
 *   what modules/plugged/adapter.js outputOf reads, and the volume as Shell's slider has it
 *   (StreamSlider.getLevel: volume over the normal maximum)
 */
export function readSink(control, sink) {
    if (!sink)
        return null;
    const max = control.get_vol_max_norm();
    return {
        id: sink.get_id(),
        formFactor: sink.get_form_factor() || null,
        port: sink.get_ports().length > 0 ? sink.get_port()?.port ?? null : null,
        description: sink.get_description() || null,
        level: max > 0 ? sink.volume / max : null,
        muted: sink.is_muted === true,
    };
}

/**
 * @param {Gvc.MixerControl} control
 * @param {*} id  a sink's id (readSink().id)
 * @returns {?{ports: Array<{port: string, available: boolean}>}} that sink's ports and whether each
 *   has something plugged in (GvcMixerStreamPort.available); null: the sink is gone
 */
export function sinkPorts(control, id) {
    const s = typeof id === 'number' ? control?.lookup_stream_id(id) : null;
    if (!s)
        return null;
    return {ports: s.get_ports().map(p => ({port: p.port, available: p.available !== false}))};
}

let watcher = null;

/**
 * @param {?function(): boolean} fn  the output moved since the flash last said it; null: none
 */
export function watchOutput(fn) {
    watcher = fn;
}

/** @returns {boolean} an OSD now comes from the output moving, and a flash will say it */
export function outputMoving() {
    try {
        return watcher?.() === true;
    } catch (e) {
        console.debug(`Buoy: audio watcher: ${e.message}`);
        return false;
    }
}

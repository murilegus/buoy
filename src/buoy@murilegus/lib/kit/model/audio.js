/**
 * Where the sound goes, as GNOME tells headphones (FEATURES M4 "Headphones / display plugged",
 * "Device tab"). Pure: the plugged module and the Device tab share it (kit/services/audio.js reads
 * Shell's mixer).
 */

/**
 * Headphones as GNOME tells them (ui/status/volume.js OutputStreamSlider._findHeadphones): a
 * headset or headphone device (Bluetooth, USB), or a port named so (a jack).
 *
 * @param {{formFactor?: ?string, port?: ?string}} sink
 * @returns {boolean}
 */
export function isHeadphones({formFactor = null, port = null} = {}) {
    if (formFactor === 'headset' || formFactor === 'headphone')
        return true;
    return typeof port === 'string' && port.toLowerCase().includes('headphone');
}

/**
 * @param {?string} sinkName  Gvc's sink name (PipeWire's node name)
 * @returns {boolean} a Bluetooth sink (bluez_output.…)
 */
export function isBluetoothSink(sinkName) {
    return typeof sinkName === 'string' && sinkName.startsWith('bluez');
}

/**
 * The output the sound goes to, as the flash says it: a device's own name for Bluetooth and
 * USB headphones, "Headphones" for a jack, "Speakers" otherwise.
 *
 * @param {{id?: *, name?: ?string, formFactor?: ?string, port?: ?string, description?: ?string}} sink
 * @returns {{key: string, output: string, name: string, device: boolean, bluetooth: boolean, sinkId: *, port: ?string}}
 *   `device`: headphones of their own (Bluetooth, USB), not a jack; `bluetooth`: a Bluetooth sink
 */
export function outputOf(sink = {}) {
    const headphones = isHeadphones(sink);
    const device = sink.formFactor === 'headset' || sink.formFactor === 'headphone';
    const own = typeof sink.description === 'string' && sink.description.trim() ? sink.description.trim() : null;
    return {
        key: `${sink.id ?? ''}|${sink.port ?? ''}`,
        output: headphones ? 'headphones' : 'speakers',
        name: headphones ? (device && own) || 'Headphones' : 'Speakers',
        device: headphones && device,
        bluetooth: isBluetoothSink(sink.name),
        sinkId: sink.id ?? null,
        port: sink.port ?? null,
    };
}

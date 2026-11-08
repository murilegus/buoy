import Gio from 'gi://Gio';

/**
 * Reading small files without blocking GNOME Shell (EGO review: no synchronous file IO in
 * Shell code, 2026-11-09). Gio's async calls run on its worker threads; the result comes
 * back on the main loop. No Shell import, so the tests run it (tests/files.test.js); the
 * parsing of what is read sits here too when it is that small (`ppidOf`).
 */

/**
 * @param {string|Gio.File} file  a path or a Gio.File
 * @param {?Gio.Cancellable} [cancellable]
 * @returns {Promise<?string>} its text (UTF-8), null when it cannot be read
 */
export function readText(file, cancellable = null) {
    const f = typeof file === 'string' ? Gio.File.new_for_path(file) : file;
    return new Promise(resolve => {
        f.load_contents_async(cancellable, (source, res) => {
            try {
                const [, bytes] = source.load_contents_finish(res);
                resolve(new TextDecoder().decode(bytes));
            } catch {
                resolve(null);
            }
        });
    });
}

/**
 * @param {Gio.File} dir
 * @param {string} attributes  e.g. 'standard::name,standard::type,time::modified'
 * @param {?Gio.Cancellable} [cancellable]
 * @returns {Promise<Gio.FileInfo[]>} its children's infos; rejects with Gio's error when it
 *   cannot be listed (missing: Gio.IOErrorEnum.NOT_FOUND)
 */
export function listInfos(dir, attributes, cancellable = null) {
    return new Promise((resolve, reject) => {
        dir.enumerate_children_async(attributes, Gio.FileQueryInfoFlags.NONE,
            0, cancellable, (source, res) => {
                let children;
                try {
                    children = source.enumerate_children_finish(res);
                } catch (e) {
                    reject(e);
                    return;
                }
                const infos = [];
                const next = () => children.next_files_async(64, 0, cancellable, (en, r) => {
                    let batch;
                    try {
                        batch = en.next_files_finish(r);
                    } catch {
                        batch = [];
                    }
                    if (batch.length === 0) {
                        children.close_async(0, null, null);
                        resolve(infos);
                        return;
                    }
                    infos.push(...batch);
                    next();
                });
                next();
            });
    });
}

/**
 * @param {Gio.File} dir
 * @param {?Gio.Cancellable} [cancellable]
 * @returns {Promise<string[]>} the names of its children; rejects as listInfos does
 */
export async function listNames(dir, cancellable = null) {
    return (await listInfos(dir, 'standard::name', cancellable)).map(i => i.get_name());
}

/**
 * @param {string} stat  the text of /proc/<pid>/stat
 * @returns {number} the parent's pid in it, 0 when it does not say
 */
export function ppidOf(stat) {
    if (typeof stat !== 'string' || !stat.includes(')'))
        return 0;
    // "pid (comm) state ppid …": comm may hold spaces and parentheses
    return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) || 0;
}

// The import boundaries eslint.config.js enforces (ARCHITECTURE rules 1 and 2, the kit's
// layers): each case lints one import as if it were in that file and expects it allowed or
// refused. Run by `pnpm lint` with node (ESLint's API), not by tests/run.sh.
/* global process */
import {ESLint} from 'eslint';

const S = 'src/buoy@murilegus';
const K = `${S}/lib/kit`, M = `${S}/lib/modules`;
const ok = true, no = false;
const CASES = [
    // kit/model: pure
    [`${K}/model/x.js`, './stack.js', ok],
    [`${K}/model/x.js`, 'gi://GLib', ok],
    [`${K}/model/x.js`, 'gi://Gio', no],
    [`${K}/model/x.js`, 'gi://St', no],
    [`${K}/model/x.js`, '../services/files.js', no],
    [`${K}/model/x.js`, '../ui/pill.js', no],
    [`${K}/model/x.js`, 'resource:///org/gnome/shell/ui/main.js', no],
    [`${K}/model/x.js`, '../../modules/media/adapter.js', no],
    // kit/services: no actors
    [`${K}/services/x.js`, '../model/activity.js', ok],
    [`${K}/services/x.js`, './files.js', ok],
    [`${K}/services/x.js`, 'gi://Gio', ok],
    [`${K}/services/x.js`, 'gi://Shell', ok],
    [`${K}/services/x.js`, 'resource:///org/gnome/shell/ui/main.js', ok],
    [`${K}/services/x.js`, '../ui/pill.js', no],
    [`${K}/services/x.js`, 'gi://St', no],
    [`${K}/services/x.js`, 'gi://Clutter', no],
    [`${K}/services/x.js`, '../../modules/media/source.js', no],
    // kit/ui: anything in the kit, no module
    [`${K}/ui/x.js`, '../model/presentation.js', ok],
    [`${K}/ui/x.js`, '../services/registry.js', ok],
    [`${K}/ui/x.js`, 'gi://St', ok],
    [`${K}/ui/present/x.js`, '../../model/mascot.js', ok],
    [`${K}/ui/x.js`, '../../modules/media/tab.js', no],
    // kit/settings.js: the path 0.1's install.sh imports
    [`${K}/settings.js`, './model/settings.js', ok],
    [`${K}/settings.js`, './ui/home.js', no],
    // a module: kit/ only, never another module
    [`${M}/media/source.js`, '../../kit/services/source.js', ok],
    [`${M}/media/tab.js`, '../../kit/ui/present/parts.js', ok],
    [`${M}/media/index.js`, './adapter.js', ok],
    [`${M}/media/tab.js`, 'gi://St', ok],
    [`${M}/media/source.js`, '../calendar/agenda.js', no],
    [`${M}/media/source.js`, '../../modules/calendar/agenda.js', no],
    // adapter.js, idle.js, hooks.js: pure
    [`${M}/media/adapter.js`, '../../kit/model/activity.js', ok],
    [`${M}/media/adapter.js`, './layout.js', ok],
    [`${M}/media/adapter.js`, '../../kit/ui/pill.js', no],
    [`${M}/media/adapter.js`, '../../kit/services/files.js', no],
    [`${M}/media/adapter.js`, 'gi://St', no],
    [`${M}/media/adapter.js`, 'gi://GLib', no],
    [`${M}/media/adapter.js`, 'resource:///org/gnome/shell/ui/main.js', no],
    [`${M}/media/adapter.js`, '../calendar/agenda.js', no],
    [`${M}/clock/idle.js`, '../../kit/model/daypart.js', ok],
    [`${M}/clock/idle.js`, '../../kit/services/idle.js', no],
    [`${M}/agent/hooks.js`, 'gi://Gio', no],
    // apps/*.js: pure
    [`${M}/media/apps/x.js`, '../adapter.js', ok],
    [`${M}/media/apps/x.js`, '../../../kit/model/activity.js', ok],
    [`${M}/media/apps/x.js`, '../../../kit/ui/pill.js', no],
    [`${M}/media/apps/x.js`, '../../calendar/agenda.js', no],
    // prefs.js: nothing that needs the Shell
    [`${S}/prefs.js`, './lib/kit/model/settings.js', ok],
    [`${S}/prefs.js`, './lib/kit/services/dbus.js', ok],
    [`${S}/prefs.js`, './lib/modules/agent/hooks.js', ok],
    [`${S}/prefs.js`, './lib/modules/greeting/adapter.js', ok],
    [`${S}/prefs.js`, 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js', ok],
    [`${S}/prefs.js`, './lib/kit/ui/pill.js', no],
    [`${S}/prefs.js`, 'gi://St', no],
    [`${S}/prefs.js`, 'resource:///org/gnome/shell/ui/main.js', no],
    [`${S}/prefs.js`, './lib/modules/media/source.js', no],
];

const eslint = new ESLint();
const results = await Promise.all(CASES.map(([file, spec]) =>
    eslint.lintText(`import {x} from '${spec}';\nexport const y = x;\n`, {filePath: file})));
let failed = 0;
for (const [i, [file, spec, allowed]] of CASES.entries()) {
    const refused = results[i][0].messages.some(m => m.ruleId === 'no-restricted-imports');
    if (refused === allowed) {
        failed++;
        console.error(`boundaries: ${file} importing ${spec}: ${refused ? 'refused' : 'allowed'}, want ${allowed ? 'allowed' : 'refused'}`);
    }
}
if (failed)
    process.exitCode = 1;
else
    console.log(`boundaries: ok (${CASES.length} cases)`);

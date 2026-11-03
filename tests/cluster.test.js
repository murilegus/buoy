// Run: gjs -m tests/cluster.test.js   (pure: what the left cluster shows, SPEC §1)
import {GENERIC_APP_ICONS, fallbackIcons, leftCluster, workspaceName} from '../src/buoy@murilegus/lib/kit/cluster.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const base = {app: 'Firefox', index: 1, names: [], hover: false, overview: false, empty: 'workspace'};
const show = over => leftCluster({...base, ...over});

// --- workspace names --------------------------------------------------------------------
eq(workspaceName(1, []), null, 'no names set: none');
eq(workspaceName(1, ['Mail', 'Work']), 'Work', 'the name at that index');
eq(workspaceName(2, ['Mail', 'Work']), null, 'past the list: none');
eq(workspaceName(0, ['  ', 'Work']), null, 'a blank name counts as unset');
eq(workspaceName(1, ['', ' Work ']), 'Work', 'trimmed');

// --- focused app ----------------------------------------------------------------------
eq(show({}), {visible: true, icon: 'app', text: 'Firefox', extra: null}, 'app, no hover: just the app');
eq(show({hover: true}), {visible: true, icon: 'app', text: 'Firefox', extra: '2'},
    'hover adds the workspace number, 1-based, no "WS"');
eq(show({hover: true, names: ['', 'Work']}).extra, 'Work', 'hover shows the name when the user set one');
eq(show({hover: true, index: 0}).extra, '1', 'the first workspace is 1');
const long = 'A very long application name that goes on and on';
eq(show({app: long}).text, long, 'long names are not cut here (the label ellipsizes)');

// --- no app / Overview ----------------------------------------------------------------
eq(show({app: null}), {visible: true, icon: 'grid', text: 'Workspace 2', extra: null},
    'no focused app: the workspace in full words');
eq(show({app: ''}).text, 'Workspace 2', 'an app with no name counts as none');
eq(show({overview: true}).text, 'Workspace 2', 'the Overview has no focused window');
eq(show({app: null, hover: true}).extra, null, 'hover adds nothing when the workspace is already the content');
eq(show({app: null, names: ['', 'Work']}).text, 'Work', 'its name instead of "Workspace N"');
eq(show({app: null, empty: 'hidden'}), {visible: false, icon: null, text: '', extra: null},
    'left-cluster-empty = hidden: nothing');
eq(show({overview: true, empty: 'hidden'}).visible, false, 'hidden in the Overview too');
eq(show({empty: 'hidden'}).visible, true, 'hidden only applies without an app');

// --- fallback icons: the app's -symbolic, then the generic ones --------------------------
const G = GENERIC_APP_ICONS;
eq(fallbackIcons('org.gnome.Calculator', 'org.gnome.Calculator.desktop'), ['org.gnome.Calculator-symbolic', ...G],
    'icon and id agree: one symbolic name, then the generic icon');
eq(fallbackIcons('firefox', 'firefox_firefox.desktop'), ['firefox-symbolic', 'firefox_firefox-symbolic', ...G],
    'icon name first, then the id (snaps name them apart)');
eq(fallbackIcons('utilities-terminal-symbolic', 'x.desktop'), ['utilities-terminal-symbolic', 'x-symbolic', ...G],
    'an icon that is already symbolic is not doubled');
eq(fallbackIcons(null, 'org.example.App.desktop'), ['org.example.App-symbolic', ...G], 'a file icon: only the id');
eq(fallbackIcons('/opt/app/icon.png', null), G, 'a path is not an icon name: the generic icon only');
eq(fallbackIcons(null, null), G, 'nothing known: the generic icon');
eq(fallbackIcons('window', null), G, 'a generic icon is not listed twice');
eq(G, ['window-symbolic', 'focus-windows-symbolic'], 'a plain window, then two windows (not the gears)');

console.log('cluster: ok');

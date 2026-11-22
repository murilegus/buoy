// Run: gjs -m tests/terminal.test.js   (pure: FEATURES M4 "Terminal command finished in an unfocused tab"; design/compact "Lệnh terminal xong")
import adapter, {DISMISS, GO} from '../src/buoy@murilegus/lib/modules/terminal/adapter.js';
import {MATCH_WINDOW, PTYXIS_APPS, RECORD_PREFIX, dirText, hookAdded, hookLine, longTime, matchRecord, parseRecord, shortTime}
    from '../src/buoy@murilegus/lib/modules/terminal/finished.js';
import {element, planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {PRIORITY, tierOf, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
const near = (a, b, msg) => {
    if (Math.abs(a - b) > 0.01)
        throw new Error(`${msg}: expected ${b}, got ${a}`);
};

eq(PTYXIS_APPS, ['org.gnome.Ptyxis', 'org.gnome.Ptyxis.Devel'], 'Ptyxis, release and nightly');
eq(RECORD_PREFIX, 'buoy-shell-', 'the hook\'s files');
eq(PRIORITY.terminal, PRIORITY.attention, 'waits as a window asking (design/compact)');

// --- the hook's records (hooks/shell.sh, as zsh and bash wrote them) -------------------------------------
const zsh = parseRecord('1 0 1795269986.1263375282 1795269987.3333833218\n/home/ethan/works/buoy\nsleep 1.2\n');
eq([zsh.exit, zsh.dir, zsh.cmd], [0, '/home/ethan/works/buoy', 'sleep 1.2'], 'zsh: exit, directory, command');
near(zsh.end - zsh.start, 1207.0457936, 'zsh: seconds with ten decimals, in ms');
near(zsh.end, 1795269987333.3833, 'zsh: the end in ms since the epoch');
const bash = parseRecord('1 1 1795269988952907 1795269988952986\n/home/ethan\n\n');
eq([bash.exit, bash.cmd], [1, ''], 'bash: no command line');
near(bash.end - bash.start, 0.079, 'bash: microseconds');
near(parseRecord('1 0 1795269986,5 1795269987,0\n/\nx\n').end - parseRecord('1 0 1795269986,5 1795269987,0\n/\nx\n').start, 500, 'a comma for the decimal point');
eq(parseRecord('1 130 1795269986.0 1795269999.0\n/\nfor f in *; do\n  echo $f\ndone\n').cmd, 'for f in *; do echo $f done', 'several lines: one');
eq(parseRecord('1 130 1795269986.0 1795269999.0\n/\nmake\n').exit, 130, 'Ctrl+C: 130');
eq([parseRecord('2 0 1 2\n/\nx'), parseRecord('1 x 1 2\n/\nx'), parseRecord('1 0 5.0 4.0\n/\nx'), parseRecord('1 0 a b\n/\nx'), parseRecord(''), parseRecord(null)],
    [null, null, null, null, null, null], 'another version, a bad exit, an end before the start, not times, empty, none: nothing');

// --- which record is the notification's ----------------------------------------------------------------
const rec = (cmd, end, exit = 0) => ({exit, start: end - 5000, end, dir: '/', cmd});
const NOW = 1795270000000;
const records = [rec('cargo build --release', NOW - 300), rec('pnpm verify', NOW - 800, 1), rec('ls', NOW - 60000), null];
eq(matchRecord(records, 'cargo build --release', NOW).cmd, 'cargo build --release', 'the same command line');
eq(matchRecord(records, 'node /usr/bin/pnpm verify', NOW).cmd, 'pnpm verify', 'Ptyxis reads the process: its last words match the typed line');
eq(matchRecord([rec('sleep 2.2; false', NOW - 100)], 'sleep 2.2', NOW)?.cmd, 'sleep 2.2; false', 'Ptyxis caught a part of a compound line');
eq(matchRecord([rec('make && make install', NOW - 100)], '/usr/bin/make install', NOW)?.cmd, 'make && make install', '&& apart, a path to the program');
eq(matchRecord([rec('git push', NOW - 100)], 'git pull', NOW), null, 'the same program, other words: not it');
eq(matchRecord(records, 'something else', NOW), null, 'none alike: none (another shell\'s command, not this one)');
eq(matchRecord([...records, rec('', NOW - 1000), rec('', NOW - 2000)], 'make', NOW).end, NOW - 1000, 'bash writes no command: the newest of those');
eq(matchRecord([rec('ls', NOW - MATCH_WINDOW - 1)], 'ls', NOW), null, 'ended too long ago: none');
eq(matchRecord([rec('ls', NOW + 5000)], 'ls', NOW), null, 'ends after the notification: not it');
eq(matchRecord([rec('', NOW - 100)], '', NOW).end, NOW - 100, 'no command either side: the newest');
eq([matchRecord([], 'x', NOW), matchRecord(null, 'x', NOW)], [null, null], 'no records');

// --- times and the directory ------------------------------------------------------------------------------
eq([0, 400, 1000, 48 * 1000, 59.6 * 1000, 123 * 1000, 3910 * 1000, NaN].map(shortTime),
    ['<1 s', '<1 s', '1 s', '48 s', '1:00', '2:03', '1:05:10', '<1 s'], 'the pill\'s times');
eq([400, 48 * 1000, 120 * 1000, 123 * 1000, 3600 * 1000, 3910 * 1000].map(longTime),
    ['<1 s', '48 s', '2 min', '2 min 3 s', '1 h', '1 h 5 min'], 'the card\'s times');
eq([dirText('/home/ethan/works/buoy', '/home/ethan'), dirText('/home/ethan', '/home/ethan'), dirText('/home/ethanx', '/home/ethan'),
    dirText('/tmp', '/home/ethan'), dirText('', '/home/ethan'), dirText(null, '/home/ethan')],
['~/works/buoy', '~', '/home/ethanx', '/tmp', '', ''], '~ for home, only home');

// --- prefs: the line to add ---------------------------------------------------------------------------------
eq(hookLine('/home/ethan/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/shell.sh', '/home/ethan'),
    'source ~/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/shell.sh', 'under home: ~');
eq(hookLine('/opt/my ext/buoy@murilegus/hooks/shell.sh', '/home/ethan'), 'source \'/opt/my ext/buoy@murilegus/hooks/shell.sh\'', 'a space: quoted');
eq(hookLine('/opt/it\'s/hooks/shell.sh', '/home/ethan'), 'source \'/opt/it\'\\\'\'s/hooks/shell.sh\'', 'a quote in it: escaped');
eq([hookAdded('export X=1\nsource ~/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/shell.sh\n'),
    hookAdded('  . "$HOME/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/shell.sh"'),
    hookAdded('# source ~/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/shell.sh'),
    hookAdded('source ~/other/hooks/shell.sh'), hookAdded(null)],
[true, true, false, false, false], 'the rc sources it: not commented out, Buoy\'s');

// --- the adapter --------------------------------------------------------------------------------------------
class Icon {}       // a Gio.Icon
const logo = new Icon();
const did = [];
const ev = o => ({
    id: 'ptyxis', cmd: 'cargo build --release', exit: 0, duration: 48 * 1000, dir: '~/works/song-ngoai-khoi',
    appName: 'Ptyxis', appIcon: logo, more: 0, at: 1000, shared: false,
    activate: () => did.push('go'), dismiss: () => did.push('dismiss'), ...o,
});
const done = adapter.terminal(ev());
eq([done.text, done.leading, done.trailing, done.ttl, done.pressFirst],
    ['cargo build --release', logo, {icon: 'object-select-symbolic', label: '48 s'}, 0, true], 'pill: the command, ✓ 48 s; it stays; a click goes to the tab');
eq([done.compact.card.title, done.compact.card.app, done.compact.card.close, done.compact.card.at, done.compact.card.tight],
    ['cargo build --release', 'exit 0 · 48 s · ~/works/song-ngoai-khoi', DISMISS, 1000, true], 'card: "exit 0 · 48 s · ~/…", ×');
eq(done.actions, [{id: GO, label: 'Go to Tab', icon: 'go-jump-symbolic'}], 'Go to Tab');
done.onPress();
done.onAction(GO);
done.onAction(DISMISS);
done.onAction('x');
eq(did, ['go', 'go', 'dismiss'], 'a click and Go to Tab show the tab; × dismisses');

const failed = adapter.terminal(ev({cmd: 'pnpm verify', exit: 1, duration: 123 * 1000, dir: '~/works/buoy'}));
eq([failed.trailing, failed.compact.card.app], [{icon: 'window-close-symbolic', label: '2:03'}, 'exit 1 · 2 min 3 s · ~/works/buoy'],
    'failed: ✕ 2:03, "exit 1 · 2 min 3 s" (no red: design/colours)');
const more = adapter.terminal(ev({more: 1}));
eq(more.trailing, {icon: 'object-select-symbolic', label: '48 s', more: 1}, 'another tab done too: "+1" before ✓');

const plain = adapter.terminal(ev({exit: null, duration: null, dir: '', cmd: 'rsync -a ảnh/ nas:/backup'}));
eq([plain.trailing, plain.compact.card.app], [null, 'Ptyxis'], 'no hook: no ✓/✕ nor time; the card says Ptyxis');
eq(adapter.terminal(ev({exit: null, duration: null, more: 2})).trailing, {text: '+2'}, 'no hook, others done: "+2"');
eq(adapter.terminal(ev({duration: null})).trailing, {icon: 'object-select-symbolic', label: 'exit 0'}, 'an exit with no time: the exit');
eq(adapter.terminal(ev({exit: -1})).trailing, null, 'a bad exit: none');

const shared = adapter.terminal(ev({shared: true}));
eq([shared.text, shared.compact.card.title, shared.compact.card.app], ['Command finished', 'Command finished', 'exit 0 · 48 s'],
    'screen shared: no command, no directory');
const bare = adapter.terminal(ev({cmd: '  ', appIcon: null, appName: ''}));
eq([bare.text, bare.leading], ['Command finished', 'utilities-terminal-symbolic'], 'no command: "Command finished"; no logo: a generic one');
eq(adapter.terminal(ev({cmd: 'x '.repeat(200)})).text.length, 399, 'a long command is not cut here');

// --- through the kit ---------------------------------------------------------------------------------------
const a = validate({...done, id: 'terminal:ptyxis', kind: 'terminal', source: 'terminal'});
eq(tierOf(a), 2, 'not "needs you": no red light');
eq(planMinimal(a).trailing, {type: 'icon', icon: 'object-select-symbolic', label: '48 s'}, 'minimal: the icon and its time');
eq(planCompact(a)?.card?.title, 'cargo build --release', 'compact is a card');
eq(element({icon: 'window-close-symbolic', label: '2:03', more: 1}), {type: 'icon', icon: 'window-close-symbolic', label: '2:03', more: 1},
    'an icon with a text and "+k"');
eq(element({icon: 'object-select-symbolic', label: '', more: 0}), {type: 'icon', icon: 'object-select-symbolic'}, 'empty text, no more: the icon alone');

print('terminal: ok');

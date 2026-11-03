// Run: gjs -m tests/registry.test.js   (slugs, profiles, adapter resolution; no Shell)
import GLib from 'gi://GLib';

import {Registry, slugOf, parseProfile, loadProfiles} from '../src/buoy@murilegus/lib/kit/registry.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

function throws(fn, pattern, msg) {
    try {
        fn();
    } catch (e) {
        if (!pattern.test(e.message))
            throw new Error(`${msg}: threw "${e.message}", expected ${pattern}`);
        return;
    }
    throw new Error(`${msg}: did not throw`);
}

// --- slugs: one per app across every source (ARCHITECTURE rule 5) --------------------
const SAME = {
    spotify: ['org.mpris.MediaPlayer2.spotify', 'spotify', 'Spotify', 'com.spotify.Client',
        'com.spotify.Client.desktop', 'spotify_spotify', 'spotify.desktop'],
    firefox: ['org.mpris.MediaPlayer2.firefox.instance_1_42', 'org.mpris.MediaPlayer2.firefox.instance12345',
        'firefox', 'Firefox', 'org.mozilla.firefox', 'firefox_firefox', 'firefox.desktop'],
    chromium: ['org.mpris.MediaPlayer2.chromium.instance2091', 'chromium', 'chromium-browser',
        'org.chromium.Chromium'],
    chrome: ['google-chrome', 'Google Chrome', 'google-chrome.desktop'],
    telegram: ['org.telegram.desktop', 'Telegram Desktop', 'telegram-desktop', 'telegram-desktop_telegram-desktop'],
    nautilus: ['org.gnome.Nautilus', 'org.gnome.Nautilus.desktop', 'Files', 'nautilus'],
    vlc: ['org.mpris.MediaPlayer2.vlc', 'vlc', 'org.videolan.VLC'],
    mpv: ['org.mpris.MediaPlayer2.mpv', 'mpv', 'io.mpv.Mpv'],
    discord: ['com.discordapp.Discord', 'discord', 'Discord'],
    slack: ['com.slack.Slack', 'slack', 'Slack'],
    transmission: ['com.transmissionbt.Transmission', 'transmission-gtk', 'Transmission'],
};
for (const [slug, ids] of Object.entries(SAME)) {
    for (const id of ids)
        eq(slugOf(id), slug, `slugOf(${id})`);
}
eq(slugOf('org.gnome.Ptyxis'), 'ptyxis', 'reverse-DNS id without a table entry → last part');
eq(slugOf('io.github.SomeDev.CoolApp.desktop'), 'coolapp', 'any depth of reverse-DNS');
eq(slugOf('org.mpris.MediaPlayer2.Lollypop'), 'lollypop', 'MPRIS name without a table entry');
eq(slugOf('Some Notes App'), 'some-notes-app', 'notification app name: lower case, spaces → -');
eq(slugOf('zalo'), 'zalo', 'plain name');
eq(slugOf('libreoffice-writer'), 'libreoffice-writer', 'dashes kept');
eq(slugOf(''), 'system', 'empty → system (activity.js default app)');
eq(slugOf(undefined), 'system', 'missing → system');
eq(slugOf(null), 'system', 'null → system');
eq(slugOf('   '), 'system', 'blank → system');
eq(slugOf(42), 'system', 'not a string → system');
eq(slugOf(slugOf('com.spotify.Client')), 'spotify', 'a slug maps to itself');

// --- profiles: data only (ARCHITECTURE rule 7) -------------------------------------
eq(parseProfile({}), {}, 'empty profile');
eq(parseProfile({icon: 'x-symbolic', title: '{artist}', hideBody: true, priority: 40, ttl: 5000}),
    {icon: 'x-symbolic', title: '{artist}', hideBody: true, priority: 40, ttl: 5000}, 'every scalar key');
const rp = parseProfile({replace: [{field: 'title', pattern: '\\s*\\(Official Video\\)', with: ''}]});
eq(rp.replace.length, 1, 'replace rule kept');
eq(rp.replace[0].re instanceof RegExp, true, 'replace pattern compiled once, at load');
eq(parseProfile({skip: {field: 'title', pattern: '^Advertisement$'}}).skip.field, 'title', 'skip rule');
throws(() => parseProfile([]), /object/, 'an array is not a profile');
throws(() => parseProfile(null), /object/, 'null is not a profile');
throws(() => parseProfile({colour: 'red'}), /unknown key "colour"/, 'unknown keys are reported');
throws(() => parseProfile({icon: 3}), /icon/, 'icon must be a string');
throws(() => parseProfile({icon: ' '}), /icon/, 'icon must not be blank');
throws(() => parseProfile({title: 1}), /title/, 'title must be a string');
throws(() => parseProfile({hideBody: 'yes'}), /hideBody/, 'hideBody must be a boolean');
throws(() => parseProfile({priority: 'high'}), /priority/, 'priority must be a number');
throws(() => parseProfile({priority: 101}), /priority/, 'priority 0–100');
throws(() => parseProfile({priority: -1}), /priority/, 'priority not negative');
throws(() => parseProfile({ttl: -5}), /ttl/, 'ttl not negative');
throws(() => parseProfile({ttl: 'long'}), /ttl/, 'ttl must be a number');
throws(() => parseProfile({replace: {field: 'title'}}), /replace/, 'replace must be a list');
throws(() => parseProfile({replace: [{field: 'title', pattern: '(', with: ''}]}), /replace\[0\]/, 'bad regex is reported with its place');
throws(() => parseProfile({replace: [{pattern: 'a', with: ''}]}), /field/, 'replace needs a field');
throws(() => parseProfile({replace: [{field: 'title', pattern: 'a'}]}), /with/, 'replace needs "with"');
throws(() => parseProfile({skip: {field: 'title'}}), /pattern/, 'skip needs a pattern');
throws(() => parseProfile({skip: {field: 'title', pattern: '[', flags: 'i'}}), /skip/, 'bad skip regex');
throws(() => parseProfile({replace: [{field: 'title', pattern: 'a', with: '', flags: 'gx'}]}), /flags/, 'only i, m, s flags');

// --- resolution: profile → apps/<slug>.js → adapter.js ------------------------------
const calls = [];
const base = {
    media(ev, profile) {
        calls.push(['base', profile]);
        return {
            text: `${ev.title} · ${ev.artist}`, attributes: {length: ev.length},
            leading: {art: ev.art, icon: 'audio-x-generic-symbolic'},
            expanded: {center: {title: ev.title, subtitle: ev.body ?? null}},
        };
    },
    other() {
        return {text: 'other'};
    },
};
const spotify = {
    media(ev, profile) {
        calls.push(['spotify', profile]);
        return {...base.media(ev, profile), text: 'from spotify'};
    },
};
const track = {id: 't1', title: 'Song', artist: 'Band', art: '/a.png', body: 'lyrics', length: 30};

let r = new Registry();
eq(r.build('media', 'spotify', track), null, 'nothing registered: null');
r.register('media', base, {spotify});
r.register('other', base);
let a = r.build('media', 'org.mpris.MediaPlayer2.spotify', track);
eq([a.id, a.kind, a.app, a.text], ['media:spotify:t1', 'media', 'spotify', 'from spotify'],
    'an app override wins over the default; id from kind, slug and event id');
eq(r.build('media', 'org.mpris.MediaPlayer2.vlc', track).text, 'Song · Band', 'no override: the default adapter');
eq(r.build('media', 'vlc', {...track, id: undefined}).id, 'media:vlc:', 'event without id');
eq(r.build('nope', 'vlc', track), null, 'unregistered kind: null');
eq(r.build('other', 'vlc', track).text, 'other', 'each kind has its own adapter');
eq(r.build('media', 'vlc', track).priority, 10, 'validate() fills defaults (PRIORITY.media)');

const nullAdapter = {media: () => null};
r.register('media', nullAdapter);
eq(r.build('media', 'vlc', track), null, 'an adapter returning null surfaces nothing');
r.register('media', {});
eq(r.build('media', 'vlc', track), null, 'an adapter without the kind: null');
r.register('media', base, {spotify});
r.unregister('media');
eq(r.build('media', 'spotify', track), null, 'unregister removes the kind');

// apps-plain: the default adapter even when an override exists
r = new Registry();
r.register('media', base, {spotify});
r.setPlain(['spotify']);
eq(r.build('media', 'com.spotify.Client', track).text, 'Song · Band', 'apps-plain uses the default adapter');
r.setPlain(['Spotify']);
eq(r.build('media', 'spotify', track).text, 'Song · Band', 'apps-plain entries are slugged too');
r.setPlain([]);
eq(r.build('media', 'spotify', track).text, 'from spotify', 'apps-plain cleared: override again');

// profiles applied by the registry, for every adapter
r = new Registry();
r.register('media', base, {spotify});
r.register('other', base);
r.setProfiles(new Map([['vlc', parseProfile({
    icon: 'vlc-symbolic', title: '{artist} — {title} ({missing})', priority: 55, ttl: 5000,
})]]));
calls.length = 0;
a = r.build('media', 'org.videolan.VLC', track);
eq(a.text, 'Band — Song ()', 'title template over event fields; unknown fields are empty');
eq(a.leading, {icon: 'vlc-symbolic'}, 'profile icon replaces the leading element');
eq([a.priority, a.ttl], [55, 5000], 'profile priority and ttl');
eq(calls[0][1]?.title, '{artist} — {title} ({missing})', 'the adapter still sees the profile');
eq(r.build('other', 'vlc', track).text, 'Band — Song ()', 'profiles apply to every kind of the app');
eq(r.build('media', 'mpv', track).text, 'Song · Band', 'a profile is per app');

r.setProfiles(new Map([['vlc', parseProfile({ttl: 9 * 3600 * 1000})]]));
eq(r.build('media', 'vlc', track).ttl, 8 * 3600 * 1000, 'profile ttl is still capped at 8 h by validate()');
r.setProfiles(new Map([['vlc', parseProfile({priority: 0})]]));
eq(r.build('media', 'vlc', track).priority, 0, 'priority 0 is a value, not "unset"');

r.setProfiles(new Map([['vlc', parseProfile({hideBody: true})]]));
calls.length = 0;
a = r.build('media', 'vlc', track);
eq(a.expanded.center.subtitle, null, 'hideBody: the adapter never sees the body');
eq(track.body, 'lyrics', 'the source event is not mutated');

r.setProfiles(new Map([['vlc', parseProfile({
    replace: [
        {field: 'title', pattern: '\\s*\\(official video\\)', with: '', flags: 'i'},
        {field: 'artist', pattern: '^(.*)$', with: 'by $1'},
        {field: 'length', pattern: '3', with: 'x'},
    ],
})]]));
a = r.build('media', 'vlc', {...track, title: 'Song (Official Video)'});
eq(a.text, 'Song · by Band', 'replace rules run in order on string fields, $1 works, case-insensitive flag');
eq(a.attributes.length, 30, 'non-string fields are left alone by replace');

r.setProfiles(new Map([['vlc', parseProfile({skip: {field: 'title', pattern: '^advert', flags: 'i'}})]]));
eq(r.build('media', 'vlc', {...track, title: 'Advertisement'}), null, 'skip: matching events surface nothing');
eq(r.build('media', 'vlc', track).text, 'Song · Band', 'skip leaves other events');
eq(r.build('media', 'vlc', {...track, title: undefined}).app, 'vlc', 'skip on a missing field does not match');

r.setProfiles(new Map([['vlc', parseProfile({title: 'T: {title}'})]]));
r.setPlain(['vlc']);
eq(r.build('media', 'vlc', track).text, 'T: Song', 'apps-plain does not turn off the user profile');

// --- present(): callers that send their own pill (D-Bus) ---------------------------
r = new Registry();
eq(r.present({app: 'com.example.Deploy', text: 'x'}), {app: 'deploy', text: 'x'}, 'no profile: only the app is slugged');
eq(r.present({text: 'x'}).app, 'system', 'no app: system');
r.setProfiles(new Map([['deploy', parseProfile({
    title: '{branch} deployed', icon: 'emblem-ok-symbolic', priority: 70, ttl: 3000,
    hideBody: true, replace: [{field: 'branch', pattern: '^refs/heads/', with: ''}],
    skip: {field: 'branch', pattern: '^wip/'},
})]]));
const sent = {
    app: 'Deploy', text: 'theirs', leading: 'x-symbolic', priority: 5,
    attributes: {branch: 'refs/heads/main', body: 'log…'},
};
a = r.present(sent);
eq([a.app, a.text, a.leading, a.priority, a.ttl], ['deploy', 'main deployed', {icon: 'emblem-ok-symbolic'}, 70, 3000],
    'the profile goes on top of what the caller sent, title from the attributes after replace');
eq(a.attributes, {branch: 'main'}, 'hideBody and replace work on the attributes');
eq(sent.attributes.branch, 'refs/heads/main', 'the caller\'s data is not mutated');
eq(r.present({app: 'deploy', attributes: {branch: 'wip/try'}}), null, 'skip on an attribute');
eq(r.present({app: 'deploy', text: 'no attrs'}).text, ' deployed', 'no attributes: the template fields are empty');

// --- loading ~/.config/buoy/apps/*.json -------------------------------------------------
const dir = GLib.dir_make_tmp('buoy-profiles-XXXXXX');
const write = (name, text) => GLib.file_set_contents(`${dir}/${name}`, text);
write('vlc.json', '{"title": "{title}!", "priority": 50}');
write('Spotify.json', '{"icon": "x-symbolic"}');
write('broken.json', '{"title": ');
write('bad.json', '{"colour": "red"}');
write('notes.txt', 'not a profile');
let {profiles, errors} = loadProfiles(dir);
eq([...profiles.keys()].sort(), ['spotify', 'vlc'], 'every valid *.json, keyed by the slug of its name');
eq(profiles.get('vlc'), {title: '{title}!', priority: 50}, 'parsed profile');
eq(errors.map(e => e.file).sort(), ['bad.json', 'broken.json'], 'bad files are skipped and reported');
eq(errors.find(e => e.file === 'bad.json').message.includes('colour'), true, 'with the reason');
({profiles, errors} = loadProfiles(`${dir}/missing`));
eq([profiles.size, errors.length], [0, 0], 'a missing directory is no profiles, no error');
for (const name of ['vlc.json', 'Spotify.json', 'broken.json', 'bad.json', 'notes.txt'])
    GLib.unlink(`${dir}/${name}`);
GLib.rmdir(dir);

// --- docs/examples/apps: every example loads and does what docs/PROFILES.md says ----------
const ROOT = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
({profiles, errors} = loadProfiles(`${ROOT}/docs/examples/apps`));
eq(errors, [], 'every example profile is valid (README.md is not a profile)');
eq([...profiles.keys()].sort(), ['firefox', 'spotify', 'telegram', 'vlc'], 'the examples, by slug');
r = new Registry();
r.register('media', base);
r.register('notification', {notification: ev => ({text: ev.title, expanded: {center: {title: ev.title, subtitle: ev.body ?? null}}})});
r.setProfiles(profiles);
const song = {id: 'e', title: 'Monument Valley', artist: 'Lumen Coast'};
a = r.build('media', 'com.spotify.Client', song);
eq([a.text, a.priority], ['Lumen Coast — Monument Valley', 15], 'spotify example: artist first, above other players');
eq(r.build('media', 'firefox', {...song, title: 'Monument Valley (Official Music Video) - YouTube'}).text,
    'Monument Valley · Lumen Coast', 'firefox example: YouTube suffix and video tags removed');
eq(r.build('media', 'firefox', {...song, title: 'Monument Valley [Lyrics]'}).text, 'Monument Valley · Lumen Coast',
    'firefox example: [Lyrics] too');
a = r.build('media', 'org.videolan.VLC', song);
eq([a.leading, a.ttl], [{icon: 'video-x-generic-symbolic'}, 600000], 'vlc example: icon and 10 min ttl');
eq(r.build('media', 'vlc', {...song, title: 'sample-clip.mp4'}), null, 'vlc example: sample files skipped');
a = r.build('notification', 'Telegram Desktop', {id: 'm', title: 'Lan', body: 'see you at 8'});
eq([a.expanded.center.subtitle, a.priority], [null, 65], 'telegram example: body hidden, below other notifications');

print('registry: ok');

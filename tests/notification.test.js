// Run: gjs -m tests/notification.test.js   (no Shell needed; adapters are pure)
import adapter, {
    TTL, MAX_OWN_ACTIONS, DISMISS, plainText, buttonsOf, actionIndex, shownElsewhere, sharedLine,
} from '../src/buoy@murilegus/lib/modules/notification/adapter.js';
import {planMinimal, planCompact} from '../src/buoy@murilegus/lib/kit/presentation.js';
import {validate, tierOf} from '../src/buoy@murilegus/lib/kit/activity.js';
import {Registry} from '../src/buoy@murilegus/lib/kit/registry.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const BASE = {
    id: 'n1', title: 'Lan', body: 'Lunch at 12?', markup: false, appName: 'Telegram',
    appIcon: 'org.telegram.desktop', icon: null, image: null, count: 1, critical: false,
    shared: false, actions: [],
};
const build = ev => adapter.notification({...BASE, ...ev});

// --- text: markup out, one line, never cut ------------------------------------------------
eq(plainText('  Hello\n\tworld  '), 'Hello world', 'whitespace collapsed to one line');
eq(plainText('<b>Bold</b> &amp; <a href="x">link</a>', true), 'Bold & link', 'markup: tags dropped, entities decoded');
eq(plainText('a &lt;b&gt; &quot;c&quot; &apos;d&apos; &#65;&#x42;', true), 'a <b> "c" \'d\' AB', 'every entity form');
eq(plainText('&bogus; &#0; &#xFFFFFFF;', true), '&bogus; &#0; &#xFFFFFFF;', 'unknown or out-of-range entities kept');
eq(plainText('<b>kept</b> &amp;'), '<b>kept</b> &amp;', 'plain text: nothing parsed (a body that is not markup)');
eq([plainText(null), plainText(undefined), plainText(42)], ['', '', ''], 'not a string: empty');
eq(plainText('x'.repeat(3000)).length, 3000, 'long text kept whole (the renderer ellipsizes)');

// --- buttons: two of the notification's own, then × ----------------------------------------
eq(MAX_OWN_ACTIONS, 2, 'two own actions');
eq(buttonsOf([]), [{id: DISMISS, icon: 'window-close-symbolic'}], 'no actions: × alone');
eq(buttonsOf(['Reply', 'Mark as Read']).map(b => b.id), ['a0', 'a1', DISMISS], 'two actions, then ×');
eq(buttonsOf(['Reply', 'Mark as Read', 'Delete']).map(b => b.label ?? b.icon),
    ['Reply', 'Mark as Read', 'window-close-symbolic'], 'three sent: the first two, then ×');
eq(buttonsOf(['', 'Open']).map(b => b.id), ['a1', DISMISS], 'an empty label skipped, the index kept');
eq(buttonsOf(null).length, 1, 'no list: × alone');
eq([actionIndex('a0'), actionIndex('a12'), actionIndex(DISMISS), actionIndex('ax'), actionIndex(null)],
    [0, 12, null, null, null], 'button id → action index');

// --- the pill (§2) ------------------------------------------------------------------------
{
    const p = build({});
    eq([p.text, p.leading, p.trailing], ['Lan', 'org.telegram.desktop', null], 'title, the app\'s icon, no count');
    eq([p.ttl, p.needsYou, p.pressFirst, p.minimalAction], [TTL, false, true, false],
        '6 s, running tier, click activates, no button in minimal');
    eq(TTL, 6000, 'TTL is 6 s');
    const m = planMinimal(validate({id: 'x', kind: 'notification', ...p}), {light: 'off'});
    eq(m.text, 'Lan', 'minimal plan: the title');
    eq(m.action, null, 'minimal plan: no button');
    const a = validate({id: 'x', kind: 'notification', ...p, isStale: false});
    eq([a.priority, tierOf(a)], [70, 2], 'the kind\'s 70, running tier');
}
eq(build({title: ''}).text, 'Lunch at 12?', 'no title: the body');
eq(build({title: '', body: ''}).text, 'Telegram', 'neither: the app\'s name');
eq(build({title: '', body: '', appName: ''}).text, 'Notification', 'nothing at all: a word, never empty');
eq(build({count: 3}).trailing, {text: '3'}, 'from 2 on: the count');
eq([build({count: 0}).trailing, build({count: 'x'}).trailing], [null, null], 'a bad count: none');
eq(build({appIcon: null}).leading, 'preferences-system-notifications-symbolic', 'no app icon: the generic one');

// --- critical needs you (§2) --------------------------------------------------------------
{
    const p = build({critical: true});
    eq([p.ttl, p.needsYou], [0, true], 'critical: no ttl, needs you');
    eq(tierOf(validate({id: 'x', kind: 'notification', ...p})), 1, 'critical: tier 1');
}

// --- the compact (§3) ---------------------------------------------------------------------
{
    const p = build({actions: ['Reply', 'Mark as Read'], icon: 'mail-unread-symbolic'});
    const c = planCompact(validate({id: 'x', kind: 'notification', ...p}), {light: 'off'});
    eq([c.text, c.subtitle], ['Lan', 'Lunch at 12?'], 'compact: title over the body');
    eq(c.actions.map(x => x.id), ['a0', 'a1', DISMISS], 'compact: own actions then ×');
    eq(p.compact.leading, 'mail-unread-symbolic', 'the notification\'s own icon');
}
eq(build({}).compact.leading, 'org.telegram.desktop', 'no own icon: the app\'s');
{
    const image = {fake: 'Gio.FileIcon'};
    eq(build({image, icon: 'avatar-default-symbolic'}).compact.leading, {art: image, icon: 'avatar-default-symbolic'},
        'a picture: as art, its icon behind');
    eq(build({image}).leading, 'org.telegram.desktop', 'the minimal pill keeps the app\'s icon');
}
eq(build({body: '<b>Hi</b>\nthere', markup: true}).compact.subtitle, 'Hi there', 'markup body on one line');
eq([build({body: ''}).compact.text, build({body: ''}).compact.subtitle], ['Lan', 'Telegram'],
    'no body: the app\'s name under the title');
eq([build({title: ''}).compact.text, build({title: ''}).compact.subtitle], ['Lunch at 12?', 'Telegram'],
    'no title: the body, the app under it');
eq(build({title: '', body: ''}).compact.subtitle, null, 'neither: the app alone');

// --- profiles: hideBody (the registry drops `body`) ----------------------------------------
{
    const r = new Registry();
    r.register('notification', adapter);
    r.setProfiles(new Map([['telegram', {hideBody: true}]]));
    const a = r.build('notification', 'telegram', {...BASE});
    eq([a.text, a.compact.subtitle], ['Lan', 'Telegram'], 'hideBody: the title, the app\'s name instead of the body');
    eq(a.attributes.body, '', 'hideBody: no body in the attributes either');
    eq(a.onPress, null, 'no callbacks given: none');
}

// --- a shared screen (§5) -----------------------------------------------------------------
{
    const image = {fake: 'Gio.FileIcon'};
    const p = build({shared: true, image, icon: 'mail-unread-symbolic', actions: ['Reply']});
    eq(p.text, 'Telegram', 'shared: the app\'s name, not the title');
    eq([p.compact.text, p.compact.subtitle], ['Telegram', 'New notification'], 'shared compact: the app, a neutral line');
    eq(p.compact.leading, 'mail-unread-symbolic', 'shared: no picture');
    eq(p.actions.map(x => x.label ?? x.id), ['Reply', DISMISS], 'shared: the app\'s buttons stay');
    eq([p.attributes.title, p.attributes.body], ['', ''], 'shared: nothing of the message in the attributes');
    eq(build({shared: true, count: 4}).compact.subtitle, '4 notifications', 'shared with a count');
    eq([sharedLine(1), sharedLine(2)], ['New notification', '2 notifications'], 'the shared line');
}

// --- every field, every time (an update merges) --------------------------------------------
{
    const keys = Object.keys(build({})).sort();
    for (const ev of [{critical: true}, {shared: true}, {title: '', body: ''}, {count: 5, image: {}}])
        eq(Object.keys(build(ev)).sort(), keys, `same fields for ${JSON.stringify(ev)}`);
    const p = build({});
    eq(['size', 'width', 'height'].filter(k => k in p || k in p.compact), [], 'no measurements');
}

// --- shown by another module (§10) -------------------------------------------------------
eq(shownElsewhere('org.gnome.Nautilus', 'progress', true), true, 'Files\' operations: the Transfers pill');
eq(shownElsewhere('org.gnome.Nautilus', 'transfer-complete', true), true, 'Files\' done: the Transfers pill');
eq(shownElsewhere('org.gnome.Nautilus', 'progress', false), false, 'progress module off: a notification as any');
eq(shownElsewhere('org.gnome.Nautilus', 'other', true), false, 'Files\' other notifications');
eq(shownElsewhere('firefox', 'progress', true), false, 'another app\'s id "progress"');

print('notification: ok');

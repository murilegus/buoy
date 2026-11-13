// Run: gjs -m tests/notification.test.js   (no Shell needed; adapters are pure)
import adapter, {
    TTL, MAX_OWN_ACTIONS, DISMISS, plainText, buttonsOf, actionIndex, shownElsewhere, agentShows, sharedLine, cardText, stackGroups, countText, rowText,
    HELD_MS, waitedInQueue, Turns, MAX_WAITING, burstHeader, sharedBurst, missedRow,
} from '../src/buoy@murilegus/lib/modules/notification/adapter.js';
import {planMinimal, planCompact} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {validate, tierOf} from '../src/buoy@murilegus/lib/kit/model/activity.js';
import {Registry} from '../src/buoy@murilegus/lib/kit/services/registry.js';

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
eq(MAX_OWN_ACTIONS, 3, 'three own actions');
eq(buttonsOf([]), [], 'no actions: no row (× is the header\'s)');
eq(buttonsOf(['Reply', 'Mark as Read']), [{id: 'a0', label: 'Reply'}, {id: 'a1', label: 'Mark as Read'}], 'two actions');
eq(buttonsOf(['Reply', 'Mark as Read', 'Delete', 'Archive']).map(b => b.label),
    ['Reply', 'Mark as Read', 'Delete'], 'four sent: the first three');
eq(buttonsOf(['', 'Open']).map(b => b.id), ['a1'], 'an empty label skipped, the index kept');
eq(buttonsOf(null), [], 'no list: none');
eq([actionIndex('a0'), actionIndex('a12'), actionIndex(DISMISS), actionIndex('ax'), actionIndex(null)],
    [0, 12, null, null, null], 'button id → action index');

// --- the pill (§2) ------------------------------------------------------------------------
{
    const p = build({});
    eq([p.text, p.leading, p.trailing], ['Lan', 'org.telegram.desktop', null], 'title, the app\'s icon, no count');
    eq([p.ttl, p.needsYou, p.pressFirst, p.minimalAction, p.alertStays], [TTL, false, true, false, false],
        'its card 5 s then the pill 6 s, running tier, click activates, no button in minimal, the card does not stay');
    eq(TTL, 11000, 'TTL: the card\'s 5 s and the pill\'s 6 s (design/alerts-and-asks)');
    eq(p.compact.card.actionsOnHover, true, 'its card\'s buttons only under the pointer, as GNOME 50\'s banner');
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

// --- seen and done: the kit's callbacks reach the source's (design/alerts-and-asks) -------------
{
    let seen = 0, done = 0;
    const p = build({seen: () => seen++, alertDone: () => done++});
    p.onSeen();
    p.onAlertDone(true);
    eq([seen, done], [1, 1], 'onSeen and onAlertDone are the source\'s seen and alertDone');
    eq([build({}).onSeen, build({}).onAlertDone], [null, null], 'none given: none');
}

// --- critical needs you (§2) --------------------------------------------------------------
{
    const p = build({critical: true});
    eq([p.ttl, p.needsYou, p.alertStays, p.compact.card.actionsOnHover], [0, true, true, false],
        'critical: no ttl, needs you, its card stays with its buttons at once');
    eq(tierOf(validate({id: 'x', kind: 'notification', ...p})), 1, 'critical: tier 1');
}

// --- the card (§3) ------------------------------------------------------------------------
{
    const p = build({actions: ['Reply', 'Mark as Read'], icon: 'mail-unread-symbolic', at: 1000});
    const card = p.compact.card;
    eq([card.icon, card.app, card.at, card.close], ['org.telegram.desktop', 'Telegram', 1000, DISMISS],
        'header: the app\'s icon and name, the time, × runs dismiss');
    eq([card.title, card.body], ['Lan', 'Lunch at 12?'], 'the title over the body');
    eq(card.picture, 'mail-unread-symbolic', 'its own icon beside the text');
    const c = planCompact(validate({id: 'x', kind: 'notification', ...p}), {light: 'off'});
    eq(c.card.header, {icon: {type: 'icon', icon: 'org.telegram.desktop'}, text: 'Telegram', at: 1000}, 'plan: the header');
    eq(c.actions.map(x => x.id), ['a0', 'a1'], 'plan: the row of its own actions');
}
{
    const expire = () => 'gone';
    eq([build({expire}).onExpire, build({}).onExpire], [expire, null], 'expire → onExpire (what the banner\'s hide does)');
}
eq(build({}).compact.card.picture, null, 'no picture and no own icon: none (the app\'s is in the header)');
{
    const image = {fake: 'Gio.FileIcon'};
    eq(build({image, icon: 'avatar-default-symbolic'}).compact.card.picture, {art: image, icon: 'avatar-default-symbolic'},
        'a picture: as art, its icon behind');
    eq(build({image}).compact.card.picture, {art: image, icon: 'org.telegram.desktop'}, 'a picture without its own icon: the app\'s behind');
    eq(build({image}).leading, 'org.telegram.desktop', 'the minimal pill keeps the app\'s icon');
}
eq(build({at: NaN}).compact.card.at, null, 'no time: none');
eq(build({body: '<b>Hi</b>\nthere', markup: true}).compact.card.body, 'Hi there', 'markup body, whitespace collapsed');
eq(build({body: ''}).compact.card.body, null, 'no body: the title alone');
eq([build({title: ''}).compact.card.title, build({title: ''}).compact.card.body], ['Lunch at 12?', null],
    'no title: the body takes its place');
eq(build({title: '', body: ''}).compact.card.title, 'Telegram', 'neither: the app\'s name');
eq([cardText('T', 'B', 'A'), cardText('', 'B', 'A'), cardText('', '', 'A')],
    [{title: 'T', body: 'B'}, {title: 'B', body: null}, {title: 'A', body: null}], 'cardText');
eq(build({body: 'y'.repeat(2000)}).compact.card.body.length, 2000, 'a long body kept whole (the card ends it with …)');

// --- profiles: hideBody (the registry drops `body`) ----------------------------------------
{
    const r = new Registry();
    r.register('notification', adapter);
    r.setProfiles(new Map([['telegram', {hideBody: true}]]));
    const a = r.build('notification', 'telegram', {...BASE});
    eq([a.text, a.compact.card.title, a.compact.card.body], ['Lan', 'Lan', null], 'hideBody: the title alone');
    eq(a.attributes.body, '', 'hideBody: no body in the attributes either');
    eq(a.onPress, null, 'no callbacks given: none');
}

// --- a shared screen (§5) -----------------------------------------------------------------
{
    const image = {fake: 'Gio.FileIcon'};
    const p = build({shared: true, image, icon: 'mail-unread-symbolic', actions: ['Reply']});
    eq(p.text, 'Telegram', 'shared: the app\'s name, not the title');
    eq([p.compact.card.app, p.compact.card.title, p.compact.card.body], ['Telegram', 'New notification', null],
        'shared card: the header, a neutral title, no body');
    eq(p.compact.card.picture, 'mail-unread-symbolic', 'shared: its own icon, no picture');
    eq([p.actions.map(x => x.label), p.compact.card.close], [['Reply'], DISMISS], 'shared: the app\'s buttons and × stay');
    eq([p.attributes.title, p.attributes.body], ['', ''], 'shared: nothing of the message in the attributes');
    eq(build({shared: true, count: 4}).compact.card.title, '4 notifications', 'shared with a count');
    eq([sharedLine(1), sharedLine(2)], ['New notification', '2 notifications'], 'the shared line');
}

// --- every field, every time (an update merges) --------------------------------------------
{
    const keys = Object.keys(build({})).sort();
    for (const ev of [{critical: true}, {shared: true}, {title: '', body: ''}, {count: 5, image: {}}])
        eq(Object.keys(build(ev)).sort(), keys, `same fields for ${JSON.stringify(ev)}`);
    const p = build({});
    eq(['size', 'width', 'height'].filter(k => k in p || k in p.compact.card), [], 'no measurements');
}

// --- shown by another module (§10) -------------------------------------------------------
eq(shownElsewhere('org.gnome.Nautilus', 'progress', true), true, 'Files\' operations: the Transfers pill');
eq(shownElsewhere('org.gnome.Nautilus', 'transfer-complete', true), true, 'Files\' done: the Transfers pill');
eq(shownElsewhere('org.gnome.Nautilus', 'progress', false), false, 'progress module off: a notification as any');
eq(shownElsewhere('org.gnome.Nautilus', 'other', true), false, 'Files\' other notifications');
eq(shownElsewhere('firefox', 'progress', true), false, 'another app\'s id "progress"');

// --- held in GNOME's queue (§1): shown, but still missed --------------------------------
eq(HELD_MS, 2000, 'two seconds in the queue is waiting');
eq(waitedInQueue(1000, 1000), false, 'taken in the call that queued it: not held');
eq(waitedInQueue(1000, 2999), false, 'just under: not held');
eq(waitedInQueue(1000, 3000), true, 'two seconds: held');
eq(waitedInQueue(1000, 600000), true, 'a film later: held');
eq([waitedInQueue(undefined, 5000), waitedInQueue(null, 5000), waitedInQueue(NaN, 5000)], [false, false, false],
    'never stamped (queued before Buoy enabled): not held, seen as before');
eq(waitedInQueue(5000, NaN), false, 'no clock: not held');

// --- the tab's stacks (§6) --------------------------------------------------------------
{
    const it = (app, at, missed = false) => ({app, appName: app.toUpperCase(), at, missed});
    const {groups, missed, total} = stackGroups([
        it('mail', 10), it('chat', 30), it('mail', 50, true), it('chat', 20), it('power', 40, true), it('mail', 25),
    ]);
    eq(groups.map(g => g.app), ['mail', 'power', 'chat'], 'apps by their newest notification');
    eq(groups.map(g => g.items.map(i => i.at)), [[50, 25, 10], [40], [30, 20]], 'newest first inside: the face first');
    eq(groups.map(g => g.missed), [1, 1, 0], 'unseen per stack');
    eq([missed, total], [2, 6], 'unseen and total');
    eq(groups[0].appName, 'MAIL', 'a stack keeps the app\'s name');
    eq(stackGroups([]), {groups: [], missed: 0, total: 0}, 'nothing: empty');
    eq(stackGroups([it('a', 5), it('a', 5)]).groups[0].items.length, 2, 'same time: both kept');
}
eq([countText(1), countText(5), countText(0)], ['1 notification', '5 notifications', '0 notifications'], 'countText');
eq(rowText({title: 'Lan', body: '<b>Hi</b>', markup: true, appName: 'Telegram'}), {title: 'Lan', body: 'Hi'}, 'row: title over body');
eq(rowText({title: '', body: 'Hi', appName: 'Telegram'}), {title: 'Hi', body: null}, 'row: the body as title');
eq(rowText({title: 'Lan', body: 'Hi', appName: 'Telegram'}, true), {title: 'Telegram', body: 'New notification'},
    'row on a shared screen: the app, nothing of the message');

// --- a burst: turns (design/alerts-and-asks "Nhiều thông báo cùng lúc") ----------------------
{
    eq(MAX_WAITING, 2, 'two turns wait besides the card up (GNOME\'s queue of 3)');
    eq([burstHeader('Slack', 4), burstHeader('Slack', 1), burstHeader('Slack', undefined)],
        ['Slack · 4 messages', 'Slack', 'Slack'], 'the card says how many from 2');
    eq(build({burst: 4}).compact.card.app, 'Slack · 4 messages'.replace('Slack', 'Telegram'), 'the card\'s header with the count');
    eq([build({alertKey: 3}).alertKey, build({}).alertKey, build({alertKey: 'x'}).alertKey], [3, null, null],
        'alertKey: the turn\'s, else null');
    const st = () => 'state';
    eq([build({alertState: st}).onAlertState, build({}).onAlertState], [st, null], 'alertState → onAlertState');
}
{
    // the design's example: Slack ×4, Zalo, Gmail → Slack "4" 1 s → Zalo 1 s → Gmail 5 s
    const t = new Turns();
    const a = t.arrive('slack', 's1');
    eq([a.start?.app, a.start?.count, a.missed], ['slack', 1, []], 'the first: its card at once');
    const k1 = a.start.key;
    for (const s of ['s2', 's3', 's4']) {
        const o = t.arrive('slack', s);
        eq([o.start, o.show?.item], [null, s], `${s}: joins the card up, which shows it`);
    }
    eq([t.current.count, t.current.key], [4, k1], 'one turn, four notifications, the same card');
    eq(t.arrive('zalo', 'z1').start, null, 'another app: it waits');
    eq(t.arrive('gmail', 'g1').start, null, 'another: waits too');
    eq(t.waiting.map(x => x.app), ['zalo', 'gmail'], 'in the order they came');
    eq(t.step(), null, 'the card up has not had its 1 s: nothing moves');
    eq(t.state(k1, {mayYield: true, hovered: false}), true, 'its 1 s over, the pointer off: the next may begin');
    const z = t.step();
    eq([z.app, t.current.app, t.waiting.length], ['zalo', 'zalo', 1], 'Zalo\'s turn');
    eq(t.end(k1), false, 'Slack\'s card closing late does not end Zalo\'s');
    t.state(z.key, {mayYield: true, hovered: false});
    const g = t.step();
    eq([g.app, t.waiting.length], ['gmail', 0], 'Gmail\'s turn, the last');
    eq(t.state(g.key, {mayYield: true, hovered: false}), false, 'the last: nothing waits, it runs its 5 s');
    eq(t.end(g.key), true, 'its card closed: done');
    eq([t.current, t.step()], [null, null], 'nothing up, nothing waits');
}
{
    // the same app, not in a row: a turn of its own, to keep the order
    const t = new Turns();
    t.arrive('slack', 's1');
    t.arrive('zalo', 'z1');
    const o = t.arrive('slack', 's2');
    eq([o.show, t.waiting.map(x => x.app)], [null, ['zalo', 'slack']], 'Slack after Zalo: its own turn');
    const o2 = t.arrive('slack', 's3');
    eq([o2.missed, t.waiting.at(-1).item, t.waiting.at(-1).count], [['s2'], 's3', 2],
        'joins the last waiting turn of its app; the one it replaced never shows: missed');
    eq(t.current.count, 1, 'the card up is not touched');
}
{
    // at most two wait; more get no card
    const t = new Turns();
    t.arrive('a', 'a1');
    t.arrive('b', 'b1');
    t.arrive('c', 'c1');
    const o = t.arrive('d', 'd1');
    eq([o.start, o.missed, o.dropped.map(x => x.app)], [null, ['d1'], ['d']], 'a third waiting: no card, missed');
    eq(t.waiting.map(x => x.app), ['b', 'c'], 'the two waiting stay');
    eq(t.busy('d'), false, 'its app has no turn: its pill shows it quietly');
    eq([t.busy('a'), t.busy('c')], [true, true], 'up or waiting: busy');
}
{
    // critical first; never in a normal turn
    const t = new Turns();
    t.arrive('a', 'a1');
    t.arrive('b', 'b1');
    t.arrive('c', 'c1');
    const o = t.arrive('a', 'x1', true);
    eq([t.waiting.map(x => x.item), o.dropped.map(x => x.item)], [['x1', 'b1'], ['c1']],
        'a critical one goes first; the last waiting drops');
    eq(t.waiting[0].critical, true, 'marked critical');
    t.arrive('a', 'x2', true);
    eq([t.waiting[0].item, t.waiting[0].count], ['x2', 2], 'the next critical of its app joins it');
    const c = new Turns();
    c.arrive('a', 'a1');
    const o2 = c.arrive('a', 'a2', true);
    eq([o2.show, c.waiting.length], [null, 1], 'a critical one never joins a normal card up');
}
{
    // under the pointer: the card's notification stays, the count grows
    const t = new Turns();
    const k = t.arrive('slack', 's1').start.key;
    t.state(k, {mayYield: false, hovered: true});
    const o = t.arrive('slack', 's2');
    eq([o.show?.item, o.show?.count, o.missed], ['s1', 2, ['s2']], 'hovered: s1 stays, "2 messages", s2 missed');
    t.arrive('zalo', 'z1');
    eq(t.step(), null, 'hovered: the burst waits');
    eq(t.state(k, {mayYield: true, hovered: false}), true, 'off it (and its grace): the next may begin');
}
{
    // an update of the one up; a waiting one gone; the card closing early; clear
    const t = new Turns();
    const k = t.arrive('a', 'a1').start.key;
    eq(t.arrive('a', 'a1').show?.item, 'a1', 'the same notification again: the card up updates');
    t.arrive('b', 'b1');
    t.arrive('c', 'c1');
    eq([t.gone('b1'), t.gone('zz')], [true, false], 'a waiting notification gone: its turn goes');
    eq(t.end(k), true, 'the card closed (×, a click, away)');
    eq(t.step()?.app, 'c', 'the next begins: nothing is up');
    eq([t.end(null), t.end(undefined), t.state(99, {mayYield: true})], [false, false, false], 'unknown keys: nothing');
    t.arrive('d', 'd1');
    eq(t.clear(), ['c1', 'd1'], 'clear: every item up or waiting');
    eq([t.current, t.waiting], [null, []], 'and nothing left');
}
{
    // nothing up but some waiting (the card just closed, step() not yet run): the new one waits
    const t = new Turns();
    const k = t.arrive('a', 'a1').start.key;
    t.arrive('b', 'b1');
    t.end(k);
    eq([t.arrive('c', 'c1').start, t.waiting.map(x => x.app)], [null, ['b', 'c']], 'it queues behind, in order');
}

// --- a burst on a shared screen: one compact (design/alerts-and-asks) ------------------------
{
    let closed = 0;
    const p = sharedBurst({
        apps: [{name: 'Slack', icon: 'slack', count: 3}, {name: 'Telegram', icon: 'tg', count: 2},
            {name: 'Gmail', icon: 'gmail', count: 1}, {name: 'Zalo', icon: 'zalo', count: 1}], at: 5, close: () => closed++,
    });
    const card = p.compact.card;
    eq([card.title, card.app, card.body], ['7 new notifications', 'Slack 3 · Telegram 2 · Gmail 1 · Zalo 1', null],
        'how many, from each app in the order they came; no body');
    eq([card.icon, card.close, card.at], [null, DISMISS, 5], 'no badge, ×, the newest\'s time');
    eq(p.actions, [], 'no button');
    eq(p.onPress(), true, 'a click opens nothing');
    p.onAction('a0');
    p.onAction(DISMISS);
    eq(closed, 1, '× closes; nothing else does');
    const c = planCompact(validate({id: 'x', kind: 'notification', ...p}), {light: 'off'});
    eq(c.card.picture, {type: 'stack', icons: [{type: 'icon', icon: 'slack'}, {type: 'icon', icon: 'tg'}, {type: 'icon', icon: 'gmail'}]},
        'the picture: the first three apps\' logos stacked');
    eq(sharedBurst({apps: [{name: 'Slack', icon: 'slack', count: 1}]}).compact.card.title, 'New notification', 'one: "New notification"');
    eq([sharedBurst({apps: []}), sharedBurst({apps: [{name: 'x', count: 0}]}), sharedBurst({})], [null, null, null], 'none: no pill');
    eq(sharedBurst({apps: [{name: '', count: 2}]}).compact.card.app, 'Notification 2', 'a nameless app: a word');
}

// --- Home's Missed row (design/home) ---------------------------------------------------------
eq(missedRow(3, ['Slack', 'Zalo', 'Slack']), {count: 3, title: 'Notifications', detail: 'Slack, Zalo', tab: 'notification', icons: []},
    'one row: the count, the apps once each, the Notifications tab');
eq(missedRow(5, ['A', 'B', 'C', 'D', 'E']).detail, 'A, B, C +2', 'more than three apps: +N');
eq([missedRow(0, []).detail, missedRow(NaN, null).count, missedRow(2.7, ['<b>x</b>']).count], [null, 0, 2], 'no app, a bad count');
eq(missedRow(4, [{name: 'Slack', icon: 'slack'}, {name: 'Zalo', icon: '/opt/zalo.png'}, {name: 'Slack', icon: 'slack'}, {name: 'Mail', icon: null}]),
    {count: 4, title: 'Notifications', detail: 'Slack, Zalo, Mail', tab: 'notification', icons: ['slack', '/opt/zalo.png']},
    'apps with icons: each once, in order; an app without one has no icon');
eq(missedRow(1, ['Slack']).icons, [], 'names only: no icons');
eq(missedRow(2, [{name: '', icon: 'x'}, {name: 'A', icon: '  '}]).icons, [], 'no name, or a blank icon: none');

// --- Claude's own notification for a session the agent shows (2026-11-13) ------------------
{
    const session = {kind: 'agent', attributes: {name: 'Buoy — Implementation'}};
    eq(agentShows('com.anthropic.Claude', 'Buoy — Implementation', session), true, 'Claude Desktop, the session on the island: no pill of its own');
    eq(agentShows('claude-desktop', ' Buoy — Implementation ', session), true, 'any app id that says Claude; spaces ignored');
    eq(agentShows('com.anthropic.Claude', 'Another session', session), false, 'a session not on the island: a notification');
    eq(agentShows('com.anthropic.Claude', 'Buoy — Implementation', null), false, 'no agent on the island (the module off): a notification');
    eq(agentShows('org.gnome.Nautilus', 'Buoy — Implementation', session), false, 'another app with that title: a notification');
    eq(agentShows('Claude', '', {attributes: {name: ''}}), false, 'no title, no name: never a match');
}

print('notification: ok');

// Run: gjs -m tests/home.test.js   (pure: Home's plan, design/home)
import {
    planHome, tilesPerRow, tileWidths, tileOf, greetingLine, TILE_H, CARD_GAP, TALL_FROM, cornerIcons, CORNER_ICONS, cornerMax,
} from '../src/buoy@murilegus/lib/kit/model/home.js';
import {validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';
import {batteryTile, STATE} from '../src/buoy@murilegus/lib/modules/home/adapter.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const act = (id, extra = {}) => validate({id, kind: 'timer', text: id, ...extra});
const NAME = {activity: t => t.activity.id, glance: t => t.id};
const shape = p => p.tiles.map(t => `${(NAME[t.type] ?? (x => `${x.type}${x.count ?? ''}`))(t)}${t.units > 1 ? '×2' : ''}`);
const GLANCES = [{id: 'weather', wide: true}, {id: 'calendar', wide: true}, {id: 'battery'}];

// --- N, and the main card's height at each screen (design/home "Kích thước") -------------
// the row: expanded less 12 each side; the body: expanded less the head 56 and the 12 under it
const SCREENS = [[1920, 560, 280, 4, 104, 'low'], [2560, 716, 344, 5, 168, 'tall'], [3440, 760, 376, 5, 200, 'tall']];
for (const [at, w, h, n, mainH, form] of SCREENS) {
    const p = planHome({list: [act('m')], glances: GLANCES, width: w - 24, height: h - 56 - 12});
    eq([tilesPerRow(w - 24), p.n], [n, n], `@${at}: N = floor((w + 8) / 128)`);
    eq([p.mainH, p.form], [mainH, form], `@${at}: the main card takes what the row leaves`);
}
eq([TILE_H, CARD_GAP, TALL_FROM], [100, 8, 160], 'the tokens');
eq([tilesPerRow(0), tilesPerRow(119), tilesPerRow(120), tilesPerRow(247), tilesPerRow(248)], [1, 1, 1, 1, 2],
    'at least one tile; 120 + 8 + 120 for two');

// --- the main card ------------------------------------------------------------------------
{
    const p = planHome({list: [], glances: [], width: 536, height: 212});
    eq([p.main, p.tiles, p.mainH, p.form], [null, [], 212, 'tall'], 'nothing at all: the greeting, the whole height');
    const q = planHome({list: [act('a'), act('b')], width: 536, height: 212});
    eq([q.main.id, shape(q)], ['a', ['b']], 'the first activity is the card, the rest tiles');
    eq(planHome({list: 'x', width: 536, height: 212}).main, null, 'no list: the greeting');
}

// --- the design's four states (images/states) ----------------------------------------------
eq(shape(planHome({list: [act('media'), act('claude')], glances: GLANCES, width: 536, height: 212})),
    ['claude', 'weather', 'calendar', 'battery'], 'A: music on the card; Claude, then the glances');
eq(shape(planHome({list: [], glances: GLANCES, width: 536, height: 212})),
    ['weather×2', 'calendar', 'battery'], 'C: nothing running: the weather widens into the spare unit');
eq(shape(planHome({list: [act('media'), act('claude'), act('dl'), act('t1'), act('t2')], missed: 7, glances: GLANCES, width: 536, height: 212})),
    ['missed7', 'claude', 'dl', 'more2'], 'D: Missed first; more than N: N − 1 and +K; no glance');
eq(shape(planHome({list: [act('media'), act('claude')], glances: GLANCES, width: 692, height: 276})),
    ['claude', 'weather×2', 'calendar', 'battery'], '2560: N = 5, the weather wide');

// --- the fill rules, edge by edge ------------------------------------------------------------
{
    const four = [act('m'), act('a'), act('b'), act('c'), act('d')];
    eq(shape(planHome({list: four, glances: GLANCES, width: 536, height: 212})), ['a', 'b', 'c', 'd'],
        'exactly N activities: no +K, no glance');
    eq(shape(planHome({list: [...four, act('e')], width: 536, height: 212})), ['a', 'b', 'c', 'more2'],
        'N + 1: N − 1 tiles and +2 (the last two)');
    eq(shape(planHome({list: [act('m')], missed: 0, glances: [{id: 'weather', wide: true}, {id: 'calendar', wide: true}], width: 536, height: 212})),
        ['weather×2', 'calendar×2'], 'two units spare: the weather, then Up next widen');
    const p = planHome({list: [act('m')], glances: [{id: 'battery'}], width: 536, height: 212});
    eq([shape(p), p.units], [['battery'], 1], 'nothing to widen: the tiles fill the row (tileWidths)');
    eq(shape(planHome({list: [act('m')], missed: 2, width: 536, height: 212})), ['missed2'], 'Missed alone');
    eq(shape(planHome({list: [act('m')], missed: -1, glances: [], width: 536, height: 212})), [], 'a bad missed count: none');
    eq(planHome({list: [act('m')], width: 536, height: 212}).mainH, 212, 'no tile: the card takes the whole height');
}

// --- widths: the row is always full ------------------------------------------------------------
eq(tileWidths([{units: 1}, {units: 1}, {units: 1}, {units: 1}], 536), [128, 128, 128, 128], '1920: four of 128');
eq(tileWidths([{units: 2}, {units: 1}, {units: 1}], 536), [264, 128, 128], 'a wide tile: two units and their gap, on the grid');
eq(tileWidths([{units: 2}, {units: 1}, {units: 1}, {units: 1}], 692), [272, 132, 132, 132], '2560: five units of 132');
eq(tileWidths([{units: 1}, {units: 1}, {units: 1}], 537), [173, 173, 175], 'rounding goes into the last');
eq(tileWidths([{units: 1}], 536), [536], 'one tile fills the row');
eq(tileWidths([], 536), [], 'no tile');

// --- an activity as a tile ----------------------------------------------------------------------
eq(tileOf(validate({id: 'c', kind: 'agent', leading: 'x', text: 'Claude Code', trailing: {text: '2 / 3'}})),
    {leading: {type: 'icon', icon: 'x'}, value: {type: 'text', text: '2 / 3'}, caption: 'Claude Code'},
    'a text trailing is the value, the text the caption');
eq(tileOf(validate({id: 'd', kind: 'progress', leading: 'x', text: 'report.pdf', trailing: {progress: 0.42}})).value,
    {type: 'text', text: '42%'}, 'a ring: its percentage');
eq(tileOf(validate({id: 't', kind: 'timer', text: 'Pasta', trailing: {until: 5000}})).value,
    {type: 'until', at: 5000}, 'a live time stays live');
eq(tileOf(validate({id: 'n', kind: 'timer', text: 'Copied'})), {leading: null, value: {type: 'text', text: 'Copied'}, caption: null},
    'no trailing: the text is the value');
eq(tileOf(validate({id: 'm', kind: 'media', text: 'Song', trailing: 'eq', tile: {value: '1:24', caption: 'Song'}})).value,
    {type: 'text', text: '1:24'}, 'an adapter\'s own tile wins');
eq(tileOf(validate({id: 'e', kind: 'timer', tile: {value: ''}})).value, null, 'an empty own value: the usual rules, nothing to show');
{
    const live = {position: 84000, length: 215000, at: 1, playing: true};
    eq(tileOf(validate({id: 'p', kind: 'media', text: 'Song · Artist', trailing: 'eq', tile: {live, caption: 'Song'}})),
        {leading: null, value: {type: 'live', live}, caption: 'Song'}, 'a player: its live position, the title under it');
    eq(tileOf(validate({id: 'p', kind: 'media', text: 'Song', tile: {live: {position: 1, length: 0}}})).value,
        {type: 'text', text: 'Song'}, 'no length: not live');
}

// --- the greeting -------------------------------------------------------------------------------
eq(greetingLine('afternoon', 'Ethan Nguyen'), 'Good afternoon, Ethan', 'the first name');
eq([greetingLine('dawn', 'A'), greetingLine('noon', 'A'), greetingLine('night', 'A')],
    ['Good morning, A', 'Good afternoon, A', 'Good evening, A'], 'the dayparts');
eq([greetingLine('afternoon', ''), greetingLine('afternoon', 'Unknown'), greetingLine('x', null)],
    ['Good afternoon', 'Good afternoon', 'Good day'], 'no name (GLib says Unknown), no daypart');

// --- the battery glance (modules/home) ----------------------------------------------------------
eq(batteryTile({present: true, percentage: 82.4, state: STATE.DISCHARGING}), {icon: 'battery-full-symbolic', value: '82%', caption: 'Battery'},
    'battery: the percentage, full from 80');
eq(batteryTile({present: true, percentage: 45, state: STATE.CHARGING}), {icon: 'battery-good-charging-symbolic', value: '45%', caption: 'Charging'},
    'charging: its icon and word');
eq([batteryTile({present: true, percentage: 19, state: STATE.DISCHARGING}).icon, batteryTile({present: true, percentage: 50, state: STATE.DISCHARGING}).icon,
    batteryTile({present: true, percentage: 60, state: STATE.FULLY_CHARGED}).icon], ['battery-low-symbolic', 'battery-good-symbolic', 'battery-full-symbolic'],
'low under 20, good, fully charged as full');
eq([batteryTile({present: false, percentage: 80, state: 2}), batteryTile({present: true, percentage: NaN, state: 2})], [null, null],
    'no battery (a desktop), no percentage: no tile');
eq(batteryTile({present: true, percentage: 140, state: 2}).value, '100%', 'clamped to 100');


// --- the main card fits its rows (#216, 2026-11-13) ------------------------------------
{
    const {rowsThatFit, planCompact} = await import('../src/buoy@murilegus/lib/kit/model/presentation.js');
    const {compactMetrics} = await import('../src/buoy@murilegus/lib/kit/model/shapes.js');
    const m = compactMetrics();
    const rows3 = planCompact({id: 'a', kind: 'agent', text: 'x', compact: {text: 'Buoy', rows: [{text: '1'}, {text: '2'}, {text: '3'}]}});
    const check = (h, want, msg) => {
        if (rowsThatFit(rows3, h, m) !== want)
            throw new Error(`${msg}: expected ${want}, got ${rowsThatFit(rows3, h, m)}`);
    };
    check(120, 3, '56 + 8 + 3 × 16 + 8 = 120: all three');
    check(104, 2, '104 (1920, low, a row of tiles under it): two');
    check(119, 2, 'a px short of three: two');
    check(88, 1, '88: one');
    check(80, 0, 'no room for a row: the head alone');
    check(0, 0, 'no height: none, never negative');
    check(400, 3, 'room to spare: never more than it has');
    // more rows than the compact's 3 where there is room (2026-11-13, Ethan: 2560 stood half empty)
    const tenRows = Array.from({length: 10}, (_, i) => ({text: `t${i}`, rank: i === 6 ? 0 : i + 1}));
    const ten = {id: 'c', kind: 'agent', text: 'x', compact: {text: 'Buoy', rows: tenRows}};
    const many = planCompact(ten);
    if (many.rows.length !== 3 || many.rowsAvailable !== 10)
        throw new Error('the compact draws 3 of its 10');
    if (rowsThatFit(many, 200, m) !== 8)
        throw new Error('200 (2560, tall): 8 rows, (200 − 72) / 16');
    const eight = planCompact(ten, {maxRows: 8});
    if (eight.rows.map(r => r.text).join() !== 't0,t1,t2,t3,t4,t5,t6,t7')
        throw new Error(`eight: the lowest ranks, in order (got ${eight.rows.map(r => r.text)})`);
    const thirty = Array.from({length: 30}, (_, i) => ({text: `${i}`}));
    if (rowsThatFit(planCompact({id: 'd', kind: 'x', text: 'y', compact: {text: 'y', rows: thirty}}), 2000, m) !== 16)
        throw new Error('at most 16 rows kept');
    if (rowsThatFit(planCompact({id: 'b', kind: 'x', text: 'y', compact: {text: 'y'}}), 400, m) !== 0)
        throw new Error('no rows: zero');
    if (rowsThatFit(null, 400, m) !== 0)
        throw new Error('no plan: zero');
}


// --- the Missed tile's corner: its apps' icons, then +N (design/home, 2026-11-13) ----------
eq(CORNER_ICONS, 3, 'three icons fit a 128 tile beside the bell');
eq(cornerIcons(['slack']), {icons: ['slack'], more: 0}, 'one app: its icon');
eq(cornerIcons(['a', 'b', 'a', 'c']), {icons: ['a', 'b', 'c'], more: 0}, 'each app once, first place kept');
eq(cornerIcons(['a', 'b', 'c', 'd', 'e']), {icons: ['a', 'b', 'c'], more: 2}, 'five apps: three icons, +2');
eq([cornerIcons([]), cornerIcons(null), cornerIcons(['', 3, null])], [{icons: [], more: 0}, {icons: [], more: 0}, {icons: [], more: 0}], 'nothing: no corner');
eq(cornerIcons(['a', 'b', 'c'], 2), {icons: ['a', 'b'], more: 1}, 'a smaller max');
eq([cornerMax(128), cornerMax(173), cornerMax(264), cornerMax(536)], [2, 3, 3, 3], 'a 128 tile: two and +N; wider: three');
eq([cornerMax(0), cornerMax(NaN), cornerMax(80)], [1, 1, 1], 'too narrow: still one');

print('home: ok');

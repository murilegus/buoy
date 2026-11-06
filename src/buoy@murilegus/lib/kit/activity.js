/**
 * Activity contract (docs/APPLE.md §B1). validate() fills defaults and throws
 * on shape errors so a bad adapter fails loudly at the registry, not in the renderer.
 */
export const KINDS = ['media', 'notification', 'progress', 'osd', 'input', 'power', 'device',
    'timer', 'ask', 'agent', 'attention', 'copied', 'phone', 'calendar', 'privacy', 'call'];

export const PRIORITY = {
    media: 10, timer: 20, calendar: 25, progress: 30, device: 35, agent: 35, power: 40,
    copied: 45, attention: 50, osd: 60, input: 60, notification: 70, phone: 75, ask: 90, call: 95,
};

/** Feedback for your own action (SPEC §2e): minimal only, pill 1 for its ttl, never missed. */
export const FEEDBACK = new Set(['osd', 'input', 'copied']);

const EIGHT_HOURS = 8 * 60 * 60 * 1000;

/**
 * @param {object} a  activity as built by an adapter (needs `id` and `kind`)
 * @returns {object} the activity with contract defaults filled in, ttl capped at 8 h
 */
export function validate(a) {
    if (!a?.id || !a.kind)
        throw new Error('activity needs id and kind');
    return {
        app: 'system',
        attributes: {},
        state: {},
        priority: PRIORITY[a.kind] ?? 0,
        staleAfter: 0,
        style: 'standard',
        alert: false,
        keyline: null,
        actions: [],
        sizeHint: 'normal',
        ...a,
        ttl: Math.min(a.ttl ?? 0, EIGHT_HOURS) || 0,
    };
}

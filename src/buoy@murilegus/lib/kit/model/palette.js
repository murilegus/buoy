/**
 * Buoy's palette by role (design/colours, 2026-11-10/11): what every colour inside the island
 * is for, by name. St reads no CSS variables (st-theme-node.c has no var()) and Buoy has no
 * build step, so the stylesheets write the values with the role in a comment, and
 * tests/palette.test.js checks every colour in them against ROLES. Pure: no St, no Main.
 */

const white = a => `rgba(255, 255, 255, ${a})`;

/** Role → value, as the stylesheets write it. */
export const ROLES = Object.freeze({
    'surface': '#000',
    'surface-menu': '#1f1f1f',        // white 12 % mixed on black: a menu covers what is under it
    'border': white(0.12),
    'border-strong': white(0.28),
    'fg': '#fff',
    'fg-muted': white(0.7),
    'fg-subtle': white(0.5),
    'fg-disabled': white(0.28),
    'fill-0': white(0.04),
    'fill-1': white(0.08),
    'fill-2': white(0.12),
    'fill-3': white(0.2),
    'fill-4': white(0.28),
    'fill-inverse': '#f1efe8',        // Bu's body cream
    'fill-inverse-hover': '#fff',
    'fg-on-inverse': '#000',
    'light-off': white(0.2),
    'light-missed': '#ff9f0a',
    'light-waiting': '#ff453a',
    'dot-mic': '#bf5af2',
    'dot-cam': '#30d158',
    'dot-screen': '#ff453a',
    'missed-tint': 'rgba(255, 159, 10, 0.16)',
});

/** GNOME's own, as written: the accent (never Buoy's own colour) and its focus ring. */
export const GNOME = Object.freeze([
    'transparent', '-st-accent-color', '-st-accent-fg-color',
    'st-transparentize(-st-accent-color, 0.2)',  // focus-ring: the accent at 80 %
]);

/**
 * GNOME's high contrast (org.gnome.desktop.a11y.interface high-contrast): these roles take
 * these values, the rest stay (design/colours "Tương phản cao").
 */
export const HIGH_CONTRAST = Object.freeze({
    'border': white(0.5),
    'border-strong': white(0.7),
    'fg-subtle': white(0.7),
    'fg-disabled': white(0.5),
});

/**
 * The state colours (INDICATORS.md): the lights and the dots only, never a keyline.
 *
 * @type {readonly string[]}
 */
export const STATE_COLOURS = Object.freeze([
    ROLES['light-missed'], ROLES['light-waiting'], ROLES['dot-mic'], ROLES['dot-cam'],
]);

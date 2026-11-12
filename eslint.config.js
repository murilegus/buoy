// Mirrors gnome-shell (gnome-50) tools/eslint.config.js: same eslint-config-gnome
// commit, same rule overrides. Keep the two in step when bumping Shell.
import {defineConfig} from '@eslint/config-helpers';
import gnome from 'eslint-config-gnome';

export default defineConfig([
    gnome.configs.recommended,
    gnome.configs.jsdoc,
    {
        rules: {
            camelcase: ['error', {
                properties: 'never',
            }],
            'consistent-return': 'error',
            'eqeqeq': ['error', 'smart'],
            'key-spacing': ['error', {
                mode: 'minimum',
                beforeColon: false,
                afterColon: true,
            }],
            // Shell's options, plus the parentheses of a JSDoc cast, `/** @type {T} */ (x)`,
            // which is how `pnpm check` (tsc) is told a type
            'no-extra-parens': ['error', 'all', {
                conditionalAssign: false,
                nestedBinaryExpressions: false,
                returnAssign: false,
                allowParensAfterCommentPattern: '@type',
            }],
            'prefer-arrow-callback': 'error',
            'prefer-const': ['error', {
                destructuring: 'all',
            }],
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-jsdoc': ['error', {
                exemptEmptyFunctions: true,
                publicOnly: {
                    esm: true,
                },
            }],
        },
    }, {
        files: ['src/**'],
        languageOptions: {
            globals: {
                global: 'readonly',
                _: 'readonly',
                C_: 'readonly',
                N_: 'readonly',
                ngettext: 'readonly',
            },
        },
    }, {
        files: ['tests/**'],
        rules: {
            'jsdoc/require-jsdoc': 'off',
        },
    },
    // Who imports what (ARCHITECTURE rules 1 and 2, the kit's layers; 2026-11-12). A later
    // block replaces an earlier one's options for the files both match, so each block
    // lists every rule its files keep. tests/boundaries.sh checks these.
    ...boundaries(),
]);

function boundaries() {
    // case-sensitive: prefs may import org/gnome/Shell/Extensions, not org/gnome/shell
    const rule = patterns => ({
        'no-restricted-imports': ['error', {patterns: patterns.map(p => ({...p, caseSensitive: true}))}],
    });
    const noModule = {
        regex: '/modules/',
        message: 'the kit never imports a module (ARCHITECTURE rule 1)',
    };
    const pure = (own, model) => ({
        regex: `^(?!${own}|${model}).*`,
        message: 'pure: only its own module\'s files and kit/model/ (ARCHITECTURE rule 2)',
    });
    const M = 'src/buoy@murilegus/lib/modules';
    return [{
        files: ['src/buoy@murilegus/lib/kit/*.js'],
        rules: rule([noModule, {regex: '^\\./(services|ui)/', message: 'only model/ here'}]),
    }, {
        files: ['src/buoy@murilegus/lib/kit/model/**'],
        rules: rule([{
            regex: '^(?!\\./[a-z]+\\.js$|gi://GLib$).*',
            message: 'kit/model/ is pure: model/ and GLib only (ARCHITECTURE "Layout")',
        }]),
    }, {
        files: ['src/buoy@murilegus/lib/kit/services/**'],
        rules: rule([noModule, {
            regex: '^\\.\\./ui/|^gi://(St|Clutter)$',
            message: 'kit/services/ makes no actors: no ui/, St or Clutter (ARCHITECTURE "Layout")',
        }]),
    }, {
        files: ['src/buoy@murilegus/lib/kit/ui/**'],
        rules: rule([noModule]),
    }, {
        files: [`${M}/*/*.js`],
        rules: rule([{
            regex: '^\\.\\./(?!\\.\\./kit/)',
            message: 'a module imports kit/ only, never another module (ARCHITECTURE rule 1)',
        }]),
    }, {
        files: [`${M}/*/adapter.js`, `${M}/*/idle.js`, `${M}/*/hooks.js`],
        rules: rule([pure('\\./[a-z]+\\.js$', '\\.\\./\\.\\./kit/model/[a-z]+\\.js$')]),
    }, {
        files: [`${M}/*/apps/*.js`],
        rules: rule([pure('\\.\\./[a-z]+\\.js$', '\\.\\./\\.\\./\\.\\./kit/model/[a-z]+\\.js$')]),
    }, {
        files: ['src/buoy@murilegus/prefs.js'],
        rules: rule([{
            regex: '/kit/ui/|^gi://(St|Clutter|Meta|Shell|Mtk|Cogl)$|^resource:///org/gnome/shell/|/modules/[a-z]+/(index|source|tab|home|feed|events)\\.js$',
            message: 'prefs runs outside the Shell: nothing that needs it (ARCHITECTURE rule 9)',
        }]),
    }];
}

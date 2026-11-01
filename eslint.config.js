import { defineConfig } from "@eslint/config-helpers";
import gnome from 'eslint-config-gnome';

export default defineConfig([
    gnome.configs.recommended,
    gnome.configs.jsdoc,
    {
        files: ['src/**/*.js', 'tests/**/*.js'],
        languageOptions: {
            globals: {
                global: 'readonly',
                _: 'readonly',
                C_: 'readonly',
                N_: 'readonly',
                ngettext: 'readonly',
            },
        },
        rules: {
            // same overrides GNOME Shell itself uses
            'camelcase': ['error', {properties: 'never'}],
            'consistent-return': 'error',
            'eqeqeq': ['error', 'smart'],
            'prefer-arrow-callback': 'error',
            'prefer-const': ['error', {destructuring: 'all'}],
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-jsdoc': ['error', {
                exemptEmptyFunctions: true,
                publicOnly: {esm: true},
            }],
        }
    }, 
    {
        files: ['tests/**/*.js'],
        rules: {'jsdoc/require-jsdoc': 'off'},
    },
])

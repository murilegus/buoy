# Working on Buoy

Notes for building and changing Buoy. To install and use it, see the [README](README.md).

Buoy is a pure GNOME Shell 50 extension (GJS): no daemon, no binaries, nothing bundled.
Start with `docs/ARCHITECTURE.md` (layout and the rules every change keeps),
`docs/SPEC.md` (what Buoy is and is not) and `docs/FEATURES.md` (the roadmap, M0–M5).

```
buoy/
├── package.json / jsconfig.json / eslint.config.js   pnpm, types, lint — nothing is bundled
├── install.sh  install / update / remove without EGO (curl … | bash, --help)
├── scripts/  link.sh · dev.sh · pack.sh · verify.sh · release-check.sh
├── .github/workflows/release.yml   a tag v<version-name> publishes the zip on GitHub
├── tests/    gjs unit tests (*.test.js), run by tests/run.sh
├── .githooks/pre-commit · .github/workflows/ci.yml   both run `pnpm verify`
├── docs/
│   ├── SPEC.md           what Buoy is and is not; v0.1 decisions
│   ├── ARCHITECTURE.md   module/feature layout, rules, settings model
│   ├── FEATURES.md       roadmap M0–M5 with status + scores
│   ├── INDICATORS.md     buoy light + privacy dot: colours, meanings, positions
│   ├── APPLE.md          ActivityKit + HIG research → BuoyKit contract
│   ├── MASCOT.md         Bu, the mascot: grids, poses, motion (previews in mascot/)
│   └── releases/         the notes of each release, used as the GitHub release body
└── src/buoy@murilegus/   the extension — see docs/ARCHITECTURE.md for the tree
```

Data flow: `module/source` → `registry.build(kind, app, ev)` → `stack.surface()` → `island`.

## Setup

Needs GNOME Shell 50, `gjs`, pnpm (fetches its own Node, see `devEngines` in
package.json) and, for `pnpm dev`: `sudo apt install mutter-dev-bin inotify-tools`.

```bash
pnpm install     # also enables the pre-commit hook (core.hooksPath = .githooks)
pnpm link        # symlink into GNOME + compile the schema
pnpm dev         # nested shell (mutter devkit) with auto-restart
pnpm lint
pnpm test        # gjs unit tests for adapters and the contract — no Shell needed
pnpm verify      # lint + test + schema: what the pre-commit hook and CI run
pnpm run pack    # zip for EGO (`pnpm pack` is pnpm's own tarball command)
```

`pnpm link` puts a symlink to `src/buoy@murilegus` in
`~/.local/share/gnome-shell/extensions/`. `install.sh` refuses to install over that link
(GNOME's tools would delete the checkout's files through it); remove the link first to try
an installed copy.

Fast loop: adapters/stack → `pnpm test` (ms) → module edits → `stateObj.reload('<id>')`
in Looking Glass with `dev-mode` on (no restart) → kit edits → nested shell restart.

Poke it from Looking Glass (`Alt+F2` → `lg`):

```js
s = Main.extensionManager.lookup('buoy@murilegus').stateObj.stack
s.surface({id:'t', kind:'media', app:'demo', text:'Monument Valley · Lumen Coast',
           leading:{icon:'audio-x-generic-symbolic'}, trailing:{icon:'eq'}, expanded:true})
s.end('t')
```

Logs: `journalctl -f -o cat /usr/bin/gnome-shell`.

## Releasing

1. `version-name` in `metadata.json`, the `version` in `package.json` and the newest entry
   in `lib/modules/greeting/notes.js` say the same version (`tests/metadata.test.js`
   checks); its notes are in `docs/releases/<version-name>.md`.
2. Tag `v<version-name>` on `main` and push the tag: `.github/workflows/release.yml` runs
   `pnpm verify`, `scripts/release-check.sh` and the pack, then publishes the zip on GitHub
   Releases with those notes. `install.sh` installs from there.

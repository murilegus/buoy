# Buoy

**A living pill for the GNOME top bar.**

Islands sit still and wait for you to visit. A buoy floats, stays quiet, and lights
up only when something is happening on the water. Buoy turns the centre of your top
bar into exactly that: a small black pill that grows when music plays, a file copies,
a charger connects or a coding agent asks for permission — and shrinks back the
moment it's over. Click it and it opens into a single home panel with what's going
on; no assistant to talk to, no setup. Just a mark on the surface telling you what's
happening underneath.

Pure GNOME Shell extension (GNOME 50, Ubuntu 26.04). No daemon, no binaries.
Inspired by Dynamic Island, Notchy and Islet; see `docs/SPEC.md` for what it is and
is not.

```
buoy/
├── package.json / jsconfig.json / eslint.config.js   pnpm, types, lint — nothing is bundled
├── scripts/  link.sh · dev.sh · pack.sh · verify.sh
├── tests/    gjs unit tests (*.test.js), run by tests/run.sh
├── .githooks/pre-commit · .github/workflows/ci.yml   both run `pnpm verify`
├── docs/
│   ├── SPEC.md           what Buoy is and is not; v0.1 decisions
│   ├── ARCHITECTURE.md   module/feature layout, rules, settings model
│   ├── FEATURES.md       roadmap M0–M5 with status + scores
│   ├── INDICATORS.md     buoy light + privacy dot: colours, meanings, positions
│   └── APPLE.md          ActivityKit + HIG research → BuoyKit contract
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
pnpm test         # gjs unit tests for adapters and the contract — no Shell needed
pnpm verify       # lint + test + schema: what the pre-commit hook and CI run
pnpm run pack    # zip for EGO (`pnpm pack` is pnpm's own tarball command)
```

Fast loop: adapters/stack → `pnpm test` (ms) → module edits → `stateObj.reload('<id>')`
in Looking Glass with `dev-mode` on (no restart) → kit edits → nested shell restart.

Poke it from Looking Glass (`Alt+F2` → `lg`). Until `kit/present.js` lands (M1) the
pill keeps its idle size and shows no text; a click opens an empty expanded panel.

```js
s = Main.extensionManager.lookup('buoy@murilegus').stateObj.stack
s.surface({id:'t', kind:'media', app:'demo', text:'Monument Valley · Lumen Coast',
           leading:{icon:'audio-x-generic-symbolic'}, trailing:{icon:'eq'}, expanded:true})
s.end('t')
```

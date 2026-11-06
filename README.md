<p align="center">
  <img src="docs/mascot/hello.svg" width="120" height="120" alt="Bu, the Buoy mascot, waving hello">
</p>

<h1 align="center">Buoy</h1>

<p align="center"><strong>A living pill for the GNOME top bar.</strong></p>

<p align="center">Say it "BOO-ee" (or "boy", if you're British). The mascot is <strong>Bu</strong>, the first half of the name.</p>

<p align="center">
  <a href="https://github.com/murilegus/buoy/actions/workflows/ci.yml"><img src="https://github.com/murilegus/buoy/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/GNOME_Shell-50-4a86cf?logo=gnome&logoColor=white" alt="GNOME Shell 50">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--2.0-blue" alt="License: GPL-2.0"></a>
  <img src="https://img.shields.io/badge/status-pre--release-orange" alt="Status: pre-release">
</p>

Islands sit still and wait for you to visit. A buoy floats, stays quiet, and lights
up only when something is happening on the water. Buoy turns the centre of your top
bar into exactly that: a small black pill that grows when music plays, a file copies,
a charger connects or a coding agent asks for permission — and shrinks back the
moment it's over. You never open a buoy; there is nothing inside. Glance at it and
you know whether something is up. Come closer, and hover, to read what it is. Click,
and you look at the water under it: a single home panel with what's going on, no
assistant to talk to, no setup. Just a mark on the surface telling you what's
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
│   ├── APPLE.md          ActivityKit + HIG research → BuoyKit contract
│   └── MASCOT.md         Bu, the mascot: grids, poses, motion (previews in mascot/)
└── src/buoy@murilegus/   the extension — see docs/ARCHITECTURE.md for the tree
```

Data flow: `module/source` → `registry.build(kind, app, ev)` → `stack.surface()` → `island`.

## Hardware notes

- **Fn Lock** shows in the pill only where the laptop's kernel driver reports it: today
  Lenovo IdeaPads whose `ideapad-laptop` driver exposes the `platform::fnlock` LED with
  change events (tested on an IdeaPad Slim 3). ThinkPad, Dell, HP, ASUS, Huawei, LG and
  external keyboards keep Fn Lock to themselves. Caps Lock and Num Lock work everywhere.
  Details: `docs/SPEC.md` §2e, "Fn Lock support".

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

Poke it from Looking Glass (`Alt+F2` → `lg`):

```js
s = Main.extensionManager.lookup('buoy@murilegus').stateObj.stack
s.surface({id:'t', kind:'media', app:'demo', text:'Monument Valley · Lumen Coast',
           leading:{icon:'audio-x-generic-symbolic'}, trailing:{icon:'eq'}, expanded:true})
s.end('t')
```

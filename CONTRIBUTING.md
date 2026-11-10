# Working on Buoy

Notes for building and changing Buoy. To install and use it, see the [README](README.md).

## Issues

Search the [open issues](https://github.com/murilegus/buoy/issues) first; an existing one
can take your details as a comment. **New issue** offers two forms, *Bug report* and *Idea*
(`.github/ISSUE_TEMPLATE/`), which ask for what is below.

**A bug** — one issue per problem, with:

- Buoy's version (Settings → About, or `gnome-extensions info buoy@murilegus`), your
  GNOME Shell version (`gnome-shell --version`) and distribution;
- how you installed it (extensions.gnome.org, `install.sh`, a zip, a clone);
- what you did, what you expected and what happened instead — the app involved (the
  player, the browser, Files…) matters for most of the pill;
- Buoy's lines from GNOME Shell's log:
  `journalctl -b -o cat /usr/bin/gnome-shell | grep -i buoy`;
- a screenshot or a short recording when it is about how something looks or moves.

Leave out anything private: notification text, file names, Claude Code prompts.

**A security problem** — not in a public issue: see [SECURITY.md](SECURITY.md). **An
accessibility barrier** — a bug like any other: [ACCESSIBILITY.md](ACCESSIBILITY.md) says
what to include.

**An idea** — say what you want to see or do and why, rather than how to build it. Check
`docs/FEATURES.md` first: it is the roadmap (M0–M5), and many ideas already have a row
there. `docs/SPEC.md` says what Buoy deliberately is not (no assistant, no blur, nothing
moving while idle…).

## Pull requests

Open an issue before a large change, so the approach can be agreed before the code.

- **One change per pull request:** one FEATURES.md item, or one fix. Keep the diff to
  what the change needs; no refactoring of the code around it.
- **A branch from `main`:** `<type>/<milestone>-<short-slug>`, e.g.
  `feat/m3-progress-launcherentry` or `fix/m3-calendar-grid`.
- **Commits:** `<type>(<scope>): <summary>` — types `feat`, `fix`, `docs`, `refactor`,
  `test`, `chore`; the scope is a module id, `kit`, `panel` or `docs`. The body says what
  changed and why in a few lines, and ends with `Refs: FEATURES.md M3 "<item>"` when
  there is one.
- **Keep the rules** in `docs/ARCHITECTURE.md`: adapters and `apps/*.js` stay pure (no
  `St`, `Main`, timers or measurements), modules import `kit/` only, nothing polls while
  the island is closed, nothing animates while idle, no code loaded at runtime. Prefer
  GNOME Shell's own objects to new proxies; when unsure how Shell or Mutter behaves, read
  their `gnome-50` source and say which file and function you relied on.
- **Tests:** pure logic gets `gjs` unit tests in `tests/` — failure paths too, not only the
  happy one. Anything that touches the island, a source or a tab is also run in GNOME Shell
  (`pnpm dev`, or `reload('<id>')` with `dev-mode`): exercise it, then disable and enable
  the extension; no warning or error from `buoy@murilegus` in the log.
- **`pnpm verify` passes.** The pre-commit hook runs it; don't skip it with `--no-verify`.
  CI runs it again on Shell 50's gjs.
- **Docs:** set the item's checkbox in `docs/FEATURES.md` (no notes there: what was done
  goes in the PR); a decision goes into SPEC, ARCHITECTURE or `docs/design`, with its date.

In the pull request (the template asks for these):

- **Link the issue** with `Closes #NN` and give it the milestone of its FEATURES section.
- **What changed** — the whole change, not a list of commits.
- **Tested** — the unit tests added, and the steps run in the Shell with what happened;
  say what could not be tested and why.
- **What to check** — a few steps a reviewer can follow to see it, with a screenshot for
  anything visible.

Pull requests are squashed on merge.

## The code

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
├── .github/dependabot.yml   monthly updates of the actions the workflows pin
├── docs/
│   ├── SPEC.md           what Buoy is and is not; v0.1 decisions
│   ├── ARCHITECTURE.md   module/feature layout, rules, settings model
│   ├── FEATURES.md       roadmap M0–M5 with status
│   ├── INDICATORS.md     buoy light + privacy dot: colours, meanings, positions
│   ├── CONTRACT.md       the activity contract: what sources, adapters and D-Bus give
│   ├── MASCOT.md         Bu, the mascot: grids, poses, motion (previews in mascot/)
│   ├── releases/         the notes of each release, used as the GitHub release body
│   └── screenshots/      the README's images, taken in a headless GNOME Shell
└── src/buoy@murilegus/   the extension — see docs/ARCHITECTURE.md for the tree
```

Data flow: `module/source` → `registry.build(kind, app, ev)` → `stack.surface()` → `island`.

## Setup

Needs GNOME Shell 50, `gjs`, pnpm (fetches its own Node, see `devEngines` in
package.json) and, for `pnpm dev`: `sudo apt install mutter-dev-bin inotify-tools`.

eslint-config-gnome is pinned to Shell 50's commit (with eslint 9.38.0), so lint matches
Shell's own rules.

```bash
pnpm install     # also enables the pre-commit hook (core.hooksPath = .githooks)
pnpm link        # symlink into GNOME + compile the schema
pnpm dev         # nested shell (mutter devkit) with auto-restart
pnpm lint
pnpm test        # gjs unit tests for adapters and the contract — no Shell needed
pnpm verify      # lint + test + schema: what the pre-commit hook and CI run
pnpm check       # tsc type check — not part of verify yet
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

1. `version-name` in `metadata.json` (`0.1`, or `0.1.1` for a fix release), the `version`
   in `package.json` (`0.1.0`, `0.1.1`) and the newest entry in
   `lib/modules/greeting/notes.js` say the same version, and metadata's `version` (the
   counter `install.sh --update` compares) goes up by one (`tests/metadata.test.js`
   checks); its notes are in `docs/releases/<version-name>.md`.
2. Run [Shexli](https://pypi.org/project/shexli/), the static analyser extensions.gnome.org
   suggests, on the packed zip:
   `uvx --python 3.12 --with "tree-sitter<0.26" shexli dist/buoy@murilegus.shell-extension.zip`
   (shexli 0.2.1 crashes with tree-sitter 0.26).
3. Tag `v<version-name>` on `main` and push the tag: `.github/workflows/release.yml` runs
   `pnpm verify`, `scripts/release-check.sh` and the pack, then publishes the zip on GitHub
   Releases with those notes, twice: `buoy@murilegus.shell-extension.zip` (the name
   `install.sh` downloads) and `buoy@murilegus-v<version-name>.shell-extension.zip`.
4. Upload that zip to [extensions.gnome.org](https://extensions.gnome.org/upload/).

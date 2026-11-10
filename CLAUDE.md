# Buoy — instructions for Claude Code

Buoy is a GNOME Shell 50 extension: a Dynamic-Island-style living pill in the top bar.
Pure JS (GJS), no daemon, ships on extensions.gnome.org.

## Read first, every session
1. `docs/ARCHITECTURE.md` — layout and the 10 rules. Non-negotiable.
2. `docs/SPEC.md` — product decisions (what the pill does, idle, tabs, clusters).
3. `docs/FEATURES.md` — roadmap M0–M5 with status; tasks are referenced as "M1 item N".
4. `docs/CONTRACT.md` — the activity/presentation contract adapters must return.
5. `docs/design/` — how Buoy looks (sizes, type, colour), one page per part; the numbers live
   only in `tokens.vi.md`, the colours only in `colours.vi.md`.

## How we work
- **Claude Code writes the code; Ethan reviews.** Work in units of one FEATURES.md item
  (or one milestone when asked). Implement it fully — code, tests, docs status — then
  stop and hand over for review. Do not start the next item until Ethan says so.
- Before writing, re-read the item's row in FEATURES.md ("done when") and the SPEC, design
  and CONTRACT sections it references. If the item is ambiguous or
  conflicts with a rule, ask one short question first; otherwise proceed without asking.
- Every change must respect ARCHITECTURE rules 1–11 — especially: adapters/`apps/*.js`
  have no `St`, `Main`, timers or measurements; modules import `kit/` only; no polling
  while the island is closed; no blur; nothing animates while idle; no code loaded at
  runtime (EGO).
- Prefer GNOME Shell's own objects over new proxies (`ui/mpris.js`, `ui/calendar.js`,
  `ui/weather.js`, `Main.osdWindowManager`, `Main.messageTray`).
- When unsure about a Shell 50 API, read the source instead of guessing. Both live next to
  this repo on the `gnome-50` branch (clone them if missing):
  `git clone --depth 1 -b gnome-50 https://gitlab.gnome.org/GNOME/gnome-shell.git ../gnome-shell`
  (js/ui/*.js, St in src/st/, theme in data/theme/gnome-shell-sass/) and
  `git clone --depth 1 -b gnome-50 https://gitlab.gnome.org/GNOME/mutter.git ../mutter`
  (Meta/Clutter/Cogl: src/core/, src/backends/, clutter/). Cite file and function for every
  claim about Shell or Mutter behaviour, in chat and in the handover; if the source does
  not settle it, say so instead of assuming. Ubuntu's session uses Yaru: its CSS is in
  `/usr/share/gnome-shell/theme/Yaru/gnome-shell-theme.gresource` (`gresource extract`).
- Keep diffs reviewable: one item per branch, small commits inside it are fine but the
  handover describes the whole. Do not refactor neighbouring code unless the item needs it.
- Vietnamese or English in chat, English in code and comments. `docs/` is bilingual: `page.md`
  in English, `page.vi.md` in Vietnamese. Design pages are written and decided in Vietnamese
  first, then translated; the other docs keep English as their source (ARCHITECTURE, "The docs
  and their site"). Images with words come in two versions, `x.vi.png` and `x.en.png`.

## Commands
- `pnpm test` — gjs unit tests (adapters, contract). Run before saying something works.
- `pnpm lint`
- `pnpm verify` — lint + test + strict schema compile; the same gate runs in the
  pre-commit hook (`.githooks/`, enabled by `pnpm install`) and in CI
  (`.github/workflows/ci.yml`, ubuntu:26.04 = Shell 50's gjs). Don't bypass the hook.
- Module hot swap without restart: enable `dev-mode`, then in Looking Glass
  `Main.extensionManager.lookup('buoy@murilegus').stateObj.reload('<id>')`.
- Kit changes need a nested-shell restart: `pnpm dev`.
- Logs: `journalctl -f -o cat /usr/bin/gnome-shell`

## Testing — the agent tests before handing over, every time

**Unit tests (`tests/*.test.js`, run with `pnpm test`)** — required for all pure logic:
- Every adapter (`modules/*/adapter.js`, `apps/*.js`): default output, each override
  branch, profile overrides, empty/missing fields, long text (no truncation in adapter).
- `kit/activity.js`, `kit/stack.js`, `kit/registry.js`, `kit/shapes.js`: contract
  defaults and validation errors; priority ordering and ties; ttl expiry and the 8 h cap;
  stale; transient end; `apps-hidden`/`apps-plain`; slug normalisation; shape derivation
  at 1366 / 1920 / 2560 / 3440 and the `expanded-width` override.
- Write the tests **before or with** the code, not after. Cover the failure paths, not
  only the happy one. One assertion message per check so a failure says what broke.
- `gjs -m` has no test framework: use plain `throw new Error(...)`, keep tests
  independent, and make `tests/run.sh` exit non-zero on the first failure.

**Running in the Shell** — required for anything that touches `kit/island.js`,
`present.js`, `home.js`, `panel.js`, a `source.js` or `tab.js`:
- Start it yourself in the nested shell (`pnpm dev`) or hot-swap with
  `reload('<id>')` when `dev-mode` is on. Watch `journalctl -f -o cat /usr/bin/gnome-shell`
  for the whole session; any warning or error mentioning `buoy@murilegus` is a failure.
- Exercise the actual path: surface the activity from Looking Glass or from the real
  source (play a track, change volume, copy a file), hover, click, click outside, Esc,
  enable → disable → enable the extension (nothing may leak or stay on screen).
- Check the performance rules by observation: nothing animating at idle, no timers left
  after `end()`/disable (grep your code for `timeout_add` and make sure each has a
  matching `source_remove`).

**Not acceptable:** "should work", "untested but straightforward", tests that only check
the happy path, or marking `[x]` without having run it.

## Definition of done for a task
1. The "done when" column in FEATURES.md is true.
2. `pnpm test` and `pnpm lint` pass; the Testing section above is satisfied.
3. FEATURES.md checkbox set to `[x]` (or `[~]` with what is left in its row); no notes
   under rows — what was done goes in the PR, decisions in SPEC / ARCHITECTURE / docs/design.
4. Docs touched if a decision changed (SPEC/ARCHITECTURE/INDICATORS), with the date.
5. The handover lists exactly what was tested, how, and what was not testable here.

## Handover — always end a finished item with
1. **Tested** — unit tests added (names), `pnpm test`/`lint` output summary, and the
   manual Shell steps you ran with their result; anything you could not test and why.
2. **What to check** — 3–6 bullet steps Ethan can do on his machine to see the feature
   (what to hover/click/play, what should appear), plus one thing most likely to look
   wrong and what to tweak if it does.
3. **What I relied on** — Shell source files/functions consulted; any assumption.
4. **Open questions** — only if any; otherwise "none".
5. Branch/commit block below.

## Branch / commit block
```
Branch:  <type>/<milestone>-<short-slug>        e.g. feat/m3-progress-launcherentry
Commit:  <type>(<scope>): <summary>              e.g. feat(progress): surface LauncherEntry progress in the pill

<body: what changed and why, 2–5 lines; reference SPEC/ARCHITECTURE section if a rule
or decision was involved; note tests added>

Refs: FEATURES.md M3 "progress"
```
Types: feat, fix, docs, refactor, test, chore. Scope = module id or `kit`, `panel`, `docs`.
One item = one branch; squash on merge. Never commit directly to `main`. Create the
branch yourself at the start of the item; leave the merge to Ethan after review.

## Don't
- Don't add dependencies, build steps, or bundlers.
- Don't create a daemon, subprocess, or network call unless the roadmap item says so.
- Don't restyle third-party tray icons or quick settings — colours, icons and menus stay
  GNOME's. Two exceptions (2026-11-04): geometry — every tray button is the same 32 px
  square, and the system cluster's pieces drop their own highlight and padding for the
  shared cluster background; and the foreground — text, symbolic icons and one-colour
  white bitmap icons (Electron's tray glyphs) on the bar follow `cluster-contrast`
  (white, or dark on a light wallpaper), and so does a tray button's highlight (GNOME's
  .17/.28/.32 of that foreground); logos and filled indicators keep their colours. SPEC §1. Don't move
  the pill off centre.
- Don't rename files or restructure without updating ARCHITECTURE.md first.

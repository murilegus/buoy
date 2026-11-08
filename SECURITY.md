# Security policy

Buoy runs inside GNOME Shell, with your session's rights. A bug there can affect your whole
desktop, so security reports are welcome and taken seriously.

## Supported versions

Only the latest release gets fixes. Update with the Extensions app (once Buoy is on
extensions.gnome.org) or with
`curl -fsSL https://murilegus.dev/buoy/install.sh | bash -s -- --update`.

| Version | Supported |
|---|---|
| 0.1.x (latest) | yes |
| older | no |

## Reporting a vulnerability

Please don't open a public issue for a security problem. Instead, either:

- use GitHub's private reporting: **Security → Report a vulnerability** on
  [the repository](https://github.com/murilegus/buoy/security/advisories/new), or
- write to **security@murilegus.dev**.

Say what is affected (Buoy's version, GNOME Shell's version), how to reproduce it, and what
someone could do with it. You will get an answer within a week; a fix goes into a new release
as soon as it is ready, and the advisory credits you unless you'd rather not.

## What is in scope

- The extension itself (`src/buoy@murilegus/`): anything that lets another program or a web
  page make Buoy show, run or reveal something it should not — through its D-Bus interface
  (`org.gnome.Shell.Extensions.Buoy`), MPRIS players, notifications, app profiles, the
  clipboard or the Claude Code hooks.
- The Claude Code hooks Buoy installs (`hooks/claude.js`, the entries it writes into
  `~/.claude/settings.json`), and the permission answers given from the pill.
- `install.sh` and the release workflow.

Out of scope: bugs in GNOME Shell, Mutter or the apps Buoy shows (report those upstream), and
problems that need someone who can already run code as you.

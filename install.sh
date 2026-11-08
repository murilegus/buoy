#!/usr/bin/env bash
# Buoy — install, update or remove it without extensions.gnome.org.
#
#   curl -fsSL https://murilegus.dev/buoy/install.sh | bash             latest release
#   curl -fsSL https://murilegus.dev/buoy/install.sh | bash -s -- --version 0.1
#   curl -fsSL https://murilegus.dev/buoy/install.sh | bash -s -- --update   if a newer one is out
#   ./install.sh --zip buoy@murilegus.shell-extension.zip                a zip you have
#   ./install.sh --from-source                                           from this clone
#   ./install.sh --uninstall [--purge]                                   remove it
#
# For your user only: no sudo, nothing outside ~/.local/share/gnome-shell/extensions and
# GNOME's settings. Never asks anything (it may be piped into bash).
set -euo pipefail

UUID=buoy@murilegus
REPO=murilegus/buoy
ASSET="$UUID.shell-extension.zip"
SHELL_MAJOR=50
# where releases are downloaded from (overridable for testing)
BASE="${BUOY_DOWNLOAD_BASE:-https://github.com/$REPO/releases}"
EXT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
SCHEMA_PATH=/org/gnome/shell/extensions/buoy/

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is needed: $2"; }

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" 2>/dev/null || true
  cat <<EOF
Options:
  --version X     install release X (e.g. 0.1) instead of the latest
  --update        install the latest release only if it is newer than the one installed
  --zip FILE      install this zip
  --from-source   build the zip from this clone (gnome-extensions pack) and install it
  --uninstall     disable and remove Buoy, and its Claude Code hooks
  --purge         with --uninstall: also reset Buoy's own settings
  --force         install on a GNOME Shell other than $SHELL_MAJOR
  -h, --help      this help
EOF
}

mode=install version="" zip="" source=0 purge=0 force=0
while [ $# -gt 0 ]; do
  case "$1" in
    --version) [ $# -ge 2 ] || die "--version needs a value"; version="${2#v}"; shift 2 ;;
    --zip) [ $# -ge 2 ] || die "--zip needs a file"; zip="$2"; shift 2 ;;
    --from-source) source=1; shift ;;
    --update) mode=update; shift ;;
    --uninstall) mode=uninstall; shift ;;
    --purge) purge=1; shift ;;
    --force) force=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# --- GNOME's enabled-extensions list ------------------------------------------------------

# the list without (or with) Buoy, as a GVariant string for gsettings
list_without() {
  gsettings get org.gnome.shell "$1" | sed -e 's/^@as //' -e 's/^\[//' -e 's/\]$//' | tr ',' '\n' |
    sed -e "s/^ *'//" -e "s/' *$//" | grep -v -x -e "$UUID" -e '' || true
}
to_variant() {
  local out="" item
  while IFS= read -r item; do
    [ -n "$item" ] && out="$out${out:+, }'$item'"
  done
  printf '[%s]' "$out"
}
set_enabled() {  # 1: on, 0: off
  local list
  list="$(list_without enabled-extensions)"
  if [ "$1" = 1 ]; then list="$(printf '%s\n%s' "$list" "$UUID")"; fi
  gsettings set org.gnome.shell enabled-extensions "$(printf '%s\n' "$list" | to_variant)"
  if [ "$1" = 1 ]; then
    gsettings set org.gnome.shell disabled-extensions "$(list_without disabled-extensions | to_variant)"
  fi
}

shell_knows() { gnome-extensions info "$UUID" >/dev/null 2>&1; }

# --- install ------------------------------------------------------------------------------

check_shell() {
  need gnome-shell "Buoy is a GNOME Shell extension"
  need gnome-extensions "it comes with GNOME Shell"
  need gsettings "it comes with GLib"
  local v major
  v="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)*' | head -n1)"
  major="${v%%.*}"
  if [ "$major" != "$SHELL_MAJOR" ]; then
    [ "$force" = 1 ] || die "Buoy $([ -n "$version" ] && echo "$version ")needs GNOME Shell $SHELL_MAJOR; this is ${v:-unknown} (--force to try anyway)"
    warn "GNOME Shell ${v:-unknown}: Buoy is made for $SHELL_MAJOR, it may not load"
  fi
}

download() {
  local url out="$tmp/$ASSET"
  if [ -n "$version" ]; then url="$BASE/download/v$version/$ASSET"; else url="$BASE/latest/download/$ASSET"; fi
  say "Downloading ${version:+Buoy $version }from $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar -o "$out" "$url" || die "could not download $url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$out" "$url" || die "could not download $url"
  else
    die "curl or wget is needed to download Buoy"
  fi
  zip="$out"
}

build_from_source() {
  local root
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
  [ -n "$root" ] && [ -f "$root/src/$UUID/metadata.json" ] && [ -x "$root/scripts/pack.sh" ] ||
    die "--from-source runs from a clone: git clone https://github.com/$REPO && cd buoy && ./install.sh --from-source"
  say "Building the zip from $root"
  "$root/scripts/pack.sh" >/dev/null
  zip="$root/dist/$ASSET"
}

# A developer's checkout linked in place (`ln -s …/src/buoy@murilegus`): gnome-extensions
# install --force and uninstall both delete the folder recursively and follow the link
# (extensions-tool main.c file_delete_recursively; Shell's misc/fileUtils.js
# recursivelyDeleteDir), so they would empty the checkout. The script never runs them on one.
refuse_link() {
  [ -L "$EXT_DIR" ] || return 0
  die "$EXT_DIR is a link to $(readlink "$EXT_DIR") (a development checkout); installing over it would delete that folder's files. Remove the link first: rm '$EXT_DIR'"
}

install_buoy() {
  refuse_link
  [ "$mode" = update ] || check_shell
  if [ "$source" = 1 ]; then build_from_source
  elif [ -z "$zip" ]; then download
  fi
  [ -f "$zip" ] || die "no such file: $zip"
  local was=0
  [ -d "$EXT_DIR" ] && was=1
  say "Installing $(basename "$zip")"
  gnome-extensions install --force "$zip" || die "gnome-extensions could not install $zip"
  [ -f "$EXT_DIR/metadata.json" ] || die "the zip did not install into $EXT_DIR"
  set_enabled 1
  if [ "$(gsettings get org.gnome.shell disable-user-extensions)" = true ]; then
    warn "Extensions are switched off (Extensions app → Use Extensions): Buoy waits until they are on"
  fi
  local name
  name="$(grep -oE '"version-name": *"[^"]+"' "$EXT_DIR/metadata.json" | grep -oE '"[^"]+"$' | tr -d '"' || true)"
  say "Buoy ${name:-} is installed and switched on."
  if [ "$was" = 1 ]; then
    echo "    The running GNOME Shell keeps the version it loaded: log out and back in to use this one."
  elif shell_knows; then
    echo "    It should appear in the top bar now."
  else
    echo "    Log out and back in to start it (GNOME on Wayland loads new extensions at login)."
  fi
  echo "    Settings: the ⚙ in Buoy's Home, or: gnome-extensions prefs $UUID"
}

# --- update -------------------------------------------------------------------------------

# a metadata.json field: a number (`version`) or a string (`version-name`)
field() {
  grep -oE "\"$2\": *(\"[^\"]*\"|[0-9]+)" "$1" | head -n1 | sed -E 's/^[^:]*: *//; s/"//g' || true
}

# metadata.json out of a zip, without assuming unzip is there
zip_metadata() {
  if command -v unzip >/dev/null 2>&1; then
    unzip -p "$1" metadata.json > "$2"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -I -c 'import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("metadata.json"))' "$1" > "$2"
  else
    die "unzip or python3 is needed to read the release's version"
  fi
}

# The latest release, installed only when its `version` (EGO's counter) is above the one
# installed. Until Buoy is on extensions.gnome.org this is how it updates; after, the
# Extensions app (or Extension Manager) updates it from there, the same uuid.
update_buoy() {
  refuse_link
  [ -f "$EXT_DIR/metadata.json" ] || die "Buoy is not installed; install it first (without --update)"
  [ -z "$version" ] && [ -z "$zip" ] && [ "$source" = 0 ] || die "--update takes the latest release; use --version, --zip or --from-source without it"
  check_shell
  download
  zip_metadata "$zip" "$tmp/new.json" || die "the download is not a Buoy zip"
  local have want have_name want_name
  have="$(field "$EXT_DIR/metadata.json" version)"; have_name="$(field "$EXT_DIR/metadata.json" version-name)"
  want="$(field "$tmp/new.json" version)"; want_name="$(field "$tmp/new.json" version-name)"
  [[ "$want" =~ ^[0-9]+$ ]] || die "the release has no version number"
  if [[ "$have" =~ ^[0-9]+$ ]] && [ "$want" -le "$have" ]; then
    say "Buoy ${have_name:-$have} is up to date."
    return
  fi
  say "Updating Buoy ${have_name:-$have} → ${want_name:-$want}"
  install_buoy
}

# --- uninstall ----------------------------------------------------------------------------

# Claude Code's hooks out of ~/.claude/settings.json (with the extension's own hooks.js, as
# prefs does; the old file kept as settings.json.bak), then GNOME's settings Buoy may have
# set on its first run, with the commands to put them back
cleanup_helper() {
  cat > "$tmp/cleanup.js" <<'EOF'
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const [ext] = ARGV;
const {uninstall, installed} = await import(`file://${ext}/lib/modules/agent/hooks.js`);
const kit = await import(`file://${ext}/lib/kit/settings.js`);

const dir = GLib.getenv('CLAUDE_CONFIG_DIR') || GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
const file = Gio.File.new_for_path(GLib.build_filenamev([dir, 'settings.json']));
const shown = file.get_path().replace(GLib.get_home_dir(), '~');
if (file.query_exists(null)) {
    try {
        const text = new TextDecoder().decode(file.load_contents(null)[1]);
        const current = text.trim() ? JSON.parse(text) : {};
        if (installed(current) !== 'none') {
            const backup = Gio.File.new_for_path(`${file.get_path()}.bak`);
            if (!backup.query_exists(null))
                file.copy(backup, Gio.FileCopyFlags.NONE, null, null);
            const next = uninstall(current);
            file.replace_contents(new TextEncoder().encode(`${JSON.stringify(next, null, 2)}\n`), null, false,
                Gio.FileCreateFlags.NONE, null);
            print(`==> Removed Buoy's hooks from ${shown}`);
        }
    } catch (e) {
        printerr(`!! ${shown} left as it is (${e instanceof SyntaxError ? 'not valid JSON' : e.message})`);
    }
}

const source = Gio.SettingsSchemaSource.get_default();
const same = [];
for (const {schema, key, value} of kit.gnomeDefaults([...kit.GNOME_CLOCK, ...kit.GNOME_DOCK, ...kit.GNOME_WEATHER], () => false)) {
    if (!source?.lookup(schema, true)?.has_key(key))
        continue;
    const s = new Gio.Settings({schema_id: schema});
    if (s.get_user_value(key) !== null && s.get_value(key).deepUnpack() === value)
        same.push(`gsettings reset ${schema} ${key}`);
}
if (same.length) {
    print('    On its first run Buoy set these GNOME settings where you had not; they stay as they are.');
    print('    To put any back to GNOME\'s default:');
    for (const line of same)
        print(`      ${line}`);
}
EOF
}

uninstall_buoy() {
  need gsettings "it comes with GLib"
  if [ ! -d "$EXT_DIR" ] && [ ! -L "$EXT_DIR" ]; then
    set_enabled 0
    [ "$purge" = 1 ] && { dconf reset -f "$SCHEMA_PATH" 2>/dev/null || true; }
    say "Buoy is not installed in $EXT_DIR: nothing to remove."
    return
  fi
  if command -v gjs >/dev/null 2>&1 && [ -f "$EXT_DIR/lib/modules/agent/hooks.js" ]; then
    cleanup_helper
    gjs -m "$tmp/cleanup.js" "$EXT_DIR" || warn "could not check Claude Code's settings"
  fi
  set_enabled 0
  if [ -L "$EXT_DIR" ]; then
    # a linked checkout (refuse_link): only the link goes, the checkout stays
    local target
    target="$(readlink "$EXT_DIR")"
    rm -f "$EXT_DIR"
    say "Buoy's link is removed; the checkout at $target is untouched."
  else
    if command -v gnome-extensions >/dev/null 2>&1 && shell_knows; then
      gnome-extensions uninstall "$UUID" 2>/dev/null || true
    fi
    rm -rf "$EXT_DIR"
    say "Buoy is removed."
  fi
  if [ "$purge" = 1 ]; then
    dconf reset -f "$SCHEMA_PATH" 2>/dev/null || warn "could not reset $SCHEMA_PATH (dconf missing?)"
    echo "    Its settings are reset too."
  else
    echo "    Its settings are kept for a reinstall; --uninstall --purge resets them."
  fi
  echo "    The running GNOME Shell drops it now if it was running; otherwise at the next login."
}

case "$mode" in
  uninstall) uninstall_buoy ;;
  update) update_buoy ;;
  *) install_buoy ;;
esac

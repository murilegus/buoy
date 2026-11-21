# SPDX-License-Identifier: GPL-2.0-or-later
#
# Buoy's shell hook (FEATURES M4 "Terminal command finished"; design/compact "Lệnh terminal
# xong"). Sourced from ~/.zshrc or ~/.bashrc, never run by Buoy:
#
#   source ~/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/shell.sh
#
# 1. VTE's own shell integration, when the shell has not loaded it (zsh on Ubuntu does not
#    read /etc/profile.d), and in zsh the "preexec" VTE's script only sends from bash: Ptyxis
#    says "Command completed" only with both (ptyxis-tab-notify.h).
# 2. When a command ends, its exit code, start, end and directory go to a small file of this
#    shell's own, $XDG_RUNTIME_DIR/buoy-shell-<pid>, written with the shell's builtins: no
#    process, no D-Bus. Buoy reads it only when Ptyxis's notification comes.
# Without Buoy nothing else happens; the shell goes on as before.

[ -n "${BASH_VERSION:-}${ZSH_VERSION:-}" ] || return 0
case $- in *i*) ;; *) return 0 ;; esac
[ -n "${XDG_RUNTIME_DIR:-}" ] && [ -d "$XDG_RUNTIME_DIR" ] || return 0
[ -n "${__buoy_shell:-}" ] && return 0
__buoy_shell="$XDG_RUNTIME_DIR/buoy-shell-$$"
__buoy_start=
__buoy_cmd=

if [ -n "${VTE_VERSION:-}" ] && ! typeset -f __vte_precmd > /dev/null 2>&1 && [ -r /etc/profile.d/vte-2.91.sh ]; then
    . /etc/profile.d/vte-2.91.sh
fi

# the record: "1 <exit> <start> <end>" (zsh: seconds as EPOCHREALTIME says them; bash:
# microseconds), the directory, the command line
__buoy_record() {
    printf '1 %s %s %s\n%s\n%s\n' "$1" "$__buoy_start" "$2" "$PWD" "$__buoy_cmd" >| "$__buoy_shell" 2> /dev/null
}

if [ -n "${ZSH_VERSION:-}" ]; then
    zmodload -F zsh/datetime p:EPOCHREALTIME 2> /dev/null || return 0
    __buoy_preexec() {
        __buoy_cmd=$1
        __buoy_start=$EPOCHREALTIME
        [ -n "${VTE_VERSION:-}" ] && printf '\033]666;vte.shell.preexec!\033\\'
        return 0
    }
    __buoy_precmd() {
        local s=$?
        [ -n "$__buoy_start" ] && __buoy_record "$s" "$EPOCHREALTIME"
        __buoy_start=
        return $s
    }
    # first, so it reads the command's own $? and writes before VTE's precmd tells Ptyxis
    preexec_functions=(__buoy_preexec "${preexec_functions[@]}")
    precmd_functions=(__buoy_precmd "${precmd_functions[@]}")
else
    [ -n "${EPOCHREALTIME:-}" ] || return 0     # bash 5.0+
    __buoy_precmd() {
        local s=$?
        # no command line: reading the history would take a subshell; Buoy has Ptyxis's
        [ -n "$__buoy_start" ] && __buoy_record "$s" "${EPOCHREALTIME/[.,]/}"
        __buoy_start=
        return $s
    }
    # bash has no preexec: PS0 is expanded right before a command runs; the arithmetic sets
    # the start (microseconds) and the whole expands to nothing
    PS0='${__buoy_start:$((__buoy_start=${EPOCHREALTIME/[.,]/}, 0)):0}'"${PS0:-}"
    if [[ "$(declare -p PROMPT_COMMAND 2> /dev/null)" == "declare -a"* ]]; then
        PROMPT_COMMAND=(__buoy_precmd "${PROMPT_COMMAND[@]}")
    else
        PROMPT_COMMAND="__buoy_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
    fi
fi

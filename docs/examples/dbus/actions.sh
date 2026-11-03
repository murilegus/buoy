#!/usr/bin/env bash
# Print every button pressed on an activity a script surfaced: Action(id, action).
exec gdbus monitor --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/Buoy

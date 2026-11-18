#!/usr/bin/env bash
# A phone notification as GSConnect shows one, without the phone (FEATURES M4 "Phone via
# GSConnect"): what a ride, an OTP or a message from an app on the phone looks like on Buoy.
#
#   scripts/phone-notification.sh <app on the phone> <title> <text> [picture.png]
#   scripts/phone-notification.sh Grab "Tài xế đã đến" "Nguyễn Văn An · Honda Vision trắng · 59X1-234.56"
#   scripts/phone-notification.sh Messages Vietcombank "Ma OTP cua Quy khach la 482913"
#   scripts/phone-notification.sh Zalo "Quỳnh Trâm" "Tối nay họp lúc 8 giờ nhé" ~/face.png
#
# GSConnect posts every phone notification as its own GTK notification (org.gtk.Notifications,
# app org.gnome.Shell.Extensions.GSConnect), titled with the phone's app, its body "title: text"
# (src/service/plugins/notification.js _receiveNotification); an SMS ("Messages") is titled with
# the sender, sms-symbolic. Shell takes it from any sender (js/ui/notificationDaemon.js
# GtkNotificationDaemon) as long as GSConnect's .desktop exists. No buttons, no default action: a
# click on it would ask GSConnect's service to act. Dismiss it with ×.
set -euo pipefail
[ $# -ge 3 ] || { sed -n 5,8p "$0" | sed 's/^# *//'; exit 1; }
app=$1 title=$2 text=$3 picture=${4:-}
APP=org.gnome.Shell.Extensions.GSConnect

# a GVariant string literal: quotes and backslashes escaped
q() { local s=${1//\\/\\\\}; s=${s//\'/\\\'}; printf "'%s'" "$s"; }

if [ "$app" = Messages ]; then
  dict="{'title': <$(q "$title")>, 'body': <$(q "$text")>, 'icon': <('themed', <['sms-symbolic']>)>"
else
  dict="{'title': <$(q "$app")>, 'body': <$(q "$title: $text")>"
fi
if [ -n "$picture" ]; then
  [ -f "$picture" ] || { echo "no such picture: $picture" >&2; exit 1; }
  uri="file://$(realpath "$picture")"
  dict="${dict%%, 'icon'*}, 'icon': <('file', <$(q "$uri")>)>"
fi
dict="$dict}"

gdbus call --session --dest org.gtk.Notifications --object-path /org/gtk/Notifications \
  --method org.gtk.Notifications.AddNotification "$APP" "buoy-test-$(date +%s%N)" "$dict" >/dev/null
echo "sent: $app · $title"

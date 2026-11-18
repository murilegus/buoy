#!/usr/bin/env bash
# A phone notification as GSConnect shows one, without the phone (FEATURES M4 "Phone via
# GSConnect"): what a ride, an OTP, a message or a call from the phone looks like on Buoy.
#
#   scripts/phone-notification.sh <app on the phone> <title> <text> [picture.png]
#   scripts/phone-notification.sh Grab "Tài xế đã đến" "Nguyễn Văn An · Honda Vision trắng · 59X1-234.56"
#   scripts/phone-notification.sh Messages Vietcombank "Ma OTP cua Quy khach la 482913"
#   scripts/phone-notification.sh Zalo "Quỳnh Trâm" "Tối nay họp lúc 8 giờ nhé" ~/face.png
#   scripts/phone-notification.sh --reply Zalo "Quỳnh Trâm" "Tối nay họp lúc 8 giờ nhé"
#   scripts/phone-notification.sh --call ringing "Quỳnh Trâm" [picture.png]
#   scripts/phone-notification.sh --call talking "Quỳnh Trâm"
#   scripts/phone-notification.sh --call end "Quỳnh Trâm"
#
# GSConnect posts every phone notification as its own GTK notification (org.gtk.Notifications,
# app org.gnome.Shell.Extensions.GSConnect), titled with the phone's app, its body "title: text"
# (src/service/plugins/notification.js _receiveNotification); an SMS ("Messages") is titled with
# the sender, sms-symbolic. A repliable one ends its id with KDE Connect's reply id (a UUID); a
# call's id is "<device>|ringing|<caller>" or "|talking|", withdrawn when it ends
# (plugins/telephony.js). Shell takes it from any sender (js/ui/notificationDaemon.js
# GtkNotificationDaemon) as long as GSConnect's .desktop exists.
#
# The device is $PHONE_DEVICE (GSConnect's id of the phone), else "test": no phone answers it, so
# Mute and Send have nobody to reach (Send says "Couldn't send"). No buttons, no default action:
# a click on the notification would ask GSConnect's service to act. Dismiss it with ×.
set -euo pipefail
usage() { sed -n 5,12p "$0" | sed 's/^# *//'; exit 1; }
APP=org.gnome.Shell.Extensions.GSConnect
DEVICE=${PHONE_DEVICE:-test}

# a GVariant string literal: quotes and backslashes escaped
q() { local s=${1//\\/\\\\}; s=${s//\'/\\\'}; printf "'%s'" "$s"; }
icon() { [ -f "$1" ] || { echo "no such picture: $1" >&2; exit 1; }; printf "<('file', <%s>)>" "$(q "file://$(realpath "$1")")"; }
gtk() { gdbus call --session --dest org.gtk.Notifications --object-path /org/gtk/Notifications --method "org.gtk.Notifications.$1" "${@:2}" >/dev/null; }

if [ "${1:-}" = --call ]; then
  [ $# -ge 3 ] || usage
  state=$2 caller=$3 picture=${4:-}
  case $state in
    ringing) body='Incoming call' ;;
    talking) body='Ongoing call'; gtk RemoveNotification "$APP" "$DEVICE|ringing|$caller" ;;
    end) gtk RemoveNotification "$APP" "$DEVICE|ringing|$caller"; gtk RemoveNotification "$APP" "$DEVICE|talking|$caller"
         echo "ended: $caller"; exit 0 ;;
    *) usage ;;
  esac
  dict="{'title': <$(q "$caller")>, 'body': <$(q "$body")>, 'priority': <'urgent'>"
  if [ -n "$picture" ]; then dict="$dict, 'icon': $(icon "$picture")"; else dict="$dict, 'icon': <('themed', <['call-start-symbolic']>)>"; fi
  gtk AddNotification "$APP" "$DEVICE|$state|$caller" "$dict}"
  echo "sent: $state · $caller"
  exit 0
fi

reply=
if [ "${1:-}" = --reply ]; then reply=1; shift; fi
[ $# -ge 3 ] || usage
app=$1 title=$2 text=$3 picture=${4:-}

if [ "$app" = Messages ]; then
  dict="{'title': <$(q "$title")>, 'body': <$(q "$text")>"
  [ -n "$picture" ] || dict="$dict, 'icon': <('themed', <['sms-symbolic']>)>"
else
  dict="{'title': <$(q "$app")>, 'body': <$(q "$title: $text")>"
fi
[ -z "$picture" ] || dict="$dict, 'icon': $(icon "$picture")"

id="$DEVICE|0|test.$app|$(date +%s%N)"
[ -z "$reply" ] || id="$id|$(cat /proc/sys/kernel/random/uuid)"
gtk AddNotification "$APP" "$id" "$dict}"
echo "sent: $app · $title"

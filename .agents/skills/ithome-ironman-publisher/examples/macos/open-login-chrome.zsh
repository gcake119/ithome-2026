#!/bin/zsh

set -u

: "${ITHOME_CHROME_PROFILE:?ITHOME_CHROME_PROFILE is required}"
: "${ITHOME_DRAFTS_URL:?ITHOME_DRAFTS_URL is required}"

cdp_port="${ITHOME_CDP_PORT:-9223}"
case "$cdp_port" in
  ''|*[!0-9]*) print -u2 'ITHOME_CDP_PORT must be numeric'; exit 1 ;;
esac

case "$ITHOME_CHROME_PROFILE" in
  /*) ;;
  *) print -u2 'ITHOME_CHROME_PROFILE must be an absolute path'; exit 1 ;;
esac

case "$ITHOME_DRAFTS_URL" in
  https://ithelp.ithome.com.tw/*) ;;
  *) print -u2 'ITHOME_DRAFTS_URL must use https://ithelp.ithome.com.tw/'; exit 1 ;;
esac

chrome_profile="$ITHOME_CHROME_PROFILE"

exec /usr/bin/open -na 'Google Chrome' --args \
  --remote-debugging-address=127.0.0.1 \
  "--remote-debugging-port=$cdp_port" \
  "--user-data-dir=$chrome_profile" \
  --no-first-run \
  --no-default-browser-check \
  --new-window \
  "$ITHOME_DRAFTS_URL"

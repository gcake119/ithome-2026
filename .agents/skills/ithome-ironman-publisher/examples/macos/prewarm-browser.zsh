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

endpoint="http://127.0.0.1:$cdp_port"
if /usr/bin/curl --fail --silent "$endpoint/json/version" >/dev/null; then
  exit 0
fi

/usr/bin/open -na 'Google Chrome' --args \
  --remote-debugging-address=127.0.0.1 \
  "--remote-debugging-port=$cdp_port" \
  "--user-data-dir=$ITHOME_CHROME_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --new-window \
  "$ITHOME_DRAFTS_URL"

for attempt in {1..30}; do
  /usr/bin/curl --fail --silent "$endpoint/json/version" >/dev/null && exit 0
  /bin/sleep 1
done

print -u2 'Dedicated publisher Chrome did not become ready'
exit 1

#!/bin/zsh

set -u

: "${ITHOME_PUBLISHER_REPO:?ITHOME_PUBLISHER_REPO is required}"
: "${ITHOME_CHROME_PROFILE:?ITHOME_CHROME_PROFILE is required}"
: "${ITHOME_DRAFTS_URL:?ITHOME_DRAFTS_URL is required}"
: "${ITHOME_PUBLIC_ARTICLES_URL:?ITHOME_PUBLIC_ARTICLES_URL is required}"
: "${ITHOME_EVENT_DIR:?ITHOME_EVENT_DIR is required}"
: "${ITHOME_BOOTSTRAP_STATE:?ITHOME_BOOTSTRAP_STATE is required}"

cdp_port="${ITHOME_CDP_PORT:-9223}"
case "$cdp_port" in
  ''|*[!0-9]*) print -u2 'ITHOME_CDP_PORT must be numeric'; exit 1 ;;
esac

case "$ITHOME_PUBLISHER_REPO:$ITHOME_CHROME_PROFILE" in
  /*:/*) ;;
  *) print -u2 'Publisher repo and Chrome profile must be absolute paths'; exit 1 ;;
esac

endpoint="http://127.0.0.1:$cdp_port"
export ITHOME_CDP_ENDPOINT="$endpoint"

cd "$ITHOME_PUBLISHER_REPO" || exit 1

if ! /usr/bin/curl --fail --silent "$endpoint/json/version" >/dev/null; then
  /usr/bin/open -na 'Google Chrome' --args \
    --remote-debugging-address=127.0.0.1 \
    "--remote-debugging-port=$cdp_port" \
    "--user-data-dir=$ITHOME_CHROME_PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    "$ITHOME_DRAFTS_URL"
  for attempt in {1..30}; do
    /usr/bin/curl --fail --silent "$endpoint/json/version" >/dev/null && break
    /bin/sleep 1
  done
fi

/usr/bin/curl --fail --silent "$endpoint/json/version" >/dev/null || exit 1
exec /usr/bin/env node \
  "$ITHOME_PUBLISHER_REPO/.agents/skills/ithome-ironman-publisher/scripts/run-scheduled-browser-publisher.mjs"

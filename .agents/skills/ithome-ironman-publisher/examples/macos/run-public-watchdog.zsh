#!/bin/zsh

set -u
set -o pipefail

: "${ITHOME_WATCHDOG_REPO:?ITHOME_WATCHDOG_REPO is required}"
: "${ITHOME_EVENT_DIR:?ITHOME_EVENT_DIR is required}"
: "${ITHOME_BOOTSTRAP_STATE:?ITHOME_BOOTSTRAP_STATE is required}"
: "${ITHOME_PUBLIC_WATCHDOG_STATE:?ITHOME_PUBLIC_WATCHDOG_STATE is required}"

checkpoint="${1:-}"
case "$checkpoint" in
  public-1900|public-2230) ;;
  *) print -u2 'checkpoint must be public-1900 or public-2230'; exit 1 ;;
esac

case "$ITHOME_WATCHDOG_REPO:$ITHOME_EVENT_DIR:$ITHOME_BOOTSTRAP_STATE:$ITHOME_PUBLIC_WATCHDOG_STATE" in
  /*:/*:/*:/*) ;;
  *) print -u2 'Watchdog repo, event, bootstrap, and state paths must be absolute'; exit 1 ;;
esac

cd "$ITHOME_WATCHDOG_REPO" || exit 1

/usr/bin/env node \
  "$ITHOME_WATCHDOG_REPO/.agents/skills/ithome-ironman-publisher/scripts/hermes-public-series-watchdog.mjs" \
  --mode check \
  --events "$ITHOME_EVENT_DIR" \
  --bootstrap "$ITHOME_BOOTSTRAP_STATE" \
  --state "$ITHOME_PUBLIC_WATCHDOG_STATE" \
  --checkpoint "$checkpoint" \
| /usr/bin/env node \
  "$ITHOME_WATCHDOG_REPO/.agents/skills/ithome-ironman-publisher/scripts/hermes-watcher-notify.mjs"

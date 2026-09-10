# Hermes watcher integration

`scripts/hermes-watcher.mjs` is a read-only bridge consumer and notification decision engine. It does not log in to iThome, fetch article bodies, obtain Telegram credentials, send Telegram, install a schedule, or replace Hermes's existing Telegram poller and public-series watchdog.

## Inputs and output

The watcher reads:

- publisher events from `/Users/Shared/ithome-ironman-bridge/events/`;
- verified Day 1 state from `/Users/Shared/ithome-ironman-bridge/state/series-bootstrap.json`;
- deduplication state from a Hermes-owned absolute path ending in `watcher-state.json`.

It prints one JSON result. `notifications` contains messages that Hermes may relay through its existing Telegram capability. `watchdog.status: "ready"` hands the verified `seriesUrl` and `seriesId` to the existing public-series watchdog. A blocked watchdog must not guess the series identity.

Pipe that JSON through `scripts/hermes-watcher-notify.mjs` for Hermes `--no-agent` delivery. It prints nothing when `notifications` is empty, so a healthy run remains silent; it never reads Telegram credentials.

The watcher refuses to store its own state anywhere below `/Users/Shared/ithome-ironman-bridge`. The state directory must already exist and be owned and writable by the Hermes service environment.

## Dry run

Use fixture paths for local verification; do not point a development run at Hermes's production state file.

```bash
node .agents/skills/ithome-ironman-publisher/scripts/hermes-watcher.mjs \
  --events /absolute/fixture/events \
  --bootstrap /absolute/fixture/state/series-bootstrap.json \
  --state /absolute/hermes-owned-fixture/watcher-state.json \
  --checkpoint day1-1900 \
  --dry-run
```

`--dry-run` never writes watcher state. Without `--dry-run`, state is written atomically. Repeated `eventId` values and repeated Day 1 checkpoints remain silent after their first recorded handling.

## Notification rules

- A fresh `audit-drafts: complete` event is silent.
- Missing, duplicate, mismatch, unclassified, and failed audit results produce distinct notification decisions.
- Blocked, failed, or uncertain publish results and non-verified bootstrap events produce failure notification decisions.
- Events older than the default 36-hour window produce `stale_event` instead of being presented as current evidence. Override only with an explicit `--max-age-hours` value.
- Invoke with `--checkpoint day1-1900` at the Day 1 19:00 schedule and `--checkpoint day1-2230` at the 22:30 schedule. Missing or invalid verified state produces one reminder per checkpoint.
- After a checkpoint has observed missing or invalid bootstrap state, the first later valid state produces one `bootstrap_recovered` decision. Later runs remain silent.

Scheduling, Telegram relay, service-account filesystem verification, and the public-page network check remain Hermes deployment work and require separate authorization and live acceptance.

## GitHub Pages 09:25 verification

`scripts/hermes-github-pages-watchdog.mjs` is an independent GitHub Pages decision engine. It reads the initialized `ithome.config.json` schedule and checks the exact scheduled URL under `githubPages.publicUrl`; it does not read publisher events, browser state, credentials, or GitHub tokens, and it never triggers a workflow.

- Run it at 09:25 Asia/Taipei with a Hermes-owned absolute state path ending in `github-pages-0925-state.json`.
- It verifies the HTTP result, final URL, canonical URL, scheduled Day label, and scheduled date.
- HTTP 404 produces `github_pages_missing`; content or redirect disagreement produces `github_pages_mismatch`; exhausted network or other HTTP failures produce `github_pages_unavailable`.
- Each check tries once and retries at most twice, waiting two minutes between attempts. A verified page remains silent.
- Deduplication uses `YYYY-MM-DD:github-pages-0925:<result>` and is independent from `watcher-state.json` and `public-watchdog-state.json`.
- Pipe its JSON through `scripts/hermes-watcher-notify.mjs` and the existing Hermes `--no-agent` relay. Do not create another Telegram poller.

Example dry run:

```bash
node .agents/skills/ithome-ironman-publisher/scripts/hermes-github-pages-watchdog.mjs \
  --state "/absolute/hermes-owned-fixture/github-pages-0925-state.json" \
  --date 2026-09-10 \
  --dry-run
```

`--dry-run` performs the public read and prints the decision without writing state or sending a notification itself.

## Daily publication reminder and public verification

`scripts/hermes-public-series-watchdog.mjs` implements the repository-controlled daily decision logic. It uses the explicit `ithome.config.json` schedule; it never guesses the Day from series order.

- `--mode reminder` emits one unconditional 09:00 reminder for the scheduled Day.
- `--mode check --checkpoint public-1900` performs the 19:00 check.
- `--mode check --checkpoint public-2230` performs the independent 22:30 check.
- A check reads the verified publish event and follows the verified public series page to its highest pagination page. If the public series page is unavailable, it falls back to the official series RSS. It requires the expected article to be the latest entry with the exact title, then fetches that public article and requires the scheduled publication date and exact canonical URL.
- Article discovery is limited to the page's `<main>` content and excludes nested navigation, sidebar, and footer regions. If a recognizable main content region is absent, the check reports the page as unreadable instead of scanning every article link and guessing.
- Each public fetch tries once and retries at most twice, waiting two minutes between attempts. Only exhausted read failures produce `public_watchdog_unavailable`; they are never reported as an unpublished article.
- A verified result is silent. Missing, non-latest, title-mismatched, canonical-mismatched, or missing verified publish evidence produces a publication reminder.
- Reminder and both checkpoints use separate deduplication keys in the Hermes-owned `public-watchdog-state.json`.

The script does not install schedules or send Telegram. Pipe its JSON result through `scripts/hermes-watcher-notify.mjs` and the existing Hermes `--no-agent` relay.

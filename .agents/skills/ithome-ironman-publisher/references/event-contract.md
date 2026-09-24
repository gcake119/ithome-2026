# Machine-readable event contract

Events carry minimum necessary operation results to a Hermes-owned notification consumer. They are not commands and never authorize Hermes to operate iThome.

## Bootstrap event

Use operation `bootstrap-series` after a Day 1 publish attempt. Statuses are `verified`, `incomplete`, `failed`, or `uncertain`.

```json
{
  "schemaVersion": 1,
  "eventId": "UUID",
  "source": "codex-ithome-ironman-publisher",
  "repository": "<github-owner>/<github-repo>",
  "series": "<configured-series-key>",
  "operation": "bootstrap-series",
  "status": "verified",
  "day": 1,
  "articleUrl": "https://ithelp.ithome.com.tw/articles/...",
  "seriesUrl": "https://ithelp.ithome.com.tw/ironman/...",
  "seriesId": "...",
  "publishedAt": "RFC3339 timestamp",
  "completedAt": "RFC3339 timestamp",
  "runId": "publish-day1-..."
}
```

Only `verified` requires all identity fields. Incomplete, failed, or uncertain events include `failure.reasonCode` and must never replace verified bootstrap state.

## Audit event

```json
{
  "schemaVersion": 1,
  "eventId": "UUID",
  "source": "codex-ithome-ironman-publisher",
  "repository": "<github-owner>/<github-repo>",
  "series": "<configured-series-key>",
  "operation": "audit-drafts",
  "status": "incomplete",
  "expected": 30,
  "foundUnique": 28,
  "missing": [7, 19],
  "duplicate": [],
  "mismatch": [],
  "unclassifiedCount": 0,
  "confidence": "complete",
  "auditedAt": "RFC3339 timestamp",
  "completedAt": "RFC3339 timestamp",
  "runId": "audit-..."
}
```

Audit statuses are `complete`, `incomplete`, `conflict`, or `failed`. Duplicate entries use `{ "day": 12, "count": 2 }`; mismatch entries use `{ "day": 4, "fields": ["title", "canonicalUrl"] }`. Failed audits include `failure.reasonCode` and `failure.phase`.

## Publish event

```json
{
  "schemaVersion": 1,
  "eventId": "UUID",
  "source": "codex-ithome-ironman-publisher",
  "repository": "<github-owner>/<github-repo>",
  "series": "<configured-series-key>",
  "operation": "publish-day",
  "day": 12,
  "status": "failed",
  "completedAt": "RFC3339 timestamp",
  "runId": "publish-...",
  "result": {
    "reasonCode": "draft_missing",
    "phase": "draft_audit",
    "publishClickCount": 0,
    "publicVerification": "not_started"
  }
}
```

Publish statuses are `verified`, `blocked`, `failed`, `uncertain`, or `cancelled`.

Every non-`verified` publish event requires `result.phase`, identifying the failed step without including page content. Supported phases are `payload_preflight`, `bootstrap_preflight`, `browser_connection`, `browser_session`, `draft_audit`, `public_audit`, `publish_interlock`, `publish_click`, `public_verification`, `result_validation`, and `unknown`.

When `reasonCode` is `anti_automation`, `result.blockReason` records the detected category (`cloudflare`, `captcha`, or `rate_limited`) without storing page text or browser state.

The scheduled runner records `result.attemptCount` (1–3). `result.retryLimitReached: true` means a retryable pre-click failure remained after the third attempt. Intermediate attempts do not create events.

After a publish click, an `uncertain` event may include `result.postClickState` (`accepted`, `confirmation_required`, `server_error`, `pending`, or `unknown`) and `result.verificationTrace` with at most three read-only checks. Each trace entry has an `attempt` number and either `articleFound`, `titleMatched`, `canonicalLinkMatched`, and `draftPresent` booleans (or `null` when the check was unavailable), or a sanitized `errorCode` (`cloudflare`, `captcha`, `rate_limited`, `read_failed`) and `stage` (`public_lookup`, `article_read`, `draft_lookup`, `unknown`). These fields identify which check blocked verification without recording page text, article body, HTML, cookies, or browser state. `result.attemptCount` remains the number of pre-click publishing attempts, not the length of `verificationTrace`.

A `verified` publish event must additionally carry the minimum public identity needed by the read-only Hermes watchdog:

```json
{
  "result": {
    "reasonCode": "published",
    "publishClickCount": 1,
    "publicVerification": "verified",
    "articleUrl": "https://ithelp.ithome.com.tw/articles/...",
    "title": "<exact published title>",
    "canonicalUrl": "https://<pages-host>/<repo>/day/12/"
  }
}
```

These fields are public metadata, not article content. They let Hermes verify the latest series entry and canonical link without reading the repository Markdown or receiving an iThome session.

A `verified` status missing any of these fields is invalid evidence. The unattended runner must convert it to an abnormal result instead of remaining silent, and Hermes must notify if malformed verified evidence reaches the event directory. A later complete verified event may supersede an earlier same-Day anomaly even when both timestamps have only second-level precision.

Never include body, cookies, session state, Telegram credentials, screenshots, HTML dumps, or secrets. Use `scripts/write-event.mjs --input <event.json>` only after `ITHOME_EVENT_DIR` is configured. It validates and atomically writes; it never sends Telegram or configures Hermes.

The unattended browser entrypoint may also keep a hidden `.publish-click-day-NN.receipt` file in the configured event directory. This is a local one-click interlock rather than a Hermes event; the watcher ignores it because it does not end in `.json`. It contains only Day, run ID, payload fingerprint, and recording time, and must be created exclusively before the DOM click.

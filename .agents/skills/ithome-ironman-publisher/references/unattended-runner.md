# Independent unattended publisher runner

## Why it is separate

Codex／Computer Use treats the final public publish action as representational communication and requires action-time confirmation. Project files cannot turn that platform rule off. Therefore the `publish-day` skill remains an attended recovery and manual-control path, not the scheduled publisher.

The unattended target is a separately installed local process that the user owns and authorizes outside Codex／Computer Use. It may use a dedicated browser profile or another locally approved iThome adapter. Its session, cookies, browser profile, and any credential material stay outside this repository and outside `/Users/Shared/ithome-ironman-bridge`.

## Runner contract

The reusable fail-closed decision core is `scripts/unattended-runner.mjs`. A separately reviewed local adapter supplies three functions:

1. `prepare(day)` creates a fresh repository payload.
2. `publish({ payload, fingerprint, runId })` performs all remote preflight and at most one publish action, then returns `verified`, `blocked`, `failed`, or `uncertain` with the same fingerprint.
3. `emit(event)` validates and atomically writes the minimal event to the configured event directory.

The adapter must audit the intended account, exact unique draft, title, canonical URL, sync line, public duplicate state, bootstrap state, and anti-automation／login state immediately before publishing. Missing, duplicate, mismatch, blocked, failed, uncertain, or stale evidence fails closed. It must never retry a publish click whose result is uncertain.

The adapter persists one hidden, non-overwritable per-Day click receipt in the configured event directory and records `publishClickCount = 1` immediately before dispatching the one allowed click, not after Playwright acknowledges it. An existing receipt blocks another DOM click even after a process restart. A receipt followed by a lost browser acknowledgement is therefore conservative evidence requiring read-only recovery; it is never safe to retry the publish click automatically. After dispatch, the adapter reads a fresh DOM snapshot to distinguish an accepted transition, a still-visible confirmation layer, a server error, or an unknown pending state. It never clicks a newly exposed confirmation control. It then performs at most three read-only verification attempts, five minutes apart, including after a lost browser acknowledgement, and requires both an exact public article match and disappearance of the exact draft before returning `verified`. These verification retries do not invoke `publishOnce` again.

The scheduled entrypoint makes at most three pre-click attempts, five minutes apart, for the narrow retryable reasons in `safety-policy.md`. It emits only the final result, with `attemptCount` and `retryLimitReached` where applicable. It never retries after a recorded click or an uncertain result. The core is silent only when the result is `verified`. Every final result still writes a machine-readable event so the Hermes watcher can deduplicate it. Hermes decides whether an anomaly needs Telegram relay; Hermes does not invoke the runner and does not hold iThome credentials.

Before connecting to Chrome, the local entrypoint validates the configured event directory as a direct directory and performs a temporary create/remove probe. This catches missing or non-writable sinks before any remote mutation.

## Playwright browser adapter

The repository includes two adapter layers:

- `scripts/browser-adapter.mjs` owns the fail-closed publish state machine. It checks verified bootstrap state, account／series identity, unique draft, public duplicate state, exact payload fields, one-click maximum, and post-click verification.
- `scripts/playwright-browser-driver.mjs` connects to a user-owned local Chrome through Playwright CDP. It never launches a replacement browser, exports cookies, copies the profile, or closes the user-owned Chrome process.

The local deployment must provide all of the following outside Git:

- a dedicated Chrome process started with an HTTP CDP endpoint bound to loopback only;
- a non-default user-data directory owned by the publisher user;
- an existing login to the intended iThome account;
- the exact draft-list URL and public article-list URL for that account;
- the expected account name, full registered series title, and contest tag.

The driver refuses non-loopback CDP endpoints and non-iThome workflow URLs. An ordinary Chrome window without an enabled CDP endpoint cannot be attached. Do not expose the CDP port to the LAN, copy the Computer Use profile, or commit local URLs／profile paths.

For interactive login or anti-automation recovery, run `examples/macos/open-login-chrome.zsh` with the same `ITHOME_CHROME_PROFILE`, `ITHOME_DRAFTS_URL`, and optional `ITHOME_CDP_PORT` used by the scheduled runner. This opens the isolated publisher profile in a visible Chrome window without invoking the publisher or clicking publish. Finish login or the browser challenge manually, then leave that profile available for the next scheduled preflight. Do not substitute the everyday default Chrome profile.

The scheduled publisher owns its complete cold-start path at 09:30: start the dedicated visible Chrome profile when needed, wait a bounded time for CDP, and always continue into the runner so a startup／connection failure becomes a machine-readable event. The same run then checks Cloudflare, login, account, draft, public duplicate state, publish interlock, the single click, and public verification. Do not install a separate prewarm schedule; it creates a second success signal that does not prove publish readiness.

Every abnormal publish result carries a `result.phase`. Hermes includes the human-readable phase and `reasonCode` in its notification. Browser startup and connection failures must not terminate only in the shell wrapper, because that would bypass event emission.

## Current readiness

The decision core, Playwright browser adapter, scheduled Day lookup, and event／watcher contracts are repository-controlled and covered by tests. Reusable macOS wrapper and LaunchAgent examples are available under `examples/macos/`.

The examples deliberately contain placeholders instead of account-specific paths. A local installation must still provide its own isolated Chrome profile, iThome URLs, event paths, service registration, and live acceptance. Repository files alone do not prove that unattended publishing is enabled on any host.

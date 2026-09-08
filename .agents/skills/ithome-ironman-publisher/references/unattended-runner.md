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

The core is silent only when the result is `verified`. Every result still writes a machine-readable event so the Hermes watcher can deduplicate it. Hermes decides whether an anomaly needs Telegram relay; Hermes does not invoke the runner and does not hold iThome credentials.

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

## Current readiness

The decision core, Playwright browser adapter, scheduled Day lookup, and event／watcher contracts are repository-controlled and covered by tests. Reusable macOS wrapper and LaunchAgent examples are available under `examples/macos/`.

The examples deliberately contain placeholders instead of account-specific paths. A local installation must still provide its own isolated Chrome profile, iThome URLs, event paths, service registration, and live acceptance. Repository files alone do not prove that unattended publishing is enabled on any host.

# Automation topology

Use this reference when installing, documenting, or auditing scheduled publishing and public verification. Repository examples are templates only: they do not grant authority to publish, install services, change notification credentials, or copy local browser state.

## Roles

| Component | Owns | Must not own | Desktop requirement |
| --- | --- | --- | --- |
| Local Playwright publisher | Fresh payload, dedicated Chrome CDP session, single publish click, immutable receipt and event | Telegram credentials or repeated post-click publishing | Logged-in user session and dedicated Chrome; validate lock／sleep behavior locally |
| Public-series watchdog | Public series／RSS and article-page verification, private deduplication state | iThome login, cookies, drafts, publish controls | None; background HTTPS works while the screen is locked |
| Hermes | Scheduled reminder／watchdog execution and relay through its existing Gateway | iThome session or a second Telegram poller | None beyond its own service runtime |
| Codex heartbeat | Optional read-only recovery orchestration and user-facing escalation | A second publish click, credentials, or permanent service ownership | Background verification needs no GUI; Computer Use fallback requires an unlocked desktop |
| Computer Use | Attended, read-only UI recovery when public HTTP evidence is insufficient | Unattended publishing or operation through a locked desktop | Unlocked graphical session |

## Recommended combinations

### Minimal unattended publication

Install the 09:30 Playwright publisher and the separate 19:00／22:30 background public watchdog. An anomaly is written to logs; no Telegram component is required.

### Notification deployment

Keep the publisher under the publishing account. Run 09:00 reminder plus 19:00／22:30 checks under Hermes, pipe non-empty notifier output through the existing Gateway, and keep Hermes state private. Do not create another Telegram poller.

### Assisted recovery

Add the Codex heartbeat example only when periodic recovery is useful. It first uses the same public HTTPS／RSS evidence as the watchdog. Computer Use is a last fallback when the Mac is unlocked. Once a Day has been reported verified, that Day is terminal: later heartbeats must not re-read an older `uncertain` event or repeat network／browser checks.

## Evidence priority

1. Complete verified publisher event for the scheduled Day.
2. `public-watchdog-state.json.lastVerified` for the same Day and date.
3. Fresh public verification from scheduled metadata, verified bootstrap identity, official series page or RSS, and the article page.
4. Read-only Computer Use inspection, only when public evidence is insufficient and the desktop is unlocked.

An immutable `.publish-click-day-NN.receipt` always blocks another publish click. Public verification may close an earlier `post_publish_unverified` observation, but it must not delete or rewrite the original event or receipt.

## Scheduling rules

- Read the Day from `ithome.config.json`; never infer it from the clock or series order.
- Treat `Asia/Taipei` as an explicit deployment requirement. `LaunchAgent` uses the Mac's local time zone; other schedulers must expose and verify their time zone.
- Screen lock and system sleep are different. Background HTTPS checks work while locked; sleep may defer work until wake.
- Only one component writes each state file. Publisher events are immutable; watcher state is private to the watcher account.
- The first verified public-series result for a Day is relayed once by Hermes with the article URL; later checkpoints for the same Day stay silent. Distinguish article mismatch from an exhausted public-page read failure.
- A verified Day is a stopping condition for that Day. Resume only for the next scheduled Day.

## Repository examples

- macOS publisher: `examples/macos/run-publisher.zsh` and `com.example.ithome-ironman-publisher.plist`
- screen-lock-safe verifier: `examples/macos/run-public-watchdog.zsh` and the two public-watchdog plist files
- Codex recovery heartbeat: `examples/codex/public-verification-heartbeat.md`

Copy rendered runtime files outside Git. Replace placeholders locally and validate shell／plist syntax before requesting separate installation authorization.

# Codex public-verification heartbeat example

This is a prompt template, not an installed automation. Replace every `<...>` value locally. Do not commit rendered absolute paths or private state.

Suggested schedule: hourly from 10:00 through 23:00, `Asia/Taipei`, ending after the configured Day 30 date. Verify the scheduler's displayed next-run time; do not assume an RRULE hour is interpreted in the desired time zone.

```text
During the configured iThome competition dates, perform read-only post-publish recovery for the Day explicitly listed for today in <REPO_ABSOLUTE_PATH>/ithome.config.json.

Read <EVENT_DIR> and the per-Day publish-click receipt. Follow <REPO_ABSOLUTE_PATH>/.agents/skills/ithome-ironman-publisher/SKILL.md. A receipt or publishClickCount=1 permanently forbids another publish click. Never delete or rewrite events or receipts.

Before doing any work, apply the Day stopping condition. If this Codex task already notified the user that today's Day is verified, or <PUBLIC_WATCHDOG_STATE> contains lastVerified for the same Day and date, stay silent and do not re-read old uncertain events, fetch public pages, or open a browser.

If the Day is not yet verified and the final event is uncertain／post_publish_unverified, verify in the background without GUI: obtain fresh scheduled metadata from the repo, read the verified bootstrap at <BOOTSTRAP_STATE>, fetch the verified series page with official RSS fallback, locate one unique matching article, and verify the exact publication date and canonical URL on the article page. Use only HTTPS iThome URLs and the exact canonical URL from the repo. Do not use cookies, browser profiles, or login state.

Use Computer Use only when public HTTP evidence is insufficient and the desktop is already unlocked. It is read-only fallback: do not operate drafts, comments, edit controls, delete controls, or publish controls. Do not ask the user to unlock the Mac for a routine check unless the final 23:00 check still lacks sufficient public evidence.

Notify once when the Day is confirmed public and include the article URL. That notification makes the Day terminal. Otherwise stay quiet until a concrete user action is needed or the 23:00 final check remains unresolved. Do not create a Telegram poller or send Telegram directly.
```

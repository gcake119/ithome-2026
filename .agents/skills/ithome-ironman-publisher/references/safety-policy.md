# Safety policy

## Content and Day authority

- `src/content/ironman/day-NN.md` is the only article source.
- Obtain `title`, `body`, and `canonicalUrl` only from a fresh `pnpm ithome:prepare -- --day N --json` result.
- Do not parse Markdown, reconstruct frontmatter, edit payload text, add the sync line, normalize punctuation, or reuse a saved body.
- Paste the entire payload `body`; it already contains the iThome-only sync line. Never write that line back to Markdown.
- Day must come from an explicit `--day N` or explicit external schedule value. Accept integers 1–30 only; never infer it from date, title, order, URL, or series progress.
- `--all` is valid only for inventory, import, and repair. Remote import or repair `--all` remains blocked until live UI evidence proves multiple future-Day drafts can coexist before or after bootstrap.

## Remote mutation

- Never delete any draft, overwrite a conflicting draft, or modify a public article.
- `repair-drafts` creates only entries classified as `missing` by a fresh reliable audit.
- `publish-day` never creates a draft.
- A run may execute at most one publish click. Record the click count immediately after it, before interpreting the result.
- Never guess, search-synthesize, or borrow a series ID. Day 1 obtains it only from the verified series link above the public article title. Day 2–30 require verified bootstrap state.

## Stop immediately

Stop without automatic retry for Cloudflare, CAPTCHA, anti-bot warnings, Too Many Requests, HTTP 429, login expiry, unexpected account, unconfirmed series, incomplete pagination, unreadable UI, uncertain save or publish results, changed UI workflow, invalid or changed repo payload, missing or invalid required bootstrap state, or any mutation that would be needed to resolve a duplicate or mismatch.

Do not change IP, clear cookies to evade controls, switch automation engines, solve a CAPTCHA, or repeatedly reload to bypass the stop condition.

## Secrets and notification boundary

- Keep iThome session state and cookies outside the repository and events.
- Hermes never receives iThome session data or article bodies.
- Codex never receives Telegram credentials and never sends Telegram directly.
- Machine-readable events contain minimum necessary status only.

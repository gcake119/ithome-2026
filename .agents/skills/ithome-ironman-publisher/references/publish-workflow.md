# Publish workflow

## Day 1 bootstrap publish

```text
REPO_PREFLIGHT → AUDIT_DRAFT → PRE_BOOTSTRAP_PUBLIC_CHECK
→ READY_FOR_CONFIRMATION → PUBLISH_CLICKED → VERIFY_DAY1_ARTICLE
→ EXTRACT_SERIES_LINK → VERIFY_SERIES → WRITE_BOOTSTRAP_STATE
→ BOOTSTRAPPED | BOOTSTRAP_INCOMPLETE
```

Before Day 1, no public series page exists. Do not fail merely because bootstrap state or series URL is absent. Confirm no Day 1 public article from reliable available surfaces, then apply the common draft and click gates.

After the single click, verify the Day 1 article first. Then follow [bootstrap-state.md](bootstrap-state.md): obtain the series link above the public article title, verify the full series title and series page, record `articleUrl`, `seriesUrl`, `seriesId`, and `publishedAt`, and atomically write verified state.

If the article is verified but series identity is not, publishing succeeded but bootstrap is incomplete. Stop without another click and emit an abnormal bootstrap event.

## Day 2–30 normal publish

```text
LOAD_BOOTSTRAP_STATE → REPO_PREFLIGHT → AUDIT_DRAFT → AUDIT_SERIES_PUBLIC
→ READY_FOR_CONFIRMATION → PUBLISH_CLICKED → VERIFY_ON_SERIES_PAGE
→ VERIFIED | UNCERTAIN
```

Load and validate verified bootstrap state before opening the publish control. Missing or invalid state blocks the run. Use its series URL for the public duplicate guard and post-publish verification.

All common preflight gates must pass: explicit valid Day, valid fresh payload, confirmed account and registered topic, exactly one matching draft, exact title and sync line, draft status, no matching public article on the available verified surface, and this run's publish click count equals zero.

If the draft is missing, stop with `draft_missing` and suggest a separate `repair-drafts --day N` run. Never switch mode implicitly.

Open the verified draft and prepare the publish menu. Immediately before the final publish action, ask for confirmation naming the Day, exact title, canonical URL, and zero click count. After confirmation, click once and immediately record `publishClickCount = 1` before interpreting any navigation, toast, timeout, or error.

After that one click, inspect a fresh DOM snapshot and classify it as accepted, confirmation still required, server error, or pending. A newly exposed confirmation control is evidence, not permission for a second click; keep the receipt, continue only with bounded read-only checks, and report an explicit uncertain result if publication cannot be proven.

Verify the public page for exact Day, title, and canonical sync line, and independently verify that the exact draft no longer exists. Report `verified` only when both observations agree. The unattended adapter uses six read-only attempts separated by five seconds. If the result remains uncertain, stop and do not click again. A later run must audit public and draft state before any decision.

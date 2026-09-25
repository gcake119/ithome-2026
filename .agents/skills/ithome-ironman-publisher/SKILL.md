---
name: ithome-ironman-publisher
description: Audit, import, repair, and publish a configured iThome Ironman series using repo-generated payloads.
---

# iThome Ironman Publisher

Operate the 2026 iThome series without an iThome API. The repository is the content source of truth; Computer Use only transfers verified payloads to or reads state from the iThome UI.

## Modes

Accept exactly one mode per run:

- `inventory [--day N | --all]`: validate repo payloads without opening iThome.
- `audit-drafts [--day N]`: inspect drafts and public series state; never mutate.
- `import-drafts (--day N | --all)`: create only missing drafts and save them as drafts. `--all` is capability-gated until the live UI proves multiple future-Day drafts can coexist.
- `repair-drafts (--day N | --all)`: audit, create only confirmed missing drafts, then audit again.
- `publish-day --day N`: publish one existing, unique, verified draft. Day 1 also bootstraps the public series identity; Day 2–30 require verified bootstrap state. Never create a draft in this mode.
- `status`: summarize local run evidence only; never present it as current iThome state.

Reject missing, invalid, inferred, or out-of-range Day values. `--all` means the target set is Day 01–30, not permission for an unbounded high-speed loop.

## Required references

Read only what the selected mode needs:

- Always read [references/safety-policy.md](references/safety-policy.md) and [references/payload-contract.md](references/payload-contract.md).
- When setting up a cloned repository or the Codex-to-Hermes bridge, read [references/local-configuration.md](references/local-configuration.md).
- For audit, import, or repair, read [references/audit-and-repair.md](references/audit-and-repair.md).
- For publish, read [references/publish-workflow.md](references/publish-workflow.md).
- For Day 1 publish, Day 2–30 publish preflight, or series identity handling, read [references/bootstrap-state.md](references/bootstrap-state.md).
- Before any iThome UI action, read [references/ui-workflows.md](references/ui-workflows.md) and load the installed `computer-use` skill.
- When emitting machine-readable results, read [references/event-contract.md](references/event-contract.md).
- When integrating the Hermes notification consumer, read [references/hermes-watcher.md](references/hermes-watcher.md). This does not authorize installing a schedule, restarting Hermes, or sending Telegram.
- When evaluating unattended publishing, read [references/unattended-runner.md](references/unattended-runner.md). The Codex／Computer Use publish mode remains confirmation-gated.
- When installing or auditing schedules across the local publisher, public watchdog, Hermes, Codex heartbeat, or Computer Use fallback, read [references/automation-topology.md](references/automation-topology.md).

## Common workflow

1. Confirm the current working directory contains `ithome.config.json` and the configured article sources.
2. Record the selected mode, explicit Day target, and a new run ID.
3. Build a fresh payload with `pnpm ithome:prepare -- --day N --json`, or use `scripts/build-inventory.mjs` for deterministic validation.
4. Run the mode-specific preflight. Fail closed on incomplete or ambiguous evidence.
5. For Computer Use, inspect fresh UI state after every navigation or mutation. Never reuse stale element indices.
6. Report observed facts, actions taken, actions not taken, and any uncertainty.
7. Emit a validated event only when an event directory has already been configured. Event emission is not Telegram delivery.

## Authorization boundary

Import and repair may save drafts when explicitly requested. Publishing is representational communication: prepare everything, then request confirmation immediately before the one allowed publish click. A schedule or `--day` value does not remove this action-time confirmation.

Repository instructions cannot weaken Codex or Computer Use platform policy. Do not describe `publish-day` as unattended or use a prompt, schedule, environment variable, or wrapper to suppress its required action-time confirmation. Unattended publishing, when separately authorized and accepted, belongs to an independent local runner outside Computer Use; that runner owns its local iThome session and emits the same minimal event contract. Hermes remains a read-only event consumer and never receives iThome credentials.

Never delete a draft, overwrite a conflicting draft, modify a public article, bypass anti-automation controls, acquire Telegram credentials, or operate Hermes.

Never guess a public series ID. Before Day 1 is published, identify drafts only by the exact contest category, full registered topic title, and contest tag. After Day 1 bootstrap, use only the verified series state.

## Distribution boundary

This is a project-local skill distributed with the repository under `.agents/skills/`. Do not assume a clone has the original author's macOS account, shared directories, browser profile, login session, or Hermes installation. Local paths and cross-user permissions require explicit setup; secrets and runtime state remain untracked.

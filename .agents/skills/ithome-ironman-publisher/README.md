# iThome Ironman Publisher skill

Project-local Codex skill for safely preparing, auditing, importing, repairing, and publishing the 2026 iThome Ironman series maintained in this repository.

The repository is the article source of truth. The skill does not use an iThome API, does not store browser credentials, and does not let a notification worker operate iThome.

## Repository layout

```text
.agents/skills/ithome-ironman-publisher/
├── SKILL.md
├── agents/openai.yaml
├── references/
└── scripts/
```

- `SKILL.md` routes modes and defines authorization boundaries.
- `references/` contains mode-specific safety, payload, UI, event, and bootstrap contracts.
- `scripts/` contains deterministic validation, the unattended browser adapter, and atomic state-writing helpers.
- `agents/openai.yaml` provides Codex UI metadata and permits normal skill discovery.

## Requirements

- A clone or fork of this template, with `ithome.config.json` initialized.
- Node.js and the pnpm version declared by the repository.
- Codex with the project-local `.agents/skills/` convention and Computer Use support.
- A user-controlled browser session already logged in to the intended iThome account for live UI modes.

No browser session, cookie, Telegram credential, article body, or generated runtime state belongs in Git.

## Use

Open this repository as the Codex project and invoke `$ithome-ironman-publisher` with one explicit mode, for example:

```text
Use $ithome-ironman-publisher to run inventory --day 4.
Use $ithome-ironman-publisher to run audit-drafts.
```

Live import, repair, and publish operations retain the confirmation and stop conditions in `SKILL.md` and `references/safety-policy.md`. Invoking a mode is not blanket permission to publish, overwrite, delete, bypass anti-automation controls, or configure notifications.

Codex／Computer Use cannot be made unattended by repository instructions because the final public publish action remains subject to platform action-time confirmation. The compliant unattended path is the separate local-runner contract documented in `references/unattended-runner.md`. Its Playwright browser adapter, scheduled Day lookup, and reusable macOS LaunchAgent examples are repository-controlled and tested; the dedicated Chrome profile, rendered local paths, service registration, and live acceptance remain local deployment work.

## Local configuration

Read `references/local-configuration.md` before enabling event exchange or Day 1 bootstrap state. Runtime paths are configured locally and must not be committed.

The skill emits machine-readable results only. A Hermes installation or another notification consumer is a separate component with separate credentials and permissions.

The public-series watchdog itself does not require an unlocked desktop or browser session. Forks can install the reusable macOS background wrapper and the separate 19:00／22:30 `LaunchAgent` examples under `examples/macos/`; see `references/hermes-watcher.md`. Screen lock is supported because the verifier uses public HTTPS／RSS only, while system sleep may defer the job until wake.

For the complete supported combinations across the local publisher, background watchdog, Hermes, Codex heartbeat, and Computer Use fallback, read `references/automation-topology.md`. A reusable heartbeat prompt is provided under `examples/codex/`; it is not installed automatically and retains the same post-click safety boundary.

## Validation

From the repository root:

```bash
pnpm install
pnpm test:ithome
```

For structural validation of the skill package, run Codex's bundled `quick_validate.py` against this directory.

## Scope

This package intentionally remains specific to this repository's series identity, payload producer, and canonical URL contract. Forks should update those contracts and their tests together instead of silently overriding them through prompts or environment variables.

## License

This skill is distributed with the repository under the [MIT License](../../../LICENSE).

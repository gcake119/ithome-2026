# Payload contract

For Day N, run from the repository root:

```bash
pnpm ithome:prepare -- --day N --json
```

Required fields and invariants:

- `day` equals the explicit requested Day.
- `dayString` equals the zero-padded Day.
- `sourcePath` equals `src/content/ironman/day-NN.md`.
- `title` and `body` are non-empty strings.
- `canonicalUrl` exactly equals `<githubPages.publicUrl>/day/NN/` from `ithome.config.json`.
- `syncLine` exactly equals `本文同步刊載於[個人連載網站](<canonicalUrl>)`.
- The first line of `body` exactly equals `syncLine`.
- Treat the Markdown syntax as part of the payload contract. A bare URL or altered link label is a mismatch.

Additional fields are allowed. Do not proceed when validation fails.

Use the deterministic helper when useful:

```bash
node .agents/skills/ithome-ironman-publisher/scripts/build-inventory.mjs --day N
node .agents/skills/ithome-ironman-publisher/scripts/build-inventory.mjs --all
```

It calls the repo producer and never reads or transforms Markdown itself. `--all` must validate all 30 payloads before a full import. Its SHA-256 fingerprint detects local payload changes; it does not prove a remote draft is correct.

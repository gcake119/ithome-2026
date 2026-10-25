#!/usr/bin/env bash
# Local verification/build only. Never invoke the browser publisher or watchdog.
set -euo pipefail
pnpm install --frozen-lockfile --ignore-scripts
for day in $(seq 1 30); do
  pnpm ithome:prepare -- --day "$day" --json > /dev/null
done
pnpm test:ithome
pnpm check
pnpm build
pnpm verify:public

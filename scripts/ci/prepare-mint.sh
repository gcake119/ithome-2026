#!/usr/bin/env bash
set -euo pipefail
[[ -d ${RUNNER_TEMP:-} && ${GITHUB_RUN_ID:-} =~ ^[0-9]+$ && ${GITHUB_RUN_ATTEMPT:-} =~ ^[0-9]+$ ]] || exit 1
case ${RUNNER_ENVIRONMENT:-} in
  self-hosted)
    [[ $(id -un) == ci-runner && ${GITHUB_REPOSITORY:-} == gcake119/ithome-2026 && ${RUNNER_NAME:-} == mint-ithome-2026 ]] || exit 1
    [[ ${DOCKER_HOST:-} == unix:///run/user/995/docker.sock && -S /run/user/995/docker.sock ]] || exit 1
    docker info --format '{{range .SecurityOptions}}{{println .}}{{end}}' | grep -Fx name=rootless >/dev/null
    for tool in /usr/local/bin/ci-resource-slot /usr/local/bin/ci-build-lock; do
      [[ -x $tool && ! -w $tool && $(stat -c '%u:%a' "$tool") == 0:755 ]] || exit 1
    done
    for protected in /home/yi-chun /media/yi-chun/DATA_2TB /media/yi-chun/BACKUP_4T1; do
      [[ ! -r $protected && ! -w $protected && ! -x $protected ]] || exit 1
    done
    [[ ! -w /var/run/docker.sock ]] || exit 1
    python3 - <<'CHECK'
from pathlib import Path
root=Path('/sys/fs/cgroup/user.slice/user-995.slice')
quota,period=(root/'cpu.max').read_text().split()
assert int(quota)/int(period)==3
assert int((root/'memory.high').read_text())==16*1024**3
assert int((root/'memory.max').read_text())==20*1024**3
assert int((root/'pids.max').read_text())==4096
assert '/user.slice/user-995.slice/' in Path('/proc/self/cgroup').read_text()
print('Shared CPU300%, MemoryHigh16GiB/Max20GiB, Tasks4096 verified')
CHECK
    cache=/var/lib/github-runner/toolcache
    [[ -d $cache/node ]] || exit 1
    { echo "RUNNER_TOOL_CACHE=$cache"; echo "AGENT_TOOLSDIRECTORY=$cache"; } >> "${GITHUB_ENV:?}"
    ;;
  github-hosted) ;;
  *) exit 1 ;;
esac
printf 'npm_config_store_dir=%s/ithome-store-%s-%s\n' "$RUNNER_TEMP" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" >> "${GITHUB_ENV:?}"

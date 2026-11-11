import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('GitHub Pages deployment schedule', () => {
  it('rebuilds every day at 00:15 Asia/Taipei', async () => {
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');

    expect(workflow).toContain("cron: '15 0 * * *'");
    expect(workflow).toContain("timezone: 'Asia/Taipei'");
  });

  it('routes builds to Mint with source admission and keeps Pages deployment on GitHub', async () => {
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');

    const build = workflow.split('\n  build:\n')[1].split('\n  deploy:\n')[0];
    const deploy = workflow.split('\n  deploy:\n')[1];
    expect(build).toContain("github.repository == 'gcake119/ithome-2026'");
    expect(build).toContain("github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository");
    expect(build).toContain('runs-on: ["self-hosted", "Linux", "X64", "repo-ithome-2026"]');
    expect(build).toContain('CI_SOURCE_REQUIRES_ISOLATED_SELF_HOSTED_RUNNER');
    expect(build).not.toContain('pages: write');
    expect(build).not.toContain('id-token: write');
    expect(deploy).toContain('runs-on: ubuntu-24.04');
    expect(deploy).toContain("github.ref == 'refs/heads/main' && github.event_name != 'pull_request' && inputs.build_only != true");
    expect(deploy).toContain('pages: write');
    expect(deploy).toContain('id-token: write');
    expect(build).not.toMatch(/runs-on:.*ubuntu-/);
    expect(workflow).toContain('uses: pnpm/action-setup@v6');
    expect(workflow).toContain('uses: actions/configure-pages@v6');
    expect(workflow).toContain('uses: actions/upload-pages-artifact@v5');
    expect(workflow).toContain('uses: actions/deploy-pages@v5');
  });
});

it('provisions a complete Node toolchain before pnpm bootstrap on Mint', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const directory = mkdtempSync(join(tmpdir(), 'ithome-npm-bootstrap-'));
  try {
    // The runner's bundled npm lacks this module, matching the real failed job.
    writeFileSync(join(directory, 'npm'), `#!${process.execPath}\nrequire('../lib/cli.js');\n`, { mode: 0o755 });
    let toolPath = `${directory}:${process.env.PATH}`;
    const npm = () => spawnSync('npm', ['--version'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, PATH: toolPath } });
    expect(npm().status).not.toBe(0);
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');
    const build = workflow.split('\n  build:\n')[1].split('\n  deploy:\n')[0];
    let bootstrapped = false;
    for (const step of build.split(/(?=^      - )/m)) {
      if (step.includes('uses: actions/setup-node@')) {
        expect(step).toContain('node-version: 24');
        if (!bootstrapped) {
          expect(step).not.toMatch(/cache:\s+pnpm/);
          expect(step).toContain('package-manager-cache: false');
        }
        toolPath = `${dirname(process.execPath)}:${toolPath}`;
      }
      if (step.includes('uses: pnpm/action-setup@')) {
        const result = npm();
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toMatch(/^\d+\.\d+\.\d+\s*$/);
        expect(step).toContain('cache: true');
        bootstrapped = true;
      }
    }
    expect(bootstrapped).toBe(true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('reserves queue plus original runtime and cleanup without extending the build command', async () => {
  const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');
  const build = workflow.split('\n  build:\n')[1].split('\n  deploy:\n')[0];
  const [, extended, original] = build.match(/timeout-minutes: \$\{\{.* && (\d+) \|\| (\d+) \}\}/);
  const budget = Number(build.match(/--job-wait-budget (\d+)/)[1]);
  expect(Number(extended)).toBeGreaterThanOrEqual(budget / 60 + Number(original) + 10);
  expect(Number(extended)).toBeLessThanOrEqual(360);
  expect(build).toContain('-- timeout 15m bash scripts/ci/build.sh');
});

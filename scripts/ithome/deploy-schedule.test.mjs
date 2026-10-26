import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('GitHub Pages deployment schedule', () => {
  it('rebuilds every day at 00:15 Asia/Taipei', async () => {
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');

    expect(workflow).toContain("cron: '15 0 * * *'");
    expect(workflow).toContain("timezone: 'Asia/Taipei'");
  });

  it('routes trusted builds to Mint and keeps fork builds and deployment on pinned Ubuntu', async () => {
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');

    const build = workflow.split('\n  build:\n')[1].split('\n  deploy:\n')[0];
    const deploy = workflow.split('\n  deploy:\n')[1];
    expect(build).toContain("github.repository == 'gcake119/ithome-2026'");
    expect(build).toContain("github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository");
    expect(build).toContain(`fromJSON('["self-hosted","Linux","X64","repo-ithome-2026"]') || 'ubuntu-24.04'`);
    expect(build).not.toContain('pages: write');
    expect(build).not.toContain('id-token: write');
    expect(deploy).toContain('runs-on: ubuntu-24.04');
    expect(deploy).toContain("github.ref == 'refs/heads/main' && github.event_name != 'pull_request' && inputs.build_only != true");
    expect(deploy).toContain('pages: write');
    expect(deploy).toContain('id-token: write');
    expect(workflow).not.toContain('ubuntu-latest');
    expect(workflow).toContain('uses: pnpm/action-setup@v6');
    expect(workflow).toContain('uses: actions/configure-pages@v6');
    expect(workflow).toContain('uses: actions/upload-pages-artifact@v5');
    expect(workflow).toContain('uses: actions/deploy-pages@v5');
  });
});

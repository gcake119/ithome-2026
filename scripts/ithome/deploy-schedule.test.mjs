import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('GitHub Pages deployment schedule', () => {
  it('rebuilds every day at 00:15 Asia/Taipei', async () => {
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');

    expect(workflow).toContain("cron: '15 0 * * *'");
    expect(workflow).toContain("timezone: 'Asia/Taipei'");
  });

  it('pins the runner and Pages actions to Node.js 24 compatible versions', async () => {
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');

    expect(workflow.match(/runs-on: ubuntu-24\.04/g)).toHaveLength(2);
    expect(workflow).not.toContain('ubuntu-latest');
    expect(workflow).toContain('uses: pnpm/action-setup@v6');
    expect(workflow).toContain('uses: actions/configure-pages@v6');
    expect(workflow).toContain('uses: actions/upload-pages-artifact@v5');
    expect(workflow).toContain('uses: actions/deploy-pages@v5');
  });
});

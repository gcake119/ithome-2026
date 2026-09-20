import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildProjectConfig, runInteractiveSetup, runNonInteractiveSetup, writeProjectConfig } from './setup.mjs';
import { isSafePublicAssetPath, validateProjectConfig } from './config.mjs';

const input = {
  account: 'example-user', seriesTitle: '我的三十天系列', contestTag: '18th鐵人賽',
  contest: '18th-ironman-2026', day1Date: '2026-09-01',
  githubOwner: 'example-user', githubRepo: 'my-ironman',
};

describe('iThome template setup schemaVersion 2', () => {
  test('creates an explicit 30-day publication and reusable defaults', () => {
    const config = buildProjectConfig(input);
    expect(config.schemaVersion).toBe(2);
    expect(config.publication.schedule).toHaveLength(30);
    expect(config.publication.schedule[0]).toEqual({ day: 1, date: '2026-09-01' });
    expect(config.publication.schedule[29]).toEqual({ day: 30, date: '2026-09-30' });
    expect(config.learningMap.sections.map((item) => item.id)).toEqual(['foundation', 'practice', 'reflection']);
    expect(config.githubPages.publicUrl).toBe('https://example-user.github.io/my-ironman');
    expect(config.seo).toEqual({
      siteName: '我的三十天系列',
      authorName: 'example-user',
      socialImage: 'assets/ai-collaboration-mark.png',
    });
    expect(config.learningMap.sections.every((item) => item.articleContext)).toBe(true);
  });

  test('rejects ambiguous dates and secret-like values', () => {
    expect(() => buildProjectConfig({ ...input, day1Date: '開賽日' })).toThrow(/YYYY-MM-DD/);
    expect(() => buildProjectConfig({ ...input, seriesTitle: 'token=secret-value' })).toThrow(/秘密|secret/i);
  });

  test.each([
    ['/Users/example/logo.png', false], ['../logo.png', false],
    ['https://example.com/logo.png', false], ['assets/series-mark.png', true],
  ])('validates public-relative asset path %s', (value, expected) => {
    expect(isSafePublicAssetPath(value)).toBe(expected);
  });

  test('rejects duplicate learning-map sections and tampered schedule', () => {
    const config = buildProjectConfig(input);
    config.learningMap.sections[1].id = 'foundation';
    config.publication.schedule[12].date = '2026-12-31';
    const errors = validateProjectConfig(config, { requireInitialized: true });
    expect(errors.join('\n')).toMatch(/duplicate:foundation/);
    expect(errors).toContain('publication.schedule');
  });

  test('is rerunnable and writes only nested public settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ithome-setup-'));
    const target = join(root, 'ithome.config.json');
    await writeProjectConfig(target, buildProjectConfig(input));
    await writeProjectConfig(target, buildProjectConfig(input));
    const result = JSON.parse(await readFile(target, 'utf8'));
    expect(result.publication.account).toBe('example-user');
    expect(result.account).toBeUndefined();
  });

  test('quick mode explains formats, previews groups, and writes after yes', async () => {
    const answers = ['', 'example-user', '我的三十天系列', '18th鐵人賽', '18th-ironman-2026', '2026-09-01', 'example-user', 'my-ironman', 'yes'];
    const prompts = []; const output = []; const written = [];
    const result = await runInteractiveSetup({
      ask: async (prompt) => { prompts.push(prompt); return answers.shift(); },
      output: (line) => output.push(line), write: async (config) => written.push(config),
    });
    expect(prompts.join('\n')).toContain('YYYY-MM-DD');
    expect(prompts.join('\n')).toContain('只輸入 repo 名稱');
    expect(output.join('\n')).toContain('【學習地圖】'.replace('【學習地圖】', '【網站與學習地圖】'));
    expect(output.join('\n')).toContain('Day 30：2026-09-30');
    expect(written).toHaveLength(1);
    expect(result.status).toBe('configured');
  });

  test('invalid date retries only that prompt and decline leaves target unchanged', async () => {
    const answers = ['', 'a', '系列', 'tag', 'contest', '開賽日', '2026-09-01', 'owner', 'repo', 'no'];
    const prompts = []; const output = [];
    const root = await mkdtemp(join(tmpdir(), 'ithome-decline-'));
    const target = join(root, 'config.json');
    await writeFile(target, 'unchanged\n');
    const result = await runInteractiveSetup({
      ask: async (prompt) => { prompts.push(prompt); return answers.shift(); },
      output: (line) => output.push(line), write: async (config) => writeProjectConfig(target, config),
    });
    expect(prompts.filter((prompt) => prompt.includes('Day 1 日期'))).toHaveLength(2);
    expect(output.join('\n')).toContain('日期必須是有效的 YYYY-MM-DD');
    expect(await readFile(target, 'utf8')).toBe('unchanged\n');
    expect(result).toEqual({ status: 'cancelled' });
  });

  test('full mode explains public asset mapping and validates existing defaults', async () => {
    const answers = ['full', 'a', '系列', 'tag', 'contest', '2026-09-01', 'owner', 'repo', '', '', '', '', '', '', '', '', 'yes'];
    const prompts = []; const written = [];
    const result = await runInteractiveSetup({
      ask: async (prompt) => { prompts.push(prompt); return answers.shift(); },
      output: () => {}, write: async (config) => written.push(config),
    });
    expect(prompts.join('\n')).toContain('public/assets/series-mark.png');
    expect(prompts.join('\n')).toContain('不可使用網址、絕對路徑或 ../');
    expect(written[0].brand.mark.light).toBe('assets/ai-collaboration-mark.png');
    expect(written[0].seo.socialImage).toBe('assets/ai-collaboration-mark.png');
    expect(result.status).toBe('configured');
  });

  test('Agent preview returns the complete candidate without writing', async () => {
    const written = [];
    const result = await runNonInteractiveSetup([
      '--', '--preview',
      '--account', 'example-user',
      '--series-title', '我的三十天系列',
      '--contest-tag', '18th鐵人賽',
      '--contest', '18th-ironman-2026',
      '--day1-date', '2026-09-01',
      '--github-owner', 'example-user',
      '--github-repo', 'my-ironman',
      '--site-tagline', '從問題到作品的三十天',
      '--home-kicker', '2026 iThome 鐵人賽',
      '--home-lead', '這是首頁導言。',
      '--home-summary', '這是首頁摘要。',
      '--seo-site-name', '三十天 Agent 實作誌',
      '--seo-author-name', '公開作者',
      '--seo-social-image', 'assets/ai-collaboration-mark.png',
      '--brand-light', 'assets/ai-collaboration-mark.png',
      '--brand-dark', 'assets/ai-collaboration-mark-dark.png',
      '--brand-alt', '系列標誌',
    ], { write: async (config) => written.push(config) });

    expect(result.status).toBe('preview');
    expect(result.config.site).toMatchObject({
      tagline: '從問題到作品的三十天',
      home: { kicker: '2026 iThome 鐵人賽', lead: '這是首頁導言。', summary: '這是首頁摘要。' },
    });
    expect(result.config.seo).toEqual({
      siteName: '三十天 Agent 實作誌', authorName: '公開作者', socialImage: 'assets/ai-collaboration-mark.png',
    });
    expect(result.config.brand.mark).toMatchObject({
      light: 'assets/ai-collaboration-mark.png', dark: 'assets/ai-collaboration-mark-dark.png', alt: '系列標誌',
    });
    expect(written).toHaveLength(0);
  });

  test('Agent write requires the explicit --write action', async () => {
    const args = [
      '--write', '--account', 'example-user', '--series-title', '我的三十天系列',
      '--contest-tag', '18th鐵人賽', '--contest', '18th-ironman-2026',
      '--day1-date', '2026-09-01', '--github-owner', 'example-user', '--github-repo', 'my-ironman',
    ];
    const written = [];
    const result = await runNonInteractiveSetup(args, { write: async (config) => written.push(config) });
    expect(result.status).toBe('configured');
    expect(written).toHaveLength(1);

    await expect(runNonInteractiveSetup(args.slice(1), { write: async () => {} }))
      .rejects.toThrow(/--preview|--write/);
  });

  test('Agent check reports whether the current config is complete', async () => {
    await expect(runNonInteractiveSetup(['--', '--check'], { load: async () => buildProjectConfig(input) }))
      .resolves.toMatchObject({ status: 'configured', errors: [] });
    await expect(runNonInteractiveSetup(['--check'], { load: async () => ({ schemaVersion: 2, initialized: false }) }))
      .resolves.toMatchObject({ status: 'incomplete' });
  });
});

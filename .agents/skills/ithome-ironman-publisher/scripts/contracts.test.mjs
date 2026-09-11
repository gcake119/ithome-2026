import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = resolve('.');
const scriptsDir = resolve('.agents/skills/ithome-ironman-publisher/scripts');

function run(script, input, env = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ithome-contract-'));
  const inputPath = join(root, 'input.json');
  writeFileSync(inputPath, JSON.stringify(input), 'utf8');
  return spawnSync(process.execPath, [join(scriptsDir, script), '--input', inputPath], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

const common = {
  schemaVersion: 1,
  source: 'codex-ithome-ironman-publisher',
  repository: 'gcake119/ithome-2026',
  series: 'ithome-2026',
  completedAt: '2026-08-30T01:00:00.000Z',
  runId: 'test-run',
};

describe('inventory contract', () => {
  test('reports a canonical ironman source as a publishable payload', () => {
    const result = spawnSync(process.execPath, [join(scriptsDir, 'build-inventory.mjs'), '--day', '2'], { cwd: repoRoot, encoding: 'utf8' });
    const inventory = JSON.parse(result.stdout);
    expect(result.status).toBe(0);
    expect(inventory).toMatchObject({ status: 'complete', expected: 1, valid: 1, failed: [] });
    expect(inventory.items).toMatchObject([{ day: 2, sourcePath: 'src/content/ironman/day-02.md', status: 'valid' }]);
    expect(inventory.items.filter((item) => item.status === 'valid').every((item) => /^sha256:[a-f0-9]{64}$/.test(item.fingerprint))).toBe(true);
  }, 30_000);
});

describe('event contract', () => {
  test('atomically writes valid audit and publish events', () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'ithome-events-'));
    const audit = run('write-event.mjs', {
      ...common,
      eventId: 'audit-1234',
      operation: 'audit-drafts',
      status: 'incomplete',
      expected: 30,
      foundUnique: 3,
      missing: [4],
      duplicate: [],
      mismatch: [],
      unclassifiedCount: 0,
      confidence: 'complete',
      auditedAt: '2026-08-30T01:00:00.000Z',
    }, { ITHOME_EVENT_DIR: eventDir });
    expect(audit.status).toBe(0);

    const publish = run('write-event.mjs', {
      ...common,
      eventId: 'publish-1234',
      operation: 'publish-day',
      day: 12,
      status: 'uncertain',
      result: { reasonCode: 'navigation_timeout', publishClickCount: 1, publicVerification: 'uncertain' },
    }, { ITHOME_EVENT_DIR: eventDir });
    expect(publish.status).toBe(0);
  });

  test('rejects publish click count above one', () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'ithome-events-'));
    const result = run('write-event.mjs', {
      ...common,
      eventId: 'event-1234',
      operation: 'publish-day',
      day: 12,
      status: 'failed',
      result: { reasonCode: 'test', publishClickCount: 2, publicVerification: 'not_started' },
    }, { ITHOME_EVENT_DIR: eventDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('publishClickCountInvariant');
  });

  test('requires minimal public identity on a verified publish event', () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'ithome-events-'));
    const missing = run('write-event.mjs', {
      ...common,
      eventId: 'verified-1234',
      operation: 'publish-day',
      day: 12,
      status: 'verified',
      result: { reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified' },
    }, { ITHOME_EVENT_DIR: eventDir });
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('verifiedPublishEvidence');

    const valid = run('write-event.mjs', {
      ...common,
      eventId: 'verified-5678',
      operation: 'publish-day',
      day: 12,
      status: 'verified',
      result: {
        reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified',
        articleUrl: 'https://ithelp.ithome.com.tw/articles/123456',
        title: 'Day 12 test',
        canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/12/',
      },
    }, { ITHOME_EVENT_DIR: eventDir });
    expect(valid.status).toBe(0);
  });

  test('rejects event payloads containing forbidden secrets or article body', () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'ithome-events-'));
    const result = run('write-event.mjs', {
      ...common,
      eventId: 'event-1234',
      operation: 'publish-day',
      day: 12,
      status: 'failed',
      body: 'article body',
      telegramToken: 'secret',
      result: { reasonCode: 'test', publishClickCount: 0, publicVerification: 'not_started' },
    }, { ITHOME_EVENT_DIR: eventDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('forbidden');
  });

  test('rejects malformed duplicate and mismatch entries and failed audits without failure details', () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'ithome-events-'));
    const baseAudit = {
      ...common,
      eventId: 'audit-1234',
      operation: 'audit-drafts',
      status: 'failed',
      expected: 30,
      foundUnique: 0,
      missing: [],
      duplicate: [{ day: 12 }],
      mismatch: [{ day: 4, fields: [] }],
      unclassifiedCount: 0,
      confidence: 'unknown',
      auditedAt: '2026-08-30T01:00:00.000Z',
    };
    const result = run('write-event.mjs', baseAudit, { ITHOME_EVENT_DIR: eventDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('failure');
    expect(result.stderr).toContain('duplicate');
    expect(result.stderr).toContain('mismatch');
  });

  test('rejects negative publish click count', () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'ithome-events-'));
    const result = run('write-event.mjs', {
      ...common,
      eventId: 'event-1234',
      operation: 'publish-day',
      day: 12,
      status: 'failed',
      result: { reasonCode: 'test', publishClickCount: -1, publicVerification: 'not_started' },
    }, { ITHOME_EVENT_DIR: eventDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('publishClickCountInvariant');
  });

  test('rejects a symlink event directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ithome-events-'));
    const realDir = join(root, 'real');
    const linkDir = join(root, 'link');
    mkdirSync(realDir);
    symlinkSync(realDir, linkDir);
    const result = run('write-event.mjs', {
      ...common,
      eventId: 'publish-1234',
      operation: 'publish-day',
      day: 12,
      status: 'blocked',
      result: { reasonCode: 'draft_missing', publishClickCount: 0, publicVerification: 'not_started' },
    }, { ITHOME_EVENT_DIR: linkDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('direct directory');
  });
});

describe('bootstrap state contract', () => {
  const verifiedState = {
    schemaVersion: 1,
    source: 'codex-ithome-ironman-publisher',
    repository: 'gcake119/ithome-2026',
    contest: '18th-ironman-2026',
    bootstrapDay: 1,
    status: 'verified',
    articleUrl: 'https://ithelp.ithome.com.tw/articles/123',
    seriesUrl: 'https://ithelp.ithome.com.tw/ironman/456',
    seriesId: '456',
    publishedAt: '2026-09-01T01:00:00.000Z',
    verifiedAt: '2026-09-01T01:01:00.000Z',
    runId: 'publish-day1-test',
    verification: { titleMatched: true, canonicalMatched: true, seriesTitleMatched: true, day1ListedOnSeriesPage: true },
  };

  test('writes verified identity atomically and refuses a conflicting replacement', () => {
    const root = mkdtempSync(join(tmpdir(), 'ithome-bootstrap-'));
    const stateDir = join(root, 'state');
    mkdirSync(stateDir);
    const statePath = join(stateDir, 'series-bootstrap.json');
    const first = run('write-bootstrap-state.mjs', verifiedState, { ITHOME_BOOTSTRAP_STATE: statePath });
    expect(first.status).toBe(0);
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toMatchObject({ status: 'verified', seriesId: '456' });

    const conflict = run('write-bootstrap-state.mjs', { ...verifiedState, seriesUrl: 'https://ithelp.ithome.com.tw/ironman/999', seriesId: '999' }, { ITHOME_BOOTSTRAP_STATE: statePath });
    expect(conflict.status).not.toBe(0);
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toMatchObject({ seriesId: '456' });
  });

  test('rejects a mismatched series URL and ID', () => {
    const root = mkdtempSync(join(tmpdir(), 'ithome-bootstrap-'));
    const stateDir = join(root, 'state');
    mkdirSync(stateDir);
    const result = run('write-bootstrap-state.mjs', { ...verifiedState, seriesId: 'wrong' }, { ITHOME_BOOTSTRAP_STATE: join(stateDir, 'series-bootstrap.json') });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('seriesIdentityInvariant');
  });

  test('allows an idempotent rewrite of the same verified identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'ithome-bootstrap-'));
    const stateDir = join(root, 'state');
    mkdirSync(stateDir);
    const statePath = join(stateDir, 'series-bootstrap.json');
    expect(run('write-bootstrap-state.mjs', verifiedState, { ITHOME_BOOTSTRAP_STATE: statePath }).status).toBe(0);
    expect(run('write-bootstrap-state.mjs', { ...verifiedState, verifiedAt: '2026-09-01T01:02:00.000Z' }, { ITHOME_BOOTSTRAP_STATE: statePath }).status).toBe(0);
  });

  test('the Day 2-30 CLI gate rejects a symlink state file', () => {
    const root = mkdtempSync(join(tmpdir(), 'ithome-bootstrap-'));
    const realPath = join(root, 'real.json');
    const linkPath = join(root, 'series-bootstrap.json');
    writeFileSync(realPath, JSON.stringify(verifiedState), 'utf8');
    symlinkSync(realPath, linkPath);
    const result = spawnSync(process.execPath, [join(scriptsDir, 'validate-bootstrap-state.mjs'), '--input', linkPath], { cwd: repoRoot, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('direct regular file');
  });
});

describe('CLI argument guards', () => {
  test.each([
    { args: [] },
    { args: ['--day', '0'] },
    { args: ['--day', '31'] },
    { args: ['--day', '1.5'] },
    { args: ['--all', '--day', '1'] },
  ])('inventory rejects invalid arguments $args', ({ args }) => {
    const result = spawnSync(process.execPath, [join(scriptsDir, 'build-inventory.mjs'), ...args], { cwd: repoRoot, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });

  test.each(['0', '31', '1.5'])('prepare rejects invalid Day %s', (day) => {
    const result = spawnSync(process.execPath, [resolve('scripts/ithome/prepare.mjs'), '--day', day, '--json'], { cwd: repoRoot, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });
});

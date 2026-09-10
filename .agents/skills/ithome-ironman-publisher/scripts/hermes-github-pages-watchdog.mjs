#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { loadProjectConfigSync } from '../../../../scripts/ithome/config.mjs';
import { isDirectExecution } from './cli-entrypoint.mjs';

const BRIDGE_ROOT = '/Users/Shared/ithome-ironman-bridge';

function exactUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.href;
  } catch { return null; }
}

function canonicalUrl(html) {
  const tag = html.match(/<link\b[^>]*\brel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i)?.[0];
  return tag?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
}

function visibleText(html) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function dateLabels(date) {
  const [year, month, day] = date.split('-').map(Number);
  return [date, `${year}/${month}/${day}`, `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`];
}

export function evaluateGithubPages({ expected, status, finalUrl, html }) {
  const base = { day: expected.day, date: expected.date, url: expected.url };
  if (status === 404) return { status: 'failed', result: 'missing', notifications: [{ kind: 'github_pages_missing', ...base }] };
  if (!(status >= 200 && status < 300)) {
    return { status: 'failed', result: 'unavailable', notifications: [{ kind: 'github_pages_unavailable', ...base, reasonCode: `http_${status}` }] };
  }

  const fields = [];
  if (exactUrl(finalUrl) !== exactUrl(expected.url)) fields.push('finalUrl');
  if (exactUrl(canonicalUrl(html)) !== exactUrl(expected.url)) fields.push('canonical');
  const content = visibleText(html);
  if (!new RegExp(`\\bDay\\s*0*${expected.day}\\b`, 'i').test(content)) fields.push('day');
  if (!dateLabels(expected.date).some((label) => content.includes(label)) && !html.includes(`datetime="${expected.date}`) && !html.includes(`datetime='${expected.date}`)) fields.push('date');
  if (fields.length) return { status: 'failed', result: 'mismatch', notifications: [{ kind: 'github_pages_mismatch', ...base, fields }] };
  return { status: 'verified', result: 'verified', notifications: [] };
}

export async function checkGithubPages(expected, {
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
  retryDelayMs = 120_000,
} = {}) {
  let lastResult;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl(expected.url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': 'ithome-github-pages-watchdog/1.0' },
      });
      lastResult = evaluateGithubPages({ expected, status: response.status, finalUrl: response.url, html: await response.text() });
      if (lastResult.status === 'verified') return lastResult;
    } catch (error) {
      lastResult = { status: 'failed', result: 'unavailable', notifications: [{ kind: 'github_pages_unavailable', ...expected, reasonCode: error.name === 'AbortError' ? 'timeout' : 'network_error' }] };
    } finally { clearTimeout(timeout); }
    if (attempt < 2) await sleep(retryDelayMs);
  }
  return lastResult;
}

export function suppressDelivered({ date, result, state, now = new Date().toISOString() }) {
  const key = `${date}:github-pages-0925:${result.result}`;
  const delivered = new Set(Array.isArray(state.delivered) ? state.delivered : []);
  const notifications = delivered.has(key) ? [] : result.notifications;
  delivered.add(key);
  return {
    key,
    notifications,
    nextState: { schemaVersion: 1, delivered: [...delivered].slice(-90), updatedAt: now },
  };
}

function readState(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${path} must be a direct regular file`);
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

function writeState(path, state) {
  if (!isAbsolute(path)) throw new Error('GitHub Pages state path must be absolute');
  const target = resolve(path);
  if (target === BRIDGE_ROOT || target.startsWith(`${BRIDGE_ROOT}/`)) throw new Error('GitHub Pages state must not be written to the shared bridge');
  if (basename(target) !== 'github-pages-0925-state.json') throw new Error('GitHub Pages state filename must be github-pages-0925-state.json');
  const parent = dirname(target);
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('GitHub Pages state directory must be a direct directory');
  const temporary = join(parent, `.github-pages-0925-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, target);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

function taipeiDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function parseArgs(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--dry-run') options.dryRun = true;
    else if (['--state', '--date'].includes(key)) {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${key}`);
      options[key === '--state' ? 'state' : 'date'] = value;
    } else throw new Error(`Unknown argument: ${key}`);
  }
  if (!options.state) throw new Error('Usage: hermes-github-pages-watchdog.mjs --state FILE [--date YYYY-MM-DD] [--dry-run]');
  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  const project = loadProjectConfigSync({ requireInitialized: true });
  const date = options.date ?? taipeiDate();
  const scheduled = project.schedule.find((item) => item.date === date);
  if (!scheduled) {
    process.stdout.write(`${JSON.stringify({ status: 'not_scheduled', date, notifications: [], dryRun: options.dryRun }, null, 2)}\n`);
    return;
  }
  const expected = { day: scheduled.day, date, url: `${project.githubPages.publicUrl}/day/${String(scheduled.day).padStart(2, '0')}/` };
  const result = await checkGithubPages(expected);
  const state = readState(resolve(options.state));
  const delivery = suppressDelivered({ date, result, state });
  if (!options.dryRun) writeState(options.state, delivery.nextState);
  process.stdout.write(`${JSON.stringify({ ...result, notifications: delivery.notifications, date, day: scheduled.day, key: delivery.key, nextState: delivery.nextState, dryRun: options.dryRun }, null, 2)}\n`);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

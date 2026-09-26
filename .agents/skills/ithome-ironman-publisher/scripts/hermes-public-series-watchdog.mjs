#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, readSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { loadProjectConfigSync, REPO_ROOT } from '../../../../scripts/ithome/config.mjs';
import { validateBootstrapState } from './validate-bootstrap-state.mjs';
import { isDirectExecution } from './cli-entrypoint.mjs';

const BRIDGE_ROOT = '/Users/Shared/ithome-ironman-bridge';

export function publicationReminder({ day, date }) {
  if (!Number.isInteger(day) || day < 1 || day > 30 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('A scheduled day and date are required');
  return { kind: 'publication_reminder', day, date };
}

export function decideDelivery({ result, state = {}, date, day, mode, checkpoint, updatedAt = new Date().toISOString() }) {
  const verifiedNotification = mode === 'check' && result.status === 'verified'
    ? [{ kind: 'public_article_verified', day, date, articleUrl: result.articleUrl }]
    : null;
  const pendingNotifications = verifiedNotification ?? result.notifications;
  const key = verifiedNotification
    ? `${date}:check:public_article_verified`
    : `${date}:${mode}:${checkpoint ?? '0900'}:${pendingNotifications.map((item) => `${item.kind}:${(item.fields ?? []).join(',')}`).join('|') || 'verified'}`;
  const delivered = new Set(Array.isArray(state.delivered) ? state.delivered : []);
  const notifications = delivered.has(key) ? [] : pendingNotifications;
  delivered.add(key);

  let lastVerified = state.lastVerified;
  if (!lastVerified && state.lastCheck?.status === 'verified') {
    lastVerified = { ...state.lastCheck, verifiedAt: state.updatedAt };
  }
  if (mode === 'check' && result.status === 'verified') {
    lastVerified = { date, day, status: 'verified', verifiedAt: updatedAt };
  }
  const nextState = {
    schemaVersion: 1,
    delivered: [...delivered].slice(-90),
    lastCheck: { date, day, status: result.status },
    ...(lastVerified ? { lastVerified } : {}),
    updatedAt,
  };
  return { key, notifications, nextState };
}

function text(value) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function seriesMainContent(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (main === undefined) return null;
  return main.replace(/<(aside|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
}

function rssArticleLinks(xml) {
  const links = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = match[1];
    const rawTitle = item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const rawLink = item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? '';
    const title = text(rawTitle.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1'));
    try {
      const url = new URL(rawLink.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1').trim().replace(/&amp;/g, '&'));
      if (url.protocol !== 'https:' || url.hostname !== 'ithelp.ithome.com.tw' || !/^\/articles\/[^/]+\/?$/.test(url.pathname)) continue;
      url.search = ''; url.hash = '';
      links.push({ url: url.href.replace(/\/$/, ''), title });
    } catch {}
  }
  return links.reverse();
}

function articleLinks(html, seriesUrl) {
  if (/<rss\b/i.test(html)) return rssArticleLinks(html);
  const content = seriesMainContent(html);
  if (content === null) return null;
  const links = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of content.matchAll(pattern)) {
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const url = new URL(href.replace(/&amp;/g, '&'), seriesUrl);
      if (url.protocol === 'https:' && url.hostname === 'ithelp.ithome.com.tw' && /^\/articles\/[^/]+\/?$/.test(url.pathname)) {
        url.search = ''; url.hash = '';
        links.push({ url: url.href.replace(/\/$/, ''), title: text(match[2]) });
      }
    } catch {}
  }
  return links;
}

function exactUrl(value) {
  try {
    const url = new URL(value);
    url.search = ''; url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}

function comparableTitle(value) {
  return value.replace(/["'“”‘’「」『』]/gu, '');
}

export function readScheduledMetadata(scheduled, project, postsDirectory = resolve(REPO_ROOT, 'src/content/ironman')) {
  if (!Number.isInteger(scheduled?.day) || !/^\d{4}-\d{2}-\d{2}$/.test(scheduled?.date ?? '')) {
    throw new Error('Scheduled Day metadata is invalid');
  }
  const dayString = String(scheduled.day).padStart(2, '0');
  const path = resolve(postsDirectory, `day-${dayString}.md`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Scheduled article source must be a direct regular file');

  const buffer = Buffer.alloc(8_192);
  const fd = openSync(path, constants.O_RDONLY);
  let bytesRead;
  try { bytesRead = readSync(fd, buffer, 0, buffer.length, 0); }
  finally { closeSync(fd); }
  const prefix = buffer.subarray(0, bytesRead).toString('utf8');
  if (!prefix.startsWith('---\n')) throw new Error('Scheduled article frontmatter is missing');
  const end = prefix.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('Scheduled article frontmatter exceeds the safe read boundary');
  const metadata = {};
  for (const line of prefix.slice(4, end).split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match) metadata[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  if (Number(metadata.day) !== scheduled.day || metadata.publishDate !== scheduled.date || !metadata.title) {
    throw new Error('Scheduled article frontmatter does not match the configured schedule');
  }
  return {
    day: scheduled.day,
    date: scheduled.date,
    title: metadata.title,
    canonicalUrl: `${project.githubPages.publicUrl}/day/${dayString}/`,
  };
}

function resolvePublicEntry(expected, bootstrap, seriesHtml) {
  const base = { day: expected?.day, date: expected?.date, articleUrl: expected?.articleUrl };
  const links = articleLinks(seriesHtml, bootstrap.seriesUrl);
  if (links === null) return { error: { status: 'failed', notifications: [{ kind: 'public_watchdog_unavailable', ...base, reasonCode: 'series_content_unrecognized' }] } };

  let entry;
  if (expected.articleUrl !== undefined) {
    const expectedUrl = exactUrl(expected.articleUrl);
    if (!expectedUrl) return { error: { status: 'failed', notifications: [{ kind: 'public_watchdog_blocked', ...base, reasonCode: 'verified_publish_evidence_invalid' }] } };
    entry = links.find((item) => item.url === expectedUrl);
  } else {
    const expectedTitle = comparableTitle(expected.title);
    const matches = links.filter((item) => comparableTitle(item.title) === expectedTitle);
    if (matches.length > 1) return { error: { status: 'failed', notifications: [{ kind: 'public_watchdog_blocked', ...base, reasonCode: 'public_article_ambiguous' }] } };
    [entry] = matches;
  }
  if (!entry) return { error: { status: 'failed', notifications: [{ kind: 'public_article_missing', ...base }] } };
  const resolvedBase = { ...base, articleUrl: entry.url };
  if (links.at(-1)?.url !== entry.url) return { error: { status: 'failed', notifications: [{ kind: 'public_article_not_latest', ...resolvedBase, latestArticleUrl: links.at(-1)?.url }] } };
  return { entry, base: resolvedBase };
}

export function evaluatePublicSeries({ expected, bootstrap, seriesHtml, articleHtml }) {
  const base = { day: expected?.day, date: expected?.date, articleUrl: expected?.articleUrl };
  if (!bootstrap?.seriesUrl || !bootstrap?.seriesId) {
    return { status: 'failed', notifications: [{ kind: 'public_watchdog_blocked', ...base, reasonCode: 'bootstrap_invalid' }] };
  }
  if (!Number.isInteger(expected?.day) || !expected?.title || !expected?.canonicalUrl) {
    return { status: 'failed', notifications: [{ kind: 'public_watchdog_blocked', ...base, reasonCode: 'verified_publish_evidence_invalid' }] };
  }
  const resolved = resolvePublicEntry(expected, bootstrap, seriesHtml);
  if (resolved.error) return resolved.error;
  const { entry } = resolved;

  const fields = [];
  if (comparableTitle(entry.title) !== comparableTitle(expected.title)) fields.push('title');
  if (!articleHtml.includes(expected.canonicalUrl)) fields.push('canonicalUrl');
  if (expected.date && !articleHtml.includes(expected.date)) fields.push('publishedDate');
  if (fields.length) return { status: 'failed', notifications: [{ kind: 'public_article_mismatch', ...resolved.base, fields }] };
  return { status: 'verified', notifications: [], articleUrl: entry.url };
}

function readJson(path, { optional = false } = {}) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${path} must be a direct regular file`);
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    throw error;
  }
}

function readEvents(directory) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Event path must be a direct directory');
  return readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((name) => readJson(join(directory, name)));
}

function writeState(path, state) {
  if (!isAbsolute(path)) throw new Error('Public watchdog state path must be absolute');
  const target = resolve(path);
  if (target === BRIDGE_ROOT || target.startsWith(`${BRIDGE_ROOT}/`)) throw new Error('Public watchdog state must not be written to the shared bridge');
  if (basename(target) !== 'public-watchdog-state.json') throw new Error('Public watchdog state filename must be public-watchdog-state.json');
  const parent = dirname(target);
  const stat = lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Public watchdog state directory must be a direct directory');
  const temporary = join(parent, `.public-watchdog-${randomUUID()}.tmp`);
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
  const options = { dryRun: false, mode: 'check' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--dry-run') options.dryRun = true;
    else if (['--events', '--bootstrap', '--state', '--date', '--mode', '--checkpoint'].includes(key)) {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${key}`);
      options[{ '--events': 'events', '--bootstrap': 'bootstrap', '--state': 'state', '--date': 'date', '--mode': 'mode', '--checkpoint': 'checkpoint' }[key]] = value;
    } else throw new Error(`Unknown argument: ${key}`);
  }
  if (!['reminder', 'check'].includes(options.mode)) throw new Error('--mode must be reminder or check');
  if (!options.state || (options.mode === 'check' && (!options.events || !options.bootstrap || !['public-1900', 'public-2230'].includes(options.checkpoint)))) {
    throw new Error('Usage: hermes-public-series-watchdog.mjs --mode reminder|check --state FILE [--events DIR --bootstrap FILE --checkpoint public-1900|public-2230] [--date YYYY-MM-DD] [--dry-run]');
  }
  return options;
}

export async function fetchWithRetry(url, { fetchImpl = fetch, sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)), retryDelayMs = 120_000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow', headers: { 'user-agent': 'ithome-public-series-watchdog/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const final = new URL(response.url);
      if (final.protocol !== 'https:' || final.hostname !== 'ithelp.ithome.com.tw') throw new Error('Unexpected response host');
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(retryDelayMs);
    } finally { clearTimeout(timeout); }
  }
  throw lastError;
}

export async function fetchLatestSeriesPage(seriesUrl, { fetchPage = fetchWithRetry } = {}) {
  const base = new URL(seriesUrl);
  let firstHtml;
  try {
    firstHtml = await fetchPage(seriesUrl);
  } catch (seriesError) {
    const seriesId = base.pathname.match(/\/ironman\/([^/]+)\/?$/)?.[1];
    if (!seriesId) throw seriesError;
    return fetchPage(`${base.origin}/rss/series/${seriesId}`);
  }
  const pages = [1];
  const hrefPattern = /\bhref\s*=\s*["']([^"']+)["']/gi;
  for (const match of firstHtml.matchAll(hrefPattern)) {
    try {
      const candidate = new URL(match[1].replace(/&amp;/g, '&'), base);
      const page = Number(candidate.searchParams.get('page'));
      if (candidate.origin === base.origin && candidate.pathname === base.pathname && Number.isInteger(page) && page > 0) pages.push(page);
    } catch {}
  }
  const lastPage = Math.max(...pages);
  if (lastPage === 1) return firstHtml;
  const lastUrl = new URL(base);
  lastUrl.searchParams.set('page', String(lastPage));
  return fetchPage(lastUrl.href);
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

  let result;
  if (options.mode === 'reminder') {
    result = { status: 'reminder', notifications: [publicationReminder({ day: scheduled.day, date })] };
  } else {
    const bootstrap = readJson(resolve(options.bootstrap), { optional: true });
    const bootstrapErrors = bootstrap ? validateBootstrapState(bootstrap, project) : ['missing'];
    if (bootstrapErrors.length) {
      result = { status: 'failed', notifications: [{ kind: 'public_watchdog_blocked', day: scheduled.day, reasonCode: 'bootstrap_invalid', errors: bootstrapErrors }] };
    } else {
      const events = readEvents(resolve(options.events));
      const candidates = events.filter((event) => event.operation === 'publish-day' && event.day === scheduled.day && event.status === 'verified');
      const event = candidates.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0];
      let expected;
      try {
        expected = event?.result?.publicVerification === 'verified'
          ? { day: event.day, date, title: event.result.title, articleUrl: event.result.articleUrl, canonicalUrl: event.result.canonicalUrl }
          : readScheduledMetadata(scheduled, project);
        const seriesHtml = await fetchLatestSeriesPage(bootstrap.seriesUrl);
        const resolved = resolvePublicEntry(expected, bootstrap, seriesHtml);
        if (resolved.error) result = resolved.error;
        else {
          const articleHtml = await fetchWithRetry(resolved.entry.url);
          result = evaluatePublicSeries({ expected: { ...expected, articleUrl: resolved.entry.url }, bootstrap, seriesHtml, articleHtml });
        }
      } catch (error) {
        result = { status: 'failed', notifications: [{ kind: 'public_watchdog_unavailable', day: scheduled.day, reasonCode: error.message }] };
      }
    }
  }

  const state = readJson(resolve(options.state), { optional: true }) ?? {};
  const updatedAt = new Date().toISOString();
  const { notifications, nextState } = decideDelivery({
    result,
    state,
    date,
    day: scheduled.day,
    mode: options.mode,
    checkpoint: options.checkpoint,
    updatedAt,
  });
  if (!options.dryRun) writeState(options.state, nextState);
  process.stdout.write(`${JSON.stringify({ ...result, notifications, date, day: scheduled.day, nextState, dryRun: options.dryRun }, null, 2)}\n`);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

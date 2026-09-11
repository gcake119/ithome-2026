#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { validateBootstrapState } from './validate-bootstrap-state.mjs';
import { loadProjectConfigSync } from '../../../../scripts/ithome/config.mjs';
import { isDirectExecution } from './cli-entrypoint.mjs';

const BRIDGE_ROOT = '/Users/Shared/ithome-ironman-bridge';
const DEFAULT_MAX_AGE_HOURS = 36;
const CHECKPOINTS = new Set(['day1-1900', 'day1-2230']);

function validDate(value) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function validEnvelope(event, project) {
  return event?.schemaVersion === 1
    && typeof event.eventId === 'string' && event.eventId.length >= 8
    && event.source === 'codex-ithome-ironman-publisher'
    && event.repository === project.repository
    && event.series === project.seriesKey
    && validDate(event.completedAt) !== null;
}

function notification(kind, event, details = {}) {
  return { kind, eventId: event?.eventId, operation: event?.operation, ...details };
}

function auditNotifications(event) {
  if (event.status === 'complete') return [];
  if (event.status === 'failed') return [notification('audit_failed', event, { failure: event.failure })];
  const result = [];
  if (event.missing?.length) result.push(notification('audit_missing', event, { days: event.missing }));
  if (event.duplicate?.length) result.push(notification('audit_duplicate', event, { entries: event.duplicate }));
  if (event.mismatch?.length) result.push(notification('audit_mismatch', event, { entries: event.mismatch }));
  if (event.unclassifiedCount > 0) result.push(notification('audit_failed', event, { failure: { reasonCode: 'unclassified_drafts' } }));
  return result;
}

function eventNotifications(event) {
  if (event.operation === 'audit-drafts') return auditNotifications(event);
  if (event.operation === 'publish-day' && ['blocked', 'failed', 'uncertain'].includes(event.status)) {
    return [notification('publish_failed', event, { day: event.day, status: event.status, result: event.result })];
  }
  if (event.operation === 'bootstrap-series' && event.status !== 'verified') {
    return [notification('bootstrap_failed', event, { status: event.status, failure: event.failure })];
  }
  return [];
}

function isVerifiedPublish(event) {
  return event.operation === 'publish-day'
    && Number.isInteger(event.day) && event.day >= 1 && event.day <= 30
    && event.status === 'verified'
    && event.result?.reasonCode === 'published'
    && event.result?.publishClickCount === 1
    && event.result?.publicVerification === 'verified'
    && typeof event.result?.articleUrl === 'string' && event.result.articleUrl !== ''
    && typeof event.result?.title === 'string' && event.result.title !== ''
    && typeof event.result?.canonicalUrl === 'string' && event.result.canonicalUrl !== '';
}

export function evaluateWatcher({ events, bootstrap, state = {}, now = new Date().toISOString(), checkpoint, maxAgeHours = DEFAULT_MAX_AGE_HOURS, project = loadProjectConfigSync() }) {
  if (!Array.isArray(events)) throw new Error('events must be an array');
  if (checkpoint !== undefined && !CHECKPOINTS.has(checkpoint)) throw new Error('checkpoint must be day1-1900 or day1-2230');
  const nowMs = validDate(now);
  if (nowMs === null) throw new Error('now must be an RFC3339 timestamp');
  if (!(Number.isFinite(maxAgeHours) && maxAgeHours > 0)) throw new Error('maxAgeHours must be positive');

  const processed = new Set(Array.isArray(state.processedEventIds) ? state.processedEventIds : []);
  const checkpointNotified = new Set(Array.isArray(state.checkpointNotified) ? state.checkpointNotified : []);
  const seenThisRun = new Map();
  const notifications = [];
  const latestVerifiedPublishByDay = new Map();

  for (const event of events) {
    if (!validEnvelope(event, project) || !isVerifiedPublish(event)) continue;
    const previous = latestVerifiedPublishByDay.get(event.day);
    if (!previous || validDate(event.completedAt) > validDate(previous.completedAt)) {
      latestVerifiedPublishByDay.set(event.day, event);
    }
  }

  for (const event of events) {
    if (!validEnvelope(event, project)) {
      notifications.push(notification('event_invalid', event));
      continue;
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    if (seenThisRun.has(event.eventId)) {
      if (seenThisRun.get(event.eventId) !== fingerprint) notifications.push(notification('duplicate_event_id', event));
      continue;
    }
    seenThisRun.set(event.eventId, fingerprint);
    if (processed.has(event.eventId)) continue;

    const ageHours = (nowMs - validDate(event.completedAt)) / 3_600_000;
    const laterVerified = event.operation === 'publish-day'
      && latestVerifiedPublishByDay.has(event.day)
      && validDate(latestVerifiedPublishByDay.get(event.day).completedAt) > validDate(event.completedAt);
    const abnormal = laterVerified ? [] : eventNotifications(event);
    if (ageHours > maxAgeHours) notifications.push(notification('stale_event', event, { ageHours: Math.floor(ageHours) }));
    else notifications.push(...abnormal);
    processed.add(event.eventId);
  }

  const bootstrapErrors = bootstrap ? validateBootstrapState(bootstrap, project) : ['missing'];
  const bootstrapReady = bootstrapErrors.length === 0;
  let bootstrapProblemObserved = state.bootstrapProblemObserved === true;
  let bootstrapRecoveryNotified = state.bootstrapRecoveryNotified === true;

  if (!bootstrapReady && checkpoint && !checkpointNotified.has(checkpoint)) {
    notifications.push({ kind: 'bootstrap_missing', checkpoint, errors: bootstrapErrors });
    checkpointNotified.add(checkpoint);
    bootstrapProblemObserved = true;
  }
  if (bootstrapReady && bootstrapProblemObserved && !bootstrapRecoveryNotified) {
    notifications.push({ kind: 'bootstrap_recovered', seriesUrl: bootstrap.seriesUrl, seriesId: bootstrap.seriesId });
    bootstrapRecoveryNotified = true;
  }

  return {
    notifications,
    watchdog: bootstrapReady
      ? { status: 'ready', seriesUrl: bootstrap.seriesUrl, seriesId: bootstrap.seriesId }
      : { status: 'blocked', reason: 'bootstrap_not_verified', errors: bootstrapErrors },
    nextState: {
      schemaVersion: 1,
      processedEventIds: [...processed].slice(-1000),
      checkpointNotified: [...checkpointNotified],
      bootstrapProblemObserved,
      bootstrapRecoveryNotified,
      updatedAt: now,
    },
  };
}

function readDirectJson(path, { optional = false } = {}) {
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
  return readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((name) => readDirectJson(join(directory, name)));
}

function writeState(path, state) {
  if (!isAbsolute(path)) throw new Error('Hermes state path must be absolute');
  const target = resolve(path);
  if (target === BRIDGE_ROOT || target.startsWith(`${BRIDGE_ROOT}/`)) throw new Error('Hermes state must not be written to the shared bridge');
  if (basename(target) !== 'watcher-state.json') throw new Error('Hermes state filename must be watcher-state.json');
  const parent = dirname(target);
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('Hermes state directory must be a direct directory');
  const temporary = join(parent, `.watcher-state-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(temporary, target);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

function parseArgs(argv) {
  const options = { maxAgeHours: DEFAULT_MAX_AGE_HOURS, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--dry-run') options.dryRun = true;
    else if (['--events', '--bootstrap', '--state', '--checkpoint', '--now', '--max-age-hours'].includes(key)) {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${key}`);
      options[{ '--events': 'events', '--bootstrap': 'bootstrap', '--state': 'state', '--checkpoint': 'checkpoint', '--now': 'now', '--max-age-hours': 'maxAgeHours' }[key]] = key === '--max-age-hours' ? Number(value) : value;
    } else throw new Error(`Unknown argument: ${key}`);
  }
  if (!options.events || !options.bootstrap || !options.state) throw new Error('Usage: hermes-watcher.mjs --events DIR --bootstrap FILE --state FILE [--checkpoint day1-1900|day1-2230] [--dry-run]');
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  const state = readDirectJson(resolve(options.state), { optional: true }) ?? {};
  const bootstrap = readDirectJson(resolve(options.bootstrap), { optional: true });
  const result = evaluateWatcher({ events: readEvents(resolve(options.events)), bootstrap, state, now: options.now, checkpoint: options.checkpoint, maxAgeHours: options.maxAgeHours });
  if (!options.dryRun) writeState(options.state, result.nextState);
  process.stdout.write(`${JSON.stringify({ ...result, dryRun: options.dryRun }, null, 2)}\n`);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

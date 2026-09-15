#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';

const ALLOWED_STATUSES = new Set(['verified', 'blocked', 'failed', 'uncertain']);

function fingerprint(payload) {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function validPayload(payload, day, project) {
  const dayString = String(day).padStart(2, '0');
  const canonicalUrl = `${project.githubPages.publicUrl}/day/${dayString}/`;
  const syncLine = `本文同步刊載於[個人連載網站](${canonicalUrl})`;
  return payload?.day === day
    && payload.dayString === dayString
    && payload.sourcePath === `src/content/ironman/day-${dayString}.md`
    && typeof payload.title === 'string' && payload.title.trim() !== ''
    && typeof payload.body === 'string' && payload.body.split(/\r?\n/, 1)[0] === syncLine
    && payload.canonicalUrl === canonicalUrl
    && payload.syncLine === syncLine;
}

function eventEnvelope({ day, status, result, completedAt, runId, project }) {
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    source: 'codex-ithome-ironman-publisher',
    repository: project.repository,
    series: project.seriesKey,
    operation: 'publish-day',
    day,
    status,
    completedAt,
    runId,
    result,
  };
}

const PHASE_BY_REASON = new Map([
  ['payload_missing', 'payload_preflight'],
  ['payload_failed', 'payload_preflight'],
  ['payload_mismatch', 'payload_preflight'],
  ['series_bootstrap_missing', 'bootstrap_preflight'],
  ['series_bootstrap_invalid', 'bootstrap_preflight'],
  ['anti_automation', 'browser_session'],
  ['login_required', 'browser_session'],
  ['unexpected_account', 'browser_session'],
  ['browser_driver_failed', 'browser_connection'],
  ['driver_failed', 'browser_connection'],
  ['draft_scan_incomplete', 'draft_audit'],
  ['draft_missing', 'draft_audit'],
  ['draft_duplicate', 'draft_audit'],
  ['draft_mismatch', 'draft_audit'],
  ['public_scan_incomplete', 'public_audit'],
  ['already_published', 'public_audit'],
  ['prior_publish_click_recorded', 'publish_interlock'],
  ['click_receipt_write_failed', 'publish_interlock'],
  ['publish_not_clicked', 'publish_click'],
  ['publish_click_untracked', 'publish_click'],
  ['publish_confirmation_required', 'public_verification'],
  ['publish_server_error', 'public_verification'],
  ['post_publish_unverified', 'public_verification'],
  ['driver_payload_stale', 'result_validation'],
  ['driver_contract_invalid', 'result_validation'],
]);

function phaseFor(reasonCode) {
  return PHASE_BY_REASON.get(reasonCode) ?? 'unknown';
}

function abnormalResult(reasonCode, publishClickCount = 0, publicVerification = 'not_started') {
  return { reasonCode, phase: phaseFor(reasonCode), publishClickCount, publicVerification };
}

function validArticleUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'ithelp.ithome.com.tw' && /^\/articles\/[^/]+\/?$/.test(url.pathname);
  } catch { return false; }
}

function validVerifiedOutcome(outcome, payload) {
  return outcome?.status === 'verified'
    && outcome.result?.reasonCode === 'published'
    && outcome.result?.publishClickCount === 1
    && outcome.result?.publicVerification === 'verified'
    && validArticleUrl(outcome.result?.articleUrl)
    && outcome.result?.title === payload.title
    && outcome.result?.canonicalUrl === payload.canonicalUrl;
}

async function complete(result, event, emit) {
  try {
    await emit(event);
    return { ...result, eventPersisted: true };
  } catch {
    return { ...result, exitCode: 1, silent: false, eventPersisted: false, eventError: 'event_write_failed' };
  }
}

export async function runUnattendedPublisher({ day, prepare, publish, emit, project, now = () => new Date().toISOString(), runId = `local-publisher-${randomUUID()}` }) {
  if (!Number.isInteger(day) || day < 1 || day > 30) throw new Error('day must be an integer from 1 to 30');
  if (![prepare, publish, emit].every((value) => typeof value === 'function')) throw new Error('prepare, publish, and emit are required functions');
  if (!project?.repository || !project?.seriesKey || !project?.githubPages?.publicUrl) throw new Error('project configuration is required');

  let payload;
  try {
    payload = await prepare(day);
  } catch (error) {
    const reasonCode = error?.code === 'ENOENT' ? 'payload_missing' : 'payload_failed';
    const result = abnormalResult(reasonCode);
    return complete(
      { exitCode: 1, silent: false, status: 'blocked', result },
      eventEnvelope({ day, status: 'blocked', result, completedAt: now(), runId, project }),
      emit,
    );
  }

  if (!validPayload(payload, day, project)) {
    const result = abnormalResult('payload_mismatch');
    return complete(
      { exitCode: 1, silent: false, status: 'blocked', result },
      eventEnvelope({ day, status: 'blocked', result, completedAt: now(), runId, project }),
      emit,
    );
  }

  const expectedFingerprint = fingerprint(payload);
  let outcome;
  try {
    outcome = await publish({ payload, fingerprint: expectedFingerprint, runId });
  } catch {
    outcome = { status: 'failed', fingerprint: expectedFingerprint, result: abnormalResult('driver_failed') };
  }

  if (!ALLOWED_STATUSES.has(outcome?.status) || !outcome?.result) {
    outcome = { status: 'failed', fingerprint: expectedFingerprint, result: abnormalResult('driver_contract_invalid') };
  }
  if (outcome.fingerprint !== expectedFingerprint) {
    outcome = {
      status: 'uncertain',
      result: abnormalResult('driver_payload_stale', outcome?.result?.publishClickCount ?? 0, outcome?.result?.publicVerification ?? 'uncertain'),
    };
  } else if (outcome.status === 'verified' && !validVerifiedOutcome(outcome, payload)) {
    outcome = {
      status: 'uncertain',
      fingerprint: expectedFingerprint,
      result: abnormalResult('driver_contract_invalid', outcome.result?.publishClickCount ?? 0, 'uncertain'),
    };
  }

  if (outcome.status !== 'verified' && typeof outcome.result.phase !== 'string') {
    outcome.result = { ...outcome.result, phase: phaseFor(outcome.result.reasonCode) };
  }

  const silent = outcome.status === 'verified';
  return complete(
    { exitCode: silent ? 0 : 1, silent, status: outcome.status, result: outcome.result },
    eventEnvelope({ day, status: outcome.status, result: outcome.result, completedAt: now(), runId, project }),
    emit,
  );
}

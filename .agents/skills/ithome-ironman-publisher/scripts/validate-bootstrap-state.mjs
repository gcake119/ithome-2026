#!/usr/bin/env node

import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectConfigSync } from '../../../../scripts/ithome/config.mjs';

function validTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseIthomeUrl(value, pattern) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'ithelp.ithome.com.tw') return null;
    const match = url.pathname.match(pattern);
    return match ? { url, match } : null;
  } catch {
    return null;
  }
}

export function validateBootstrapState(state, project = loadProjectConfigSync()) {
  const errors = [];
  if (state?.schemaVersion !== 1) errors.push('schemaVersion');
  if (state?.source !== 'codex-ithome-ironman-publisher') errors.push('source');
  if (state?.repository !== project.repository) errors.push('repository');
  if (state?.contest !== project.contest) errors.push('contest');
  if (state?.bootstrapDay !== 1) errors.push('bootstrapDay');
  if (state?.status !== 'verified') errors.push('status');
  const article = parseIthomeUrl(state?.articleUrl, /^\/articles\/[^/]+\/?$/);
  const series = parseIthomeUrl(state?.seriesUrl, /^(?:\/ironman\/|\/users\/[^/]+\/ironman\/)([^/]+)\/?$/);
  if (!article) errors.push('articleUrl');
  if (!series) errors.push('seriesUrl');
  if (typeof state?.seriesId !== 'string' || !state.seriesId) errors.push('seriesId');
  else if (!series || series.match[1] !== state.seriesId) errors.push('seriesIdentityInvariant');
  if (!validTimestamp(state?.publishedAt)) errors.push('publishedAt');
  if (!validTimestamp(state?.verifiedAt)) errors.push('verifiedAt');
  if (typeof state?.runId !== 'string' || !state.runId) errors.push('runId');
  for (const field of ['titleMatched', 'canonicalMatched', 'seriesTitleMatched', 'day1ListedOnSeriesPage']) {
    if (state?.verification?.[field] !== true) errors.push(`verification.${field}`);
  }
  return errors;
}

function main(argv) {
  if (argv.length !== 2 || argv[0] !== '--input') throw new Error('Usage: validate-bootstrap-state.mjs --input <series-bootstrap.json>');
  const inputPath = resolve(argv[1]);
  const stat = lstatSync(inputPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Bootstrap state must be a direct regular file');
  const state = JSON.parse(readFileSync(inputPath, 'utf8'));
  const errors = validateBootstrapState(state);
  if (errors.length) throw new Error(`Invalid bootstrap fields: ${errors.join(', ')}`);
  process.stdout.write(`${JSON.stringify({ status: 'verified', seriesId: state.seriesId, seriesUrl: state.seriesUrl })}\n`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

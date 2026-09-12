#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { prepareIthomePayload } from '../../../../scripts/ithome/prepare.mjs';
import { loadProjectConfig } from '../../../../scripts/ithome/config.mjs';
import { createIthomeBrowserAdapter } from './browser-adapter.mjs';
import { createPlaywrightIthomeDriver } from './playwright-browser-driver.mjs';
import { runUnattendedPublisher } from './unattended-runner.mjs';
import { validateBootstrapState } from './validate-bootstrap-state.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export function parseRunnerArgs(argv = []) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  if (args.length !== 2 || args[0] !== '--day') throw new Error('Usage: run-browser-publisher.mjs --day <1-30>');
  const day = Number(args[1]);
  if (!Number.isInteger(day) || day < 1 || day > 30) throw new Error('Use --day with an integer from 1 to 30');
  return { day };
}

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value;
}

export function loadRunnerConfig(env) {
  const cdpEndpoint = required(env, 'ITHOME_CDP_ENDPOINT');
  const draftsUrl = required(env, 'ITHOME_DRAFTS_URL');
  const publicArticlesUrl = required(env, 'ITHOME_PUBLIC_ARTICLES_URL');
  const eventDir = required(env, 'ITHOME_EVENT_DIR');
  const bootstrapState = required(env, 'ITHOME_BOOTSTRAP_STATE');
  if (!isAbsolute(eventDir)) throw new Error('ITHOME_EVENT_DIR must be absolute');
  if (!isAbsolute(bootstrapState)) throw new Error('ITHOME_BOOTSTRAP_STATE must be absolute');
  let eventDirStat;
  try { eventDirStat = lstatSync(resolve(eventDir)); }
  catch { throw new Error('Event directory must already exist'); }
  if (!eventDirStat.isDirectory() || eventDirStat.isSymbolicLink()) throw new Error('Event directory must be a direct directory');
  return {
    cdpEndpoint,
    draftsUrl,
    publicArticlesUrl,
    eventDir: resolve(eventDir),
    bootstrapState: resolve(bootstrapState),
  };
}

async function loadVerifiedBootstrap(path) {
  let stat;
  try { stat = await lstat(path); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Bootstrap state must be a direct regular file');
  const state = JSON.parse(await readFile(path, 'utf8'));
  const errors = validateBootstrapState(state);
  if (errors.length) throw new Error(`Invalid bootstrap fields: ${errors.join(', ')}`);
  return state;
}

async function createEventEmitter(config) {
  return async (event) => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'ithome-publisher-event-'));
    const input = join(tempRoot, 'event.json');
    try {
      await writeFile(input, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await execFileAsync(process.execPath, [join(SCRIPT_DIR, 'write-event.mjs'), '--input', input], {
        env: { ...process.env, ITHOME_EVENT_DIR: config.eventDir },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  };
}

export async function runBrowserPublisher({ day, env = process.env }) {
  const config = loadRunnerConfig(env);
  const project = await loadProjectConfig({ requireInitialized: true });
  const driver = createPlaywrightIthomeDriver({
    config: {
      cdpEndpoint: config.cdpEndpoint,
      draftsUrl: config.draftsUrl,
      publicArticlesUrl: config.publicArticlesUrl,
      expectedAccount: project.account,
      expectedSeriesTitle: project.seriesTitle,
      expectedContestTag: project.contestTag,
    },
  });
  const publish = createIthomeBrowserAdapter({
    driver,
    expectedAccount: project.account,
    expectedSeriesTitle: project.seriesTitle,
    expectedContestTag: project.contestTag,
    loadBootstrap: () => loadVerifiedBootstrap(config.bootstrapState),
  });
  return runUnattendedPublisher({
    day,
    prepare: prepareIthomePayload,
    publish,
    emit: await createEventEmitter(config),
    project,
  });
}

async function main() {
  const { day } = parseRunnerArgs(process.argv.slice(2));
  const result = await runBrowserPublisher({ day });
  process.stdout.write(`${JSON.stringify({ status: result.status, silent: result.silent, reasonCode: result.result.reasonCode })}\n`);
  process.exitCode = result.exitCode;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

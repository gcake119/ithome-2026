#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProjectConfig } from '../../../../scripts/ithome/config.mjs';
import { runBrowserPublisher } from './run-browser-publisher.mjs';

const taipeiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function scheduledDayForDate(schedule, date) {
  const match = schedule.find((entry) => entry?.date === date);
  return Number.isInteger(match?.day) && match.day >= 2 && match.day <= 30 ? match.day : null;
}

export async function runScheduledBrowserPublisher({
  now = new Date(),
  loadConfig = loadProjectConfig,
  runPublisher = runBrowserPublisher,
} = {}) {
  const project = await loadConfig({ requireInitialized: true });
  const date = taipeiDateFormatter.format(now);
  const day = scheduledDayForDate(project.schedule, date);
  if (!day) return { status: 'not_scheduled', date, day: null, exitCode: 0 };
  return { date, day, ...(await runPublisher({ day })) };
}

async function main() {
  const result = await runScheduledBrowserPublisher();
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    date: result.date,
    day: result.day,
    silent: result.silent ?? true,
    reasonCode: result.result?.reasonCode ?? null,
  })}\n`);
  process.exitCode = result.exitCode;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

import { existsSync } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bundledConfig from '../../ithome.config.json' with { type: 'json' };

const moduleRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO_ROOT = [moduleRepoRoot, process.cwd()].find((candidate) => (
  existsSync(path.join(candidate, 'ithome.config.json')) && existsSync(path.join(candidate, 'public'))
)) ?? moduleRepoRoot;
export const CONFIG_PATH = path.join(REPO_ROOT, 'ithome.config.json');
export const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico']);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isSafePublicAssetPath(value) {
  if (!text(value) || path.isAbsolute(value) || value.includes('..') || /^[a-z]+:/i.test(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  return normalized === path.posix.normalize(normalized) && imageExtensions.has(path.extname(normalized).toLowerCase());
}

export async function publicAssetStatus(value, publicDir = PUBLIC_DIR) {
  if (!isSafePublicAssetPath(value)) return { valid: false, exists: false, resolvedPath: null };
  const resolvedPath = path.resolve(publicDir, value);
  if (!resolvedPath.startsWith(`${path.resolve(publicDir)}${path.sep}`)) return { valid: false, exists: false, resolvedPath: null };
  try { await access(resolvedPath); return { valid: true, exists: true, resolvedPath }; }
  catch { return { valid: true, exists: false, resolvedPath }; }
}

export function validateProjectConfig(config, { requireInitialized = false } = {}) {
  const errors = [];
  if (config?.schemaVersion !== 2) errors.push('schemaVersion');
  if (config?.publication?.type !== 'ithome-ironman') errors.push('publication.type');
  if (config?.publication?.totalDays !== 30) errors.push('publication.totalDays');
  for (const key of ['account', 'seriesTitle', 'contestTag', 'contest', 'repository', 'seriesKey']) {
    if (!text(config?.publication?.[key])) errors.push(`publication.${key}`);
  }
  if (!text(config?.site?.tagline)) errors.push('site.tagline');
  for (const key of ['kicker', 'lead', 'summary']) if (!text(config?.site?.home?.[key])) errors.push(`site.home.${key}`);
  for (const key of ['title', 'description', 'sectionHeading', 'sectionLabel']) if (!text(config?.learningMap?.[key])) errors.push(`learningMap.${key}`);
  const sections = config?.learningMap?.sections;
  if (!Array.isArray(sections) || sections.length === 0) errors.push('learningMap.sections');
  else {
    const ids = new Set();
    for (const [index, section] of sections.entries()) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section?.id ?? '')) errors.push(`learningMap.sections.${index}.id`);
      if (ids.has(section?.id)) errors.push(`learningMap.sections.${index}.id:duplicate:${section?.id}`);
      ids.add(section?.id);
      if (!text(section?.title)) errors.push(`learningMap.sections.${index}.title`);
      if (!text(section?.description)) errors.push(`learningMap.sections.${index}.description`);
    }
  }
  if (typeof config?.extensions?.enabled !== 'boolean') errors.push('extensions.enabled');
  for (const key of ['title', 'description']) if (!text(config?.extensions?.[key])) errors.push(`extensions.${key}`);
  if (!text(config?.brand?.mark?.alt)) errors.push('brand.mark.alt');
  for (const [key, value] of [
    ['brand.mark.light', config?.brand?.mark?.light], ['brand.mark.dark', config?.brand?.mark?.dark],
    ['brand.favicon', config?.brand?.favicon], ['brand.appleTouchIcon', config?.brand?.appleTouchIcon],
  ]) {
    if (!isSafePublicAssetPath(value)) errors.push(key);
    else {
      const resolved = path.resolve(PUBLIC_DIR, value);
      if (!resolved.startsWith(`${PUBLIC_DIR}${path.sep}`) || !existsSync(resolved)) errors.push(key);
    }
  }
  for (const key of ['site', 'base', 'publicUrl']) if (!text(config?.githubPages?.[key])) errors.push(`githubPages.${key}`);
  try {
    const publicUrl = new URL(config?.githubPages?.publicUrl);
    if (publicUrl.protocol !== 'https:' || publicUrl.href.replace(/\/$/, '') !== config.githubPages.publicUrl) errors.push('githubPages.publicUrl');
    if (`${config.githubPages.site}${config.githubPages.base}` !== config.githubPages.publicUrl) errors.push('githubPages.urlInvariant');
  } catch { errors.push('githubPages.publicUrl'); }
  if (requireInitialized) {
    if (config?.initialized !== true) errors.push('initialized');
    const day1Date = config?.publication?.day1Date;
    if (!datePattern.test(day1Date ?? '')) errors.push('publication.day1Date');
    const schedule = config?.publication?.schedule;
    if (!Array.isArray(schedule) || schedule.length !== 30) errors.push('publication.schedule');
    else for (let index = 0; index < 30; index += 1) {
      const expected = new Date(`${day1Date}T00:00:00.000Z`);
      expected.setUTCDate(expected.getUTCDate() + index);
      if (schedule[index]?.day !== index + 1 || schedule[index]?.date !== expected.toISOString().slice(0, 10)) {
        errors.push('publication.schedule'); break;
      }
    }
  }
  return [...new Set(errors)];
}

export function loadProjectConfigSync(options) {
  const config = structuredClone(bundledConfig);
  const errors = validateProjectConfig(config, options);
  if (errors.length) throw new Error(`Invalid ithome.config.json fields: ${errors.join(', ')}`);
  return Object.assign(config, {
    account: config.publication.account,
    seriesTitle: config.publication.seriesTitle,
    contestTag: config.publication.contestTag,
    contest: config.publication.contest,
    repository: config.publication.repository,
    seriesKey: config.publication.seriesKey,
    day1Date: config.publication.day1Date,
    schedule: config.publication.schedule,
  });
}
export async function loadProjectConfig(options) { return loadProjectConfigSync(options); }
export async function saveProjectConfig(target, config) {
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
}

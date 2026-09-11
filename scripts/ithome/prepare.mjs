import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectConfig } from './config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const POSTS_DIR = path.join(REPO_ROOT, 'src/content/ironman');

function parseArgs(argv) {
  const args = { day: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') args.json = true;
    else if (token === '--day') args.day = Number(argv[++i]);
  }
  if (!Number.isInteger(args.day) || args.day < 1 || args.day > 30) {
    throw new Error('Use --day with an integer from 1 to 30.');
  }
  return args;
}

function splitFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) {
    throw new Error('Markdown must start with YAML frontmatter.');
  }
  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('Frontmatter closing delimiter not found.');
  return {
    frontmatter: markdown.slice(4, end),
    body: markdown.slice(end + 5).replace(/^\s+/, ''),
  };
}

function parseScalarFrontmatter(frontmatter) {
  const result = {};
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    const value = raw.trim().replace(/^['"]|['"]$/g, '');
    result[key] = value;
  }
  return result;
}

export async function prepareIthomePayload(day, options = {}) {
  const project = options.project ?? await loadProjectConfig({ requireInitialized: true });
  const dayString = String(day).padStart(2, '0');
  const filename = `day-${dayString}.md`;
  const sourcePath = path.join(options.postsDir ?? POSTS_DIR, filename);
  const markdown = await fs.readFile(sourcePath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(markdown);
  const meta = parseScalarFrontmatter(frontmatter);

  const frontmatterDay = Number(meta.day);
  if (frontmatterDay !== day) {
    throw new Error(`${filename}: frontmatter day=${meta.day ?? '(missing)'} does not match requested day ${day}.`);
  }
  if (!meta.title) throw new Error(`${filename}: title is required.`);
  if (!body.trim()) throw new Error(`${filename}: body is empty.`);

  const expectedDate = project.schedule.find((item) => item.day === day)?.date;
  if (!expectedDate) throw new Error(`${filename}: Day ${day} is missing from the explicit schedule.`);
  if (meta.publishDate !== expectedDate) {
    throw new Error(`${filename}: publishDate=${meta.publishDate ?? '(missing)'} does not match configured date ${expectedDate}.`);
  }
  const canonicalUrl = `${project.githubPages.publicUrl}/day/${dayString}/`;
  const syncLine = `本文同步刊載於[個人連載網站](${canonicalUrl})`;
  const ithomeBody = `${syncLine}\n\n${body.trim()}\n`;

  return {
    day,
    dayString,
    sourcePath: path.relative(REPO_ROOT, sourcePath),
    title: meta.title,
    publishDate: meta.publishDate || null,
    canonicalUrl,
    syncLine,
    body: ithomeBody,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = await prepareIthomePayload(args.day);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  console.log(`Day ${payload.dayString}`);
  console.log(`Source: ${payload.sourcePath}`);
  console.log(`Title: ${payload.title}`);
  console.log(`Publish date: ${payload.publishDate ?? '(not set)'}`);
  console.log(`Canonical: ${payload.canonicalUrl}`);
  console.log('\n--- iThome body preview ---\n');
  process.stdout.write(payload.body);
}

if (typeof process !== 'undefined' && fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((error) => {
    console.error(`[ithome:prepare] ${error.message}`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';

const internal = (file) => file === '.spectra.yaml'
  || file.startsWith('.spectra/')
  || file === 'AGENTS.md'
  || file.startsWith('openspec/')
  || file.startsWith('output/');
const publicRoots = new Set(['.agents', '.github', 'public', 'scripts', 'src']);
const publicFiles = new Set([
  '.gitignore', 'CONTRIBUTING.md', 'LICENSE', 'PRODUCT.md', 'README.md', 'SECURITY.md',
  'astro.config.mjs', 'design-qa.md', 'ithome.config.json', 'ithome.config.example.json', 'package.json', 'pnpm-lock.yaml',
  'pnpm-workspace.yaml', 'tsconfig.json',
]);
const allowed = (file) => publicFiles.has(file) || publicRoots.has(file.split('/')[0]);
async function listFiles(directory = '.', prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (internal(`${relative}/`) || ['.git', 'dist', 'node_modules'].includes(relative)) continue;
      files.push(...await listFiles(`${directory}/${entry.name}`, relative));
    } else files.push(relative);
  }
  return files;
}

const listed = existsSync('.git')
  ? execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter((file) => file && existsSync(file))
  : await listFiles();
const candidates = listed.filter((file) => allowed(file) && !internal(file));
const forbiddenCandidates = candidates.filter(internal);
if (forbiddenCandidates.length) throw new Error(`Internal planning files entered public candidate:\n${forbiddenCandidates.join('\n')}`);

const executableFiles = candidates.filter((file) => file !== 'scripts/verify-public-distribution.mjs' && /^(package\.json|README\.md|scripts\/.*\.(?:mjs|md)|src\/.*\.(?:ts|astro|js))$/.test(file));
const runtimeReferences = [];
for (const file of executableFiles) {
  const content = await readFile(file, 'utf8');
  if (/\b(?:spectra|openspec)\b/i.test(content)) runtimeReferences.push(file);
}
if (runtimeReferences.length) throw new Error(`Public runtime or documentation depends on internal planning tools:\n${runtimeReferences.join('\n')}`);
process.stdout.write(`Public distribution candidate: ${candidates.length} files; internal planning files excluded; no Spectra runtime dependency.\n`);

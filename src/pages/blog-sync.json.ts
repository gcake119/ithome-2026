import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getAllPosts, isPublished } from '../lib/posts';

/** Built with the same publication predicate as the reader; visible only after Pages deploys. */
export async function GET() {
  const now = new Date();
  const all = await getAllPosts();
  const published = all.filter(post => isPublished(post, now));
  const posts = published.map(post => {
    const slug = `day-${String(post.data.day).padStart(2, '0')}`;
    const markdown = readFileSync(`src/content/ironman/${slug}.md`);
    return { day: post.data.day, slug, sha256: createHash('sha256').update(markdown).digest('hex') };
  });
  return Response.json({
    schemaVersion: 1,
    source: 'gcake119/ithome-2026',
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    builtAt: now.toISOString(),
    publicationState: published.length === 30 ? 'completed' : 'active',
    posts,
  });
}

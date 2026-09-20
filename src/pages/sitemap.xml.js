import { loadProjectConfigSync } from '../../scripts/ithome/config.mjs';
import { dayPath, extensionPath, getPublishedExtensions, getPublishedPosts } from '../lib/posts';
import { buildSitemapXml } from '../lib/seo';

export async function GET() {
  const project = loadProjectConfigSync();
  const [posts, extensions] = await Promise.all([getPublishedPosts(), getPublishedExtensions()]);
  const base = project.githubPages.publicUrl;
  const entries = [
    { loc: `${base}/` },
    ...posts.map((post) => ({
      loc: `${base}${dayPath(post.data.day)}`,
      lastmod: (post.data.updatedDate ?? post.data.publishDate).toISOString().slice(0, 10),
    })),
    ...extensions.map((post) => ({
      loc: `${base}${extensionPath(post.data.slug)}`,
      lastmod: (post.data.updatedDate ?? post.data.publishDate).toISOString().slice(0, 10),
    })),
  ];

  return new Response(buildSitemapXml(entries), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

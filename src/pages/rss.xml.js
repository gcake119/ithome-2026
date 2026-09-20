import rss from '@astrojs/rss';
import { dayPath, extensionPath, getPublishedExtensions, getPublishedPosts } from '../lib/posts';
import { loadProjectConfigSync } from '../../scripts/ithome/config.mjs';
export async function GET(context) {
  const [posts, extensions] = await Promise.all([getPublishedPosts(), getPublishedExtensions()]);
  const project = loadProjectConfigSync();
  return rss({ title: project.publication.seriesTitle, description: project.site.home.summary, site: context.site, customData: '<language>zh-TW</language>', items: [
    ...posts.map((post) => ({ title: post.data.title, description: post.data.description, pubDate: post.data.publishDate, link: `${import.meta.env.BASE_URL}${dayPath(post.data.day).slice(1)}` })),
    ...extensions.map((post) => ({ title: post.data.title, description: post.data.description, pubDate: post.data.publishDate, link: `${import.meta.env.BASE_URL}${extensionPath(post.data.slug).slice(1)}` })),
  ] });
}

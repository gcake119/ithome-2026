import { getCollection, type CollectionEntry } from 'astro:content';
import { loadProjectConfigSync } from '../../scripts/ithome/config.mjs';
import { assertContentContract } from './content-contract';
import { hasReachedPublishDate } from './publishing-date';

export type IronmanPost = CollectionEntry<'ironman'>;
export type ExtensionPost = CollectionEntry<'extensions'>;
export type Post = IronmanPost;

export function isPublished(post: IronmanPost | ExtensionPost, now = new Date()) {
  return !post.data.draft && hasReachedPublishDate(post.data.publishDate, now);
}

export function validateContentIndex(ironman: IronmanPost[], extensions: ExtensionPost[], project = loadProjectConfigSync()) {
  assertContentContract(ironman, extensions, project);
}

export async function getContentIndex() {
  const [ironman, extensions] = await Promise.all([getCollection('ironman'), getCollection('extensions')]);
  validateContentIndex(ironman, extensions);
  return {
    ironman: ironman.sort((a, b) => a.data.day - b.data.day),
    extensions: extensions.sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf()),
  };
}

export async function getAllPosts() { return (await getContentIndex()).ironman; }
export async function getPublishedPosts(now = new Date()) { return (await getContentIndex()).ironman.filter((post) => isPublished(post, now)); }
export async function getPublishedExtensions(now = new Date()) { return (await getContentIndex()).extensions.filter((post) => isPublished(post, now)); }
export function dayPath(day: number) { return `/day/${String(day).padStart(2, '0')}/`; }
export function extensionPath(slug: string) { return `/articles/${slug}/`; }

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const ironman = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/ironman' }),
  schema: z.object({
    title: z.string().min(1), description: z.string().min(1),
    day: z.number().int().min(1).max(30), section: z.string().min(1),
    publishDate: z.coerce.date(), draft: z.boolean().default(true),
    updatedDate: z.coerce.date().optional(),
    ithomeUrl: z.string().url().optional(),
  }),
});

const extensions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/extensions' }),
  schema: z.object({
    title: z.string().min(1), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().min(1), publishDate: z.coerce.date(), updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(true), relatedDays: z.array(z.number().int().min(1).max(30)).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { ironman, extensions };

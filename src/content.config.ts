import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Articles: one Markdown file per post in src/content/articles
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// Projects: one Markdown file per project in src/content/projects
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    tech: z.array(z.string()).default([]),
    status: z.enum(['Live', 'In progress', 'Archived']).default('In progress'),
    repo: z.string().url().optional(),
    link: z.string().url().optional(),
    article: z.string().optional(), // slug of a write-up in src/content/articles
    featured: z.boolean().default(false),
    order: z.number().default(100),
  }),
});

export const collections = { articles, projects };

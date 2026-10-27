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
    // true for C# how-to guides: listed on the C# Guides page instead of Articles
    guide: z.boolean().default(false),
    // How AI was used to produce this article. Shown as a notice at the top of the page.
    ai: z.string().optional(),
  }),
});

// Projects: one Markdown file per project in src/content/projects
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.coerce.date(), // when the project was built or last significantly updated; cards sort newest first
    tech: z.array(z.string()).default([]),
    status: z.enum(['Live', 'Complete', 'In progress', 'Archived']).default('In progress'),
    repo: z.string().url().optional(),
    link: z.string().url().optional(),
    article: z.string().optional(), // slug of a write-up in src/content/articles
    featured: z.boolean().default(false),
    // How AI was used in this project. Shown on the project card.
    ai: z.string().optional(),
    order: z.number().default(100),
  }),
});

export const collections = { articles, projects };

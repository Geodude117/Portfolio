import { getCollection } from 'astro:content';

/** Published articles, newest first. Drafts appear only when running `npm run dev`. */
export async function getArticles() {
  const all = await getCollection('articles', ({ data }) => import.meta.env.DEV || !data.draft);
  return all.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** Projects, newest first by `date`. */
export async function getProjects() {
  const all = await getCollection('projects');
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf() || a.data.title.localeCompare(b.data.title));
}

/** Estimated reading time in minutes, at about 220 words a minute. */
export function readingMinutes(body: string | undefined): number {
  const words = (body ?? '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

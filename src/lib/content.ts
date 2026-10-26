import { getCollection } from 'astro:content';

/** Published articles, newest first. Drafts appear only when running `npm run dev`. */
export async function getArticles() {
  const all = await getCollection('articles', ({ data }) => import.meta.env.DEV || !data.draft);
  return all.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** Projects sorted by `order` (lowest first), then title. */
export async function getProjects() {
  const all = await getCollection('projects');
  return all.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

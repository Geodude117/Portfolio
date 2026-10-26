import rss from '@astrojs/rss';
import { getArticles } from '../lib/content';
import { SITE } from '../site';

export async function GET(context) {
  const articles = await getArticles();
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return rss({
    title: `${SITE.name} — Articles`,
    description: SITE.description,
    site: context.site,
    items: articles.map((a) => ({
      title: a.data.title,
      description: a.data.description,
      pubDate: a.data.pubDate,
      link: `${base}/articles/${a.id}/`,
    })),
  });
}

# Portfolio

My personal portfolio and blog, built with [Astro](https://astro.build) and hosted on GitHub Pages.

**Live site:** https://geodude117.github.io/Portfolio/

## Writing a new article

1. Copy `src/content/articles/_template.md` to a new file, e.g. `src/content/articles/my-new-post.md`. The file name becomes the URL.
2. Update the `title`, `description`, `pubDate` and `tags` at the top.
3. Add `guide: true` if it's a C# how-to guide, so it's listed under C# Guides instead of Articles.
4. Set `draft: false` (or remove the line) when it's ready to publish.
5. Commit and push to `main`. The site rebuilds and goes live in about a minute.

Videos: upload to YouTube or Vimeo and paste the embed snippet from the template.
Images: put them in `public/images/` and reference them as `/Portfolio/images/your-image.png`.

## Saying how AI was used

Every article and project can have an `ai:` line at the top describing how AI was used, for example:

```yaml
ai: "This article was written with Claude, an AI assistant, from my source code."
```

Articles show it as a notice under the title and an "AI used" badge in article lists; projects show it on their card. Leave the line out only if no AI was involved.

## Adding a project

Add a Markdown file to `src/content/projects/` with `title`, `summary`, `date`, `tech`, `status` (`Live`, `Complete`, `In progress` or `Archived`), optional `link`, `repo` and `article` values, and `featured: true` to show it on the home page. Projects and articles are shown as cards, newest first, by `date` and `pubDate`.

## Changing your details

Your name, intro text and links (GitHub, LinkedIn, email) live in `src/site.ts`.
Colours are defined at the top of `src/styles/global.css`.

## Running locally

Requires Node 20 or later.

```bash
npm install
npm run dev
```

Then open http://localhost:4321/Portfolio/. Drafts are visible when running locally but hidden on the live site.

## Project structure

```
src/
  content/
    articles/      ← your articles (Markdown)
    projects/      ← your projects (Markdown)
  components/      ← header, footer, cards, lists
  layouts/         ← page shell
  pages/           ← routes: home, projects, articles, RSS
  styles/          ← global styles and colour scheme
  site.ts          ← your name, intro and links
.github/workflows/ ← build and deploy to GitHub Pages
```

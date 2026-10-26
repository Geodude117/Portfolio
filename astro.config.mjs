// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages serves this repo at https://geodude117.github.io/Portfolio
// If you add a custom domain later, set `site` to it and remove `base`.
export default defineConfig({
  site: 'https://geodude117.github.io',
  base: '/Portfolio',
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});

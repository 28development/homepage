// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Canonical origin for meta tags and the sitemap link. Confirm before launch.
  site: 'https://umuttufanoglu.dev',
  server: { port: 4321 },
  devToolbar: { enabled: false },
});

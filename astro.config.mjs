import { defineConfig } from 'astro/config';

// NOTE: if you deploy to a project site like `username.github.io/repo`,
// set `base: '/repo'` below. For a user site `username.github.io`, leave as is.
export default defineConfig({
  site: 'https://hameddrzi.github.io',
  // base: '/portfolio',
  build: {
    assets: 'assets',
  },
});

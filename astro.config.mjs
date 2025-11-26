// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import svelte from '@astrojs/svelte';

import sitemap from '@astrojs/sitemap';

// 🔥 引入 Cloudflare adapter
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [svelte(), sitemap()],
  site: 'https://fastvideocutter.com', // 🔥 必須加這行

  // 🔥 1. 設定輸出模式為 server (這樣才能跑 API)
  output: 'server',
  
  // 🔥 2. 設定 Adapter (確保你已經安裝了 @astrojs/cloudflare)
  adapter: cloudflare(),
});
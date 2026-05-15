//@ts-ignore
const baseURL = process.env.NUXT_APP_BASE_URL || '/'

export default defineNuxtConfig({
  extends: ['docus'],
  pages: true,
  ssr: true,
  app: {
    baseURL,
    head: {
      titleTemplate: '%s | SkyPort Docs',
      htmlAttrs: {
        lang: 'en',
      },
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
        {
          name: 'description',
          content: 'SkyPort Docs for a self-hosted developer infrastructure platform. Learn Docker management, PM2 control, VPS operations, reverse proxy workflows, deployments, and terminal-first automation.',
        },
        {
          property: 'og:title',
          content: 'SkyPort Docs - Self-Hosted Developer Infrastructure Platform',
        },
        {
          property: 'og:description',
          content: 'Deploy apps, manage Docker, operate VPS infrastructure, and control your entire stack from one platform.',
        },
        {
          property: 'og:image',
          content: `${baseURL}logo.png`,
        },
        {
          name: 'twitter:card',
          content: 'summary_large_image',
        },
      ],
      link: [
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: `${baseURL}favicon.svg`,
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap'
        }
      ],
    },
  },
  modules: ['@nuxt/ui'],
  routeRules: {
    '/': { prerender: true },
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/sitemap.xml'],
      failOnError: false,
    },
    minify: true,
  }
})

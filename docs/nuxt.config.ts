//@ts-ignore
export default defineNuxtConfig({
  extends: ['docus'],
  pages: true,
  ssr: true,
  app: {
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
          content: 'SkyPort - Self-Hosted Infrastructure Platform. Deploy apps, manage Docker, operate VPS infrastructure, and control your entire stack from one platform.',
        },
        {
          property: 'og:title',
          content: 'SkyPort Docs - Self-Hosted Infrastructure Platform',
        },
        {
          property: 'og:description',
          content: 'Deploy apps, manage Docker, operate VPS infrastructure, and control your entire stack from one platform.',
        },
        {
          property: 'og:image',
          content: '/logo.png',
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
          href: '/favicon.svg',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap'
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
      routes: ['/sitemap.xml', '/rss.xml'],
      failOnError: false,
    },
    minify: true,
  }
})

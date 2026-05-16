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
          content: 'Deploy, manage, and scale your infrastructure with SkyPort. Self-hosted developer platform with Docker, PM2, VPS control, reverse proxy, and more.',
        },
        // Open Graph Tags
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:url',
          content: 'https://docs.skyport.akashhalder.in',
        },
        {
          property: 'og:title',
          content: 'SkyPort - Self-Hosted Developer Infrastructure Platform',
        },
        {
          property: 'og:description',
          content: 'Deploy, manage, and scale your infrastructure with SkyPort. Self-hosted developer platform with Docker, PM2, VPS control, reverse proxy, and more.',
        },
        {
          property: 'og:image',
          content: 'https://ik.imagekit.io/AkashPortfolioAssets/skyport_assets/banner.png?updatedAt=1778849231459',
        },
        {
          property: 'og:image:width',
          content: '1200',
        },
        {
          property: 'og:image:height',
          content: '630',
        },
        {
          property: 'og:image:alt',
          content: 'SkyPort - Self-Hosted Developer Infrastructure Platform',
        },
        {
          property: 'og:site_name',
          content: 'SkyPort Docs',
        },
        // Twitter Tags
        {
          name: 'twitter:card',
          content: 'summary_large_image',
        },
        {
          name: 'twitter:site',
          content: '@skyport_dev',
        },
        {
          name: 'twitter:title',
          content: 'SkyPort - Self-Hosted Developer Infrastructure Platform',
        },
        {
          name: 'twitter:description',
          content: 'Deploy, manage, and scale your infrastructure with SkyPort. Self-hosted developer platform with Docker, PM2, VPS control, reverse proxy, and more.',
        },
        {
          name: 'twitter:image',
          content: 'https://ik.imagekit.io/AkashPortfolioAssets/skyport_assets/banner.png?updatedAt=1778849231459',
        },
        // Additional Meta Tags
        {
          name: 'theme-color',
          content: '#3b82f6',
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
      script: [
        {
          async: true,
          src: 'https://www.googletagmanager.com/gtag/js?id=G-YYRT7QKXMJ',
        },
        {
          children: "window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-YYRT7QKXMJ');",
        },
      ],
    },
  },
  modules: [
    '@nuxt/ui',
  ],
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

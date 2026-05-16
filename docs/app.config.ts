// @ts-ignore

export default defineAppConfig({
  ui: {
    // 1. Set global colors to blue
    colors: {
      primary: 'blue',   // Uses your --color-blue variables from app.css
      neutral: 'slate'   // Uses your --color-neutral variables from app.css
    }
  },
  seo: {
    titleTemplate: '%s | SkyPort Docs',
    title: 'SkyPort Docs',
    description: 'Self-Hosted Infrastructure Platform Documentation',
  },
  header: {
    // This updates the text in the top-left of the site
    title: 'SkyPort Docs',
  },
  docus: {
    title: 'SkyPort Docs',
    description: 'Self-Hosted Infrastructure Platform Documentation',
    image: '/logo.png',
    theme: {
      primaryColor: 'blue'
    },
    socials: {
      github: 'Nil369/SkyPort',
      twitter: '@AkashHalder',
    },
    header: {
      logo: true,
      showLinkIcon: true,
      exclude: [],
      fluid: false,
    },
    aside: {
      level: 0,
      exclude: [],
    },
    main: {
      padded: true,
      fluid: false,
    },
    footer: {
      links: [
        {
          icon: 'i-simple-icons-github',
          label: 'GitHub',
          href: 'https://github.com/Nil369/SkyPort',
          target: '_blank',
        },
        {
          icon: 'i-simple-icons-twitter',
          label: 'Twitter',
          href: 'https://twitter.com/AkashHalder',
          target: '_blank',
        },
      ],
    },
  },
})

<script setup lang="ts">
const appConfig = useAppConfig()
const site = useSiteConfig()
const { localePath } = useDocusI18n()

const ariaLabel = appConfig.header?.title || site.name
</script>

<template>
  <NuxtLink
    :to="localePath('/')"
    class="mt-3 mb-4 flex items-center gap-3 rounded-2xl  bg-white/80 px-4 py-3  dark:bg-slate-950/70"
    :aria-label="appConfig.header?.title || 'SkyPort'"
  >
    <UColorModeImage
      light="/logo.png"
      dark="/logo.png"
      alt="SkyPort Logo"
      class="h-10 w-10 shrink-0 rounded-xl"
    />

    <div class="min-w-0 mx-0">
      <p class="truncate text-lg font-bold text-slate-950 dark:text-white">SkyPort Docs</p>
    </div>
  </NuxtLink>
</template>
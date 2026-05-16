<script setup lang="ts">
const appConfig = useAppConfig()
const site = useSiteConfig()
const { localePath } = useDocusI18n()
import { useRuntimeConfig } from '#imports'

const ariaLabel = appConfig.header?.title || site.name

const runtimeConfig = useRuntimeConfig()
const base = runtimeConfig?.app?.baseURL || '/'
const logoPath = base.endsWith('/') ? `${base}logo.png` : `${base}/logo.png`
</script>

<template>
  <NuxtLink
    :to="localePath('/')"
    class="mt-3 mb-4 flex items-center gap-3 rounded-2xl  bg-white/80 px-4 py-3  dark:bg-[#111827]/80"
    :aria-label="appConfig.header?.title || 'SkyPort'"
  >
    <UColorModeImage
      :light="logoPath"
      :dark="logoPath"
      alt="SkyPort Logo"
      class="h-10 w-10 shrink-0 rounded-xl"
    />

    <div class="min-w-0 mx-0">
      <p class="truncate text-lg font-bold text-slate-950 dark:text-white">SkyPort Docs</p>
    </div>
  </NuxtLink>
</template>
<script setup lang="ts">
useSeoMeta({
  title: 'SkyPort Docs',
  description:
    'SkyPort is a self-hosted infrastructure platform for Docker, PM2, VPS, CLI, TUI, and marketplace workflows.',
})

const primaryActions = [
  {
    label: 'Get started',
    to: '/getting-started/introduction',
    icon: 'i-lucide-rocket',
  },
  {
    label: 'CLI reference',
    to: '/cli/installation',
    icon: 'i-lucide-terminal',
  },
  {
    label: 'Dashboard guide',
    to: '/platform/dashboard',
    icon: 'i-lucide-layout-dashboard',
  },
]

const spotlightCards = [
  {
    title: 'Getting Started',
    description: 'Installation, quick start, and first deployment.',
    to: '/getting-started/introduction',
    icon: 'i-lucide-rocket',
  },
  {
    title: 'Platform',
    description: 'Dashboard, marketplace, and monitoring workflows.',
    to: '/platform/dashboard',
    icon: 'i-lucide-layout-dashboard',
  },
  {
    title: 'CLI',
    description: 'Install, authenticate, and automate from the terminal.',
    to: '/cli/installation',
    icon: 'i-lucide-terminal',
  },
  {
    title: 'Docker',
    description: 'Containers, images, networks, and runtime control.',
    to: '/docker/containers',
    icon: 'i-lucide-box',
  },
]

const productPillars = [
  {
    title: 'Docker management',
    description: 'Work with containers, images, volumes, and networks from one platform.',
    icon: 'i-lucide-package',
  },
  {
    title: 'PM2 operations',
    description: 'Run Node.js apps with zero-downtime workflows and clear log access.',
    icon: 'i-lucide-cpu',
  },
  {
    title: 'VPS and SSH',
    description: 'Connect to servers, manage files, and inspect remote infrastructure.',
    icon: 'i-lucide-server',
  },
  {
    title: 'Marketplace and monitoring',
    description: 'Install apps instantly and keep an eye on metrics and logs.',
    icon: 'i-lucide-radar',
  },
]

const quickSteps = [
  {
    title: 'Read the introduction',
    description: 'Understand SkyPort and where it fits in your stack.',
    to: '/getting-started/introduction',
  },
  {
    title: 'Install for your platform',
    description: 'Pick the right install path for Linux, Windows, macOS, Docker, or WSL.',
    to: '/getting-started/installation',
  },
  {
    title: 'Open the quick start',
    description: 'Bring the server up and verify the first workflow.',
    to: '/getting-started/quick-start',
  },
  {
    title: 'Move to first deployment',
    description: 'Deploy your first app and start using the platform.',
    to: '/getting-started/first-deployment',
  },
]
</script>

<template>
  <div class="relative isolate overflow-hidden bg-white text-slate-900 dark:bg-[#070b14] dark:text-white">

    <!-- Blue-only background -->
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_24%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_24%)]" />

    <!-- HERO -->
    <section class="relative mx-auto max-w-7xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">

      <!-- MOVED IMAGE TO TOP -->
      <div class="mb-10 lg:hidden">
        <div class="rounded-2xl border border-blue-200 bg-white/90 p-4 dark:border-blue-900 dark:bg-slate-950/80">
          <img src="https://ik.imagekit.io/AkashPortfolioAssets/skyport_assets/dashboard.png?updatedAt=1778849208333" alt="SkyPort Dashboard"
            class="w-full rounded-xl border border-blue-200 dark:border-blue-900" />
        </div>
      </div>

      <div class="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">

        <!-- TEXT -->
        <div class="space-y-6">

          <div
            class="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-300">
            <UIcon name="i-lucide-sparkles" class="h-4 w-4" />
            SkyPort Documentation
          </div>

          <div class="space-y-4">
            <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
              <span class="text-blue-600 font-semibold">Deploy</span>,
              <span class="text-blue-600 font-semibold">manage</span>, and
              <span class="text-blue-600 font-semibold">control self-hosted infrastructure</span>
              — without operational chaos.
              <br />
              Meet <span class="text-blue-600 font-semibold">SkyPort</span>.
            </h1>

            <p class="max-w-md text-base sm:text-lg leading-7 text-slate-600 dark:text-slate-300">
              A <span class="font-semibold italic">self-hosted platform</span> for
              <span class="font-semibold italic">Docker, PM2, VPS, CLI, TUI, and marketplace</span>.
              Find setup steps, guides, and references quickly.
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <UButton v-for="action in primaryActions" :key="action.label" :to="action.to" :icon="action.icon" size="lg"
              color="primary" variant="solid" :label="action.label"
              class="rounded-full px-5 bg-blue-600 hover:bg-blue-700 text-white" />
          </div>

        </div>

        <!-- IMAGE (desktop only) -->
        <div class="hidden lg:block">
          <img src="https://ik.imagekit.io/AkashPortfolioAssets/skyport_assets/dashboard.png?updatedAt=1778849208333" alt="SkyPort Dashboard"
            class="w-[40rem] h-[20rem] rounded-xl border border-blue-200 dark:border-blue-900 shadow-xl" />
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section class="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NuxtLink v-for="card in spotlightCards" :key="card.title" :to="card.to"
          class="group rounded-2xl border border-slate-200 bg-white/80 p-5 transition hover:border-blue-500/40 hover:bg-white dark:border-slate-800 dark:bg-slate-950/70 dark:hover:bg-slate-900">

          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-slate-900 dark:text-blue-300">
            <UIcon :name="card.icon" class="h-5 w-5" />
          </div>

          <h3 class="mt-4 text-lg font-semibold">{{ card.title }}</h3>
          <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {{ card.description }}
          </p>
        </NuxtLink>
      </div>

    </section>


    <section class="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div
          class="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-950/70">
          <h2 class="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">A <span
              class="text-blue-600 dark:text-blue-400">single docs surface</span> for the whole platform</h2>
          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <div v-for="pillar in productPillars" :key="pillar.title"
              class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/80">
              <div class="flex items-center gap-3">
                <div
                  class="rounded-xl border border-slate-200 bg-white p-2 text-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-300">
                  <UIcon :name="pillar.icon" class="h-5 w-5" />
                </div>
                <p class="font-semibold text-slate-950 dark:text-white">{{ pillar.title }}</p>
              </div>
              <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{{ pillar.description }}</p>
            </div>
          </div>
        </div>

        <div
          class="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-950/70">
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-blue-500 dark:text-blue-400">Quick path</p>
          <h2 class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">The shortest path in</h2>
          <div class="mt-6 space-y-3">
            <NuxtLink v-for="(step, index) in quickSteps" :key="step.title" :to="step.to"
              class="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-500/30 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-900">
              <div
                class="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-300">
                {{ index + 1 }}
              </div>
              <div>
                <p class="font-semibold text-slate-950 dark:text-white">{{ step.title }}</p>
                <p class="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{{ step.description }}</p>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

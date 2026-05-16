<script setup lang="ts">
const socials = [
    {
        label: 'Website',
        href: 'https://akashhalder.in',
        icon: 'i-lucide-globe',
    },
    {
        label: 'LinkedIn',
        href: 'https://in.linkedin.com/in/akash-halder-nil?trk=public_profile',
        icon: 'i-lucide-linkedin',
    },
    {
        label: 'GitHub',
        href: 'https://github.com/Nil369',
        icon: 'i-lucide-github',
    },
    {
        label: 'YouTube',
        href: 'https://youtube.com/@akashcodinghub?si=js9ZgWS5w8gtlnm1',
        icon: 'i-lucide-youtube',
    },
    {
        label: 'X',
        href: 'https://x.com/HalderXi',
        icon: 'i-lucide-twitter',
    },
    {
        label: 'Instagram',
        href: 'https://www.instagram.com/akash_coding_hub/',
        icon: 'i-lucide-instagram',
    },
]

// Docus/Nuxt Color Mode
const colorMode = useColorMode()

const toggleTheme = () => {
    colorMode.preference =
        colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
    <div class="flex items-center justify-end gap-2">

        <!-- Social icons -->
        <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener noreferrer"
            :aria-label="social.label"
            class="group flex h-9 w-9 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 transition hover:bg-blue-600 hover:text-white dark:border-blue-900 dark:bg-slate-950 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white">
            <UIcon :name="social.icon" class="h-4 w-4" />
        </a>

        <!-- Divider -->
        <div class="mx-1 h-6 w-px bg-blue-200 dark:bg-blue-900" />

        <!-- Theme toggle -->
        <button @click="toggleTheme"
            class="flex h-9 w-9 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 transition hover:bg-blue-600 hover:text-white dark:border-blue-900 dark:bg-slate-950 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
            aria-label="Toggle theme">
            <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="h-4 w-4" />
        </button>

    </div>
</template>
<template>
  <div>
    <!-- This is the button in the header -->
    <AppSearchControl />

    <!-- This is the modal that opens with Ctrl+K -->
    <UContentSearch>
      <template>
        <div class="border-t border-gray-200 dark:border-gray-800 py-6 px-4">
          <div class="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="SkyPort"
              class="h-8 w-8 rounded-md"
            >
            <div>
              <p class="font-bold text-sm text-gray-900 dark:text-white">SkyPort Docs</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Self-hosted infrastructure platform
              </p>
            </div>
          </div>
        </div>
      </template>
    </UContentSearch>
  </div>
</template>

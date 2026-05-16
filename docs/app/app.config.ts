export default defineAppConfig({
  ui: {
    prose: {
      codeIcon: {
        // Replace the failing vscode-icons with reliable Lucide icons
        sh: 'i-lucide-terminal',
        bash: 'i-ph-terminal-window-duotone',
        terminal: 'i-ph-terminal-window-duotone',
      }
    },
    colors: {
      primary: 'blue',
      neutral: 'gray'
    }
  }
})

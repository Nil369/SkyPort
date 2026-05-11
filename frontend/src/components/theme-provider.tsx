import { createContext, useContext, useEffect, useMemo, useState } from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  effectiveTheme: "dark" | "light"
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  effectiveTheme: "dark",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  const [effectiveTheme, setEffectiveTheme] = useState<"dark" | "light">(() => {
    if (theme === "dark" || theme === "light") return theme
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
      ? "dark"
      : "light"
  })

  useEffect(() => {
    const root = window.document.documentElement

    const apply = (nextEffective: "dark" | "light") => {
      root.classList.remove("light", "dark")
      root.classList.add(nextEffective)
      setEffectiveTheme(nextEffective)
    }

    if (theme === "dark" || theme === "light") {
      apply(theme)
      return
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => apply(media.matches ? "dark" : "light")
    sync()

    // Keep system theme in sync at runtime.
    media.addEventListener?.("change", sync)
    return () => media.removeEventListener?.("change", sync)
  }, [theme])

  const value = useMemo<ThemeProviderState>(
    () => ({
      theme,
      effectiveTheme,
      setTheme: (nextTheme: Theme) => {
        localStorage.setItem(storageKey, nextTheme)
        setTheme(nextTheme)
      },
    }),
    [theme, effectiveTheme, storageKey]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
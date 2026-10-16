import { useEffect, useState } from 'react'

export function readPreference(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

export function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* In-memory preferences still work. */ }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => readPreference('gq-theme', 'light') === 'dark' ? 'dark' : 'light')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    savePreference('gq-theme', theme)
  }, [theme])
  return { theme, toggle: () => setTheme((value) => value === 'dark' ? 'light' : 'dark') }
}

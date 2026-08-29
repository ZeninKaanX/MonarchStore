export const THEME_STORAGE_KEY = 'monarch-theme'

export function normaliseTheme(value) {
  return value === 'dark' ? 'dark' : 'light'
}

export function storedTheme(storage) {
  try {
    return normaliseTheme(storage?.getItem?.(THEME_STORAGE_KEY))
  } catch {
    return 'light'
  }
}

export function nextTheme(theme) {
  return normaliseTheme(theme) === 'dark' ? 'light' : 'dark'
}

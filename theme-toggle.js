import { THEME_STORAGE_KEY, nextTheme, normaliseTheme, storedTheme } from './client/theme-ui-core.js'

function applyTheme(theme) {
  const value = normaliseTheme(theme)
  document.documentElement.dataset.theme = value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#0a111b' : '#f6f7fa')
  return value
}

function updateToggle(button, theme) {
  const isDark = theme === 'dark'
  button.setAttribute('aria-pressed', String(isDark))
  button.setAttribute('aria-label', isDark ? 'Açık temaya geç' : 'Koyu temaya geç')
  const label = button.querySelector('.theme-toggle-text')
  if (label) label.textContent = isDark ? 'Açık' : 'Koyu'
}

export function bindThemeToggle(button) {
  if (!button) return
  let theme = applyTheme(storedTheme(window.localStorage))
  updateToggle(button, theme)
  button.addEventListener('click', () => {
    theme = applyTheme(nextTheme(theme))
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Tarayıcı depolaması kapalıysa seçim yalnızca açık sekmede kalır.
    }
    updateToggle(button, theme)
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bindThemeToggle(document.querySelector('#themeToggle')), { once: true })
} else {
  bindThemeToggle(document.querySelector('#themeToggle'))
}

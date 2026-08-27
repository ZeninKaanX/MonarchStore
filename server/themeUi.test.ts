import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY, nextTheme, normaliseTheme, storedTheme } from '../client/theme-ui-core.js'

describe('mağaza tema tercihi', () => {
  it('sadece desteklenen koyu tema değerini kabul eder', () => {
    expect(normaliseTheme('dark')).toBe('dark')
    expect(normaliseTheme('light')).toBe('light')
    expect(normaliseTheme('bilinmeyen')).toBe('light')
  })

  it('kayıtlı tercihi güvenli biçimde okur ve koyu/açık geçişi yapar', () => {
    const storage = { getItem: (key: string) => key === THEME_STORAGE_KEY ? 'dark' : null }
    expect(storedTheme(storage)).toBe('dark')
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
  })
})

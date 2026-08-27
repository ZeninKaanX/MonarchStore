import { describe, expect, it } from 'vitest'
import { getCartTotalTl, isDiscordUsername, normalizeDiscordUsername, summarizeCart } from '../order-queue-core.js'

describe('sipariş kuyruğu temel kuralları', () => {
  it('yalnızca tanımlı ürünleri birleştirir ve toplamı katalogya göre hesaplar', () => {
    const items = summarizeCart([{ sku: 'afk_bot', quantity: 1 }, { sku: 'afk_bot', quantity: 2 }, { sku: 'sahte', quantity: 9 }])
    expect(items).toEqual([{ sku: 'afk_bot', quantity: 3 }])
    expect(getCartTotalTl(items)).toBe(150)
  })

  it('Discord kullanıcı adını @ işareti olmadan, küçük harfle saklar', () => {
    expect(normalizeDiscordUsername(' @Monarch.Player ')).toBe('monarch.player')
    expect(isDiscordUsername('@Monarch.Player')).toBe(true)
    expect(isDiscordUsername('geçersiz kullanıcı adı')).toBe(false)
  })
})

export const PRODUCT_CATALOG = Object.freeze({
  afk_bot: Object.freeze({ name: 'AFK Bot', priceTl: 50 }),
  miner_bot: Object.freeze({ name: 'Miner Bot', priceTl: 180 }),
  farmer_bot: Object.freeze({ name: 'Farmer Bot', priceTl: 390 }),
  uiux_starter: Object.freeze({ name: 'Temel UI/UX Tasarım', priceTl: 150 }),
  uiux_pro: Object.freeze({ name: 'Gelişmiş Web & Mobil UI/UX', priceTl: 350 }),
  uiux_custom: Object.freeze({ name: 'Özel Komple Arayüz Tasarımı', priceTl: 500 }),
  sunum_basic: Object.freeze({ name: 'Standart Sunum Tasarımı', priceTl: 75 }),
  sunum_pro: Object.freeze({ name: 'Proje & Ödev Sunumu', priceTl: 120 }),
  sunum_premium: Object.freeze({ name: 'Kurumsal Premium Sunum', priceTl: 200 })
})

export function normalizeDiscordUsername (value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase()
}

export function isDiscordUsername (value) {
  return /^[a-z0-9._]{2,32}$/.test(normalizeDiscordUsername(value))
}

export function summarizeCart (cart) {
  const merged = new Map()
  for (const item of cart || []) {
    const sku = String(item?.sku || '')
    const quantity = Number(item?.quantity || 0)
    if (!PRODUCT_CATALOG[sku] || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) continue
    merged.set(sku, Math.min(10, (merged.get(sku) || 0) + quantity))
  }
  return [...merged.entries()].map(([sku, quantity]) => ({ sku, quantity }))
}

export function getCartTotalTl (cart) {
  return summarizeCart(cart).reduce((total, item) => total + PRODUCT_CATALOG[item.sku].priceTl * item.quantity, 0)
}

export function formatCart (cart) {
  return summarizeCart(cart).map((item) => ({
    ...item,
    name: PRODUCT_CATALOG[item.sku].name,
    unitPriceTl: PRODUCT_CATALOG[item.sku].priceTl,
    lineTotalTl: PRODUCT_CATALOG[item.sku].priceTl * item.quantity
  }))
}

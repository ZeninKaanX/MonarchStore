function normalizeDiscordUsername (value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase()
}

function normalizeOrderCode (value) {
  return String(value || '').trim().toUpperCase()
}

function sanitizeChannelName (value) {
  return String(value || 'musteri')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42) || 'musteri'
}

function formatOrderItems (items) {
  if (!Array.isArray(items)) return 'Ürün bilgisi bulunamadı'
  const catalog = {
    afk_bot: { name: 'AFK Bot', price: 50 },
    miner_bot: { name: 'Miner Bot', price: 180 },
    farmer_bot: { name: 'Farmer Bot', price: 390 }
  }
  return items.map((item) => {
    const product = catalog[item?.sku] || { name: 'Bilinmeyen ürün', price: 0 }
    const quantity = Math.max(1, Math.min(10, Number(item?.quantity) || 1))
    return `• ${product.name} × ${quantity} — ${product.price * quantity} TL`
  }).join('\n') || 'Ürün bilgisi bulunamadı'
}

function getNextQueuePosition (orders) {
  return (orders || []).reduce((highest, order) => {
    if (!['queued', 'in_progress'].includes(order?.status)) return highest
    return Math.max(highest, Number(order?.queue_position) || 0)
  }, 0) + 1
}

function isOpenOrderStatus (status) {
  return ['pending_validation', 'processing', 'validated', 'queued', 'in_progress'].includes(status)
}

module.exports = {
  normalizeDiscordUsername,
  normalizeOrderCode,
  sanitizeChannelName,
  formatOrderItems,
  getNextQueuePosition,
  isOpenOrderStatus
}

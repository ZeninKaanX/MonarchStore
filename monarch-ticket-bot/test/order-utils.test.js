const assert = require('node:assert/strict')
const test = require('node:test')
const { formatOrderItems, getNextQueuePosition, normalizeDiscordUsername, sanitizeChannelName } = require('../src/order-utils')

test('Discord kullanıcı adı normalleştirilir', () => {
  assert.equal(normalizeDiscordUsername(' @Monarch.Player '), 'monarch.player')
})

test('ürün özeti ve sıra yardımcıları güvenli çıktı üretir', () => {
  assert.match(formatOrderItems([{ sku: 'afk_bot', quantity: 2 }]), /AFK Bot × 2 — 100 TL/)
  assert.equal(getNextQueuePosition([{ status: 'queued', queue_position: 2 }, { status: 'closed', queue_position: 99 }]), 3)
  assert.equal(sanitizeChannelName('Nexus Test/Üye'), 'nexus-test-ye')
})

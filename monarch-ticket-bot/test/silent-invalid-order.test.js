const assert = require('node:assert/strict')
const test = require('node:test')
const { ChannelType } = require('discord.js')
const { createOrderQueue } = require('../src/orders')
const { loadStore } = require('../src/util')

test('sunucuda bulunmayan kullanıcı talebi sessizce silinir; ticket veya satın alım mesajı oluşmaz', async () => {
  const guildId = 'silent-delete-guild'
  const store = loadStore()
  store.orderSettings[guildId] = {
    purchaseChannelId: 'purchase-channel',
    ticketCategoryId: 'ticket-category',
    staffRoleId: 'staff-role',
    voiceChannelId: 'voice-channel'
  }

  let deleteCalls = 0
  let ticketCreateCalls = 0
  let purchaseSendCalls = 0
  const request = { id: 'request-1', order_code: 'TEST0001', discord_username: 'not.a.member', items: [{ sku: 'afk_bot', quantity: 1 }], total_tl: 50 }
  const supabaseClient = {
    rpc: async (name) => {
      if (name === 'monarch_claim_pending_order_requests') return { data: [request], error: null }
      if (name === 'monarch_requeue_stalled_order_requests') return { data: 0, error: null }
      throw new Error(`Beklenmeyen RPC: ${name}`)
    },
    from: () => ({
      delete: () => ({
        eq: () => ({
          eq: () => {
            deleteCalls++
            return { error: null }
          }
        })
      }),
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({ limit: async () => ({ data: [], error: null }) })
          })
        })
      })
    })
  }
  const purchaseChannel = { id: 'purchase-channel', isTextBased: () => true, send: async () => { purchaseSendCalls++ } }
  const category = { id: 'ticket-category', type: ChannelType.GuildCategory }
  const voiceChannel = { id: 'voice-channel', isVoiceBased: () => true }
  const guild = {
    id: guildId,
    channels: {
      cache: new Map(),
      fetch: async (id) => ({ 'purchase-channel': purchaseChannel, 'ticket-category': category, 'voice-channel': voiceChannel }[id] || null),
      create: async () => { ticketCreateCalls++ }
    },
    roles: { fetch: async () => ({ id: 'staff-role' }) },
    members: { fetch: async () => null }
  }
  const client = { guilds: { cache: new Map([[guildId, guild]]) } }
  const queue = createOrderQueue({ supabaseClient, pollIntervalMs: 1000, logger: { error: () => {} } })

  await queue.tick(client, guildId)

  assert.equal(deleteCalls, 1)
  assert.equal(ticketCreateCalls, 0)
  assert.equal(purchaseSendCalls, 0)
})

const assert = require('node:assert/strict')
const test = require('node:test')
const { ChannelType } = require('discord.js')
const { createOrderQueue } = require('../src/orders')
const { loadStore } = require('../src/util')

test('panelden iptal edilen veya silinen siparisin Discord kanali otomatik olarak silinir', async () => {
  const guildId = 'cleanup-guild'
  const store = loadStore()
  store.orderSettings[guildId] = {
    purchaseChannelId: 'purchase-channel',
    ticketCategoryId: 'ticket-category',
    staffRoleId: 'staff-role',
    voiceChannelId: 'voice-channel'
  }

  let channelDeleted = false
  let purchaseMsgDeleted = false
  let supabaseUpdated = false

  const cancelledOrder = {
    id: 'cancelled-1',
    order_code: 'DEL0001',
    status: 'cancelled',
    ticket_channel_id: 'ticket-to-delete',
    purchase_message_id: 'msg-to-delete'
  }

  const mockChannel = {
    id: 'ticket-to-delete',
    isTextBased: () => true,
    delete: async () => { channelDeleted = true }
  }

  const mockPurchaseMsg = {
    id: 'msg-to-delete',
    delete: async () => { purchaseMsgDeleted = true }
  }

  const purchaseChannel = {
    id: 'purchase-channel',
    isTextBased: () => true,
    messages: {
      fetch: async (id) => (id === 'msg-to-delete' ? mockPurchaseMsg : null)
    }
  }

  const category = { id: 'ticket-category', type: ChannelType.GuildCategory }
  const voiceChannel = { id: 'voice-channel', isVoiceBased: () => true }

  const supabaseClient = {
    rpc: async (name) => {
      if (name === 'monarch_claim_pending_order_requests') return { data: [], error: null }
      if (name === 'monarch_requeue_stalled_order_requests') return { data: 0, error: null }
      throw new Error(`Beklenmeyen RPC: ${name}`)
    },
    from: (table) => ({
      select: () => ({
        in: () => ({
          limit: async () => ({ data: [cancelledOrder], error: null })
        }),
        eq: () => ({
          is: () => ({
            order: () => ({ limit: async () => ({ data: [], error: null }) })
          })
        })
      }),
      update: (fields) => ({
        eq: () => {
          if (fields.ticket_channel_id === null && fields.purchase_message_id === null) {
            supabaseUpdated = true
          }
          return { error: null }
        }
      })
    })
  }

  const guild = {
    id: guildId,
    channels: {
      cache: new Map(),
      fetch: async (id) => ({
        'purchase-channel': purchaseChannel,
        'ticket-category': category,
        'voice-channel': voiceChannel,
        'ticket-to-delete': mockChannel
      }[id] || null)
    },
    roles: { fetch: async () => ({ id: 'staff-role' }) },
    members: { fetch: async () => null }
  }

  const client = { guilds: { cache: new Map([[guildId, guild]]) } }
  const queue = createOrderQueue({ supabaseClient, pollIntervalMs: 1000, logger: { error: () => {}, log: () => {} } })

  await queue.tick(client, guildId)

  assert.equal(channelDeleted, true, 'Discord ticket kanalı silinmeliydi')
  assert.equal(purchaseMsgDeleted, true, 'Satın alım kart mesajı silinmeliydi')
  assert.equal(supabaseUpdated, true, 'Supabase kanal ID referansları temizlenmeliydi')
})

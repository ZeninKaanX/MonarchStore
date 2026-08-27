const assert = require('node:assert/strict')
const test = require('node:test')
const { PermissionFlagsBits } = require('discord.js')
const { buildPrivateTicketOverwrites, configuredForOrders, findExactGuildMember, findDemandRole, assignDemandRole, createOrderQueue, saveOrderSettings } = require('../src/orders')

test('sipariş ticketı herkese kapalıdır ve yalnızca müşteri ile ekip rolüne açılır', () => {
  const overwrites = buildPrivateTicketOverwrites('guild-1', 'member-1', 'staff-role-1')
  assert.equal(overwrites.length, 3)
  assert.deepEqual(overwrites[0], { id: 'guild-1', deny: [PermissionFlagsBits.ViewChannel] })
  assert.equal(overwrites[1].id, 'member-1')
  assert.ok(overwrites[1].allow.includes(PermissionFlagsBits.SendMessages))
  assert.equal(overwrites[2].id, 'staff-role-1')
  assert.ok(overwrites[2].allow.includes(PermissionFlagsBits.ManageMessages))
})

test('Talep rolü müşteri ticketlarına erişim veren izin listesinin parçası değildir', () => {
  const overwrites = buildPrivateTicketOverwrites('guild-1', 'member-1', 'staff-role-1')
  assert.equal(overwrites.some((overwrite) => overwrite.id === 'talep-role-1'), false)
})

test('Talep rolü yalnızca aynı isimli mevcut ve uygulama tarafından yönetilmeyen rolden bulunur', () => {
  const roles = [
    { id: 'guild-1', name: '@everyone', managed: false },
    { id: 'talep-role-1', name: 'Talep', managed: false }
  ]
  const guild = { id: 'guild-1', roles: { cache: { find: (predicate) => roles.find(predicate) } } }
  assert.equal(findDemandRole(guild).id, 'talep-role-1')
  assert.throws(() => findDemandRole({ id: 'guild-1', roles: { cache: { find: () => null } } }), /Talep/)
})

test('doğrulanmış müşteriye Talep rolü yalnızca bot yeterli yetkiye sahipse atanır', async () => {
  const added = []
  const demandRole = { id: 'talep-role-1', position: 5 }
  const member = {
    roles: {
      cache: { has: () => false },
      add: async (role, reason) => added.push({ role, reason })
    }
  }
  const guild = {
    members: {
      me: {
        permissions: { has: (permission) => permission === PermissionFlagsBits.ManageRoles },
        roles: { highest: { position: 10 } }
      }
    }
  }
  assert.equal(await assignDemandRole(guild, member, demandRole), true)
  assert.equal(added.length, 1)
  assert.equal(added[0].role.id, 'talep-role-1')
  assert.match(added[0].reason, /doğrulanmış sipariş/i)
})

test('Talep rolü yoksa doğrulanmış sipariş ticket veya satın alım bildirimi oluşturmadan durur', async () => {
  const logs = []
  let ticketCreates = 0
  let purchaseMessages = 0
  const guildId = 'role-missing-guild'
  const member = { id: 'member-1', user: { username: 'valid.member' } }
  const collection = {
    filter: (predicate) => {
      const matches = [member].filter(predicate)
      return { size: matches.length, first: () => matches[0] }
    }
  }
  const purchaseChannel = { isTextBased: () => true, send: async () => { purchaseMessages++ } }
  const guild = {
    id: guildId,
    channels: {
      fetch: async (id) => ({
        purchase: purchaseChannel,
        category: { type: 4 },
        staff: { id: 'staff' },
        voice: { isVoiceBased: () => true }
      }[id]),
      create: async () => { ticketCreates++ }
    },
    roles: { cache: { find: () => null } },
    members: { fetch: async () => collection }
  }
  const supabaseClient = {
    rpc: async (name) => {
      if (name === 'monarch_claim_pending_order_requests') return { data: [{ id: 'request-1', order_code: 'MON-1', discord_username: 'valid.member', items: [], total_tl: 50 }], error: null }
      return { data: [], error: null }
    }
  }
  saveOrderSettings(guildId, { purchaseChannelId: 'purchase', ticketCategoryId: 'category', staffRoleId: 'staff', voiceChannelId: 'voice' })
  const queue = createOrderQueue({ supabaseClient, logger: { error: (...args) => logs.push(args.join(' ')) } })
  await queue.tick({ guilds: { cache: new Map([[guildId, guild]]) } }, guildId)
  assert.equal(ticketCreates, 0)
  assert.equal(purchaseMessages, 0)
  assert.ok(logs.length >= 1)
})

test('sipariş yapılandırması yalnızca dört mevcut Discord kaynağı birlikte seçildiğinde geçerlidir', () => {
  assert.equal(configuredForOrders({ purchaseChannelId: 'p', ticketCategoryId: 'c', staffRoleId: 'r', voiceChannelId: 'v' }), true)
  assert.equal(configuredForOrders({ purchaseChannelId: 'p', ticketCategoryId: 'c', staffRoleId: 'r' }), false)
})

test('üyelik doğrulaması yalnızca Discord kullanıcı adının tam eşleşmesini kabul eder', async () => {
  const candidates = [
    { id: '1', user: { username: 'Monarch.Player' } },
    { id: '2', user: { username: 'monarch-player' } }
  ]
  const collection = {
    filter: (predicate) => {
      const matches = candidates.filter(predicate)
      return { size: matches.length, first: () => matches[0] }
    }
  }
  const guild = { members: { fetch: async ({ query }) => { assert.equal(query, 'monarch.player'); return collection } } }
  const member = await findExactGuildMember(guild, ' @MONARCH.PLAYER ')
  assert.equal(member?.id, '1')
})

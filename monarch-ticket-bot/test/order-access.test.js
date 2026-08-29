const assert = require('node:assert/strict')
const test = require('node:test')
const { PermissionFlagsBits } = require('discord.js')
const { buildPrivateTicketOverwrites, configuredForOrders, findExactGuildMember } = require('../src/orders')

test('sipariş ticketı herkese kapalıdır ve yalnızca müşteri ile ekip rolüne açılır', () => {
  const overwrites = buildPrivateTicketOverwrites('guild-1', 'member-1', 'staff-role-1')
  assert.equal(overwrites.length, 3)
  assert.deepEqual(overwrites[0], { id: 'guild-1', deny: [PermissionFlagsBits.ViewChannel] })
  assert.equal(overwrites[1].id, 'member-1')
  assert.ok(overwrites[1].allow.includes(PermissionFlagsBits.SendMessages))
  assert.equal(overwrites[2].id, 'staff-role-1')
  assert.ok(overwrites[2].allow.includes(PermissionFlagsBits.ManageMessages))
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

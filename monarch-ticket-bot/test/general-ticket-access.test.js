const assert = require('node:assert/strict')
const test = require('node:test')
const { PermissionFlagsBits } = require('discord.js')
const { buildGeneralTicketOverwrites } = require('../src/tickets')

test('genel destek ticketı da herkese kapalı, sadece talep sahibi ve seçilen ekibe açıktır', () => {
  const overwrites = buildGeneralTicketOverwrites('guild-1', 'user-1', 'staff-1')
  assert.equal(overwrites.length, 3)
  assert.deepEqual(overwrites[0], { id: 'guild-1', deny: [PermissionFlagsBits.ViewChannel] })
  assert.equal(overwrites[1].id, 'user-1')
  assert.ok(overwrites[2].allow.includes(PermissionFlagsBits.ManageMessages))
})

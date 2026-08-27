const test = require('node:test')
const assert = require('node:assert/strict')
const { countActiveHumanMembers, normalizeInterval, createCommunityStatsSync } = require('../src/community-stats')

function makeGuild () {
  return {
    id: 'guild-1',
    members: {
      cache: new Map([
        ['online', { user: { bot: false }, presence: { status: 'online' } }],
        ['idle', { user: { bot: false }, presence: { status: 'idle' } }],
        ['dnd', { user: { bot: false }, presence: { status: 'dnd' } }],
        ['offline', { user: { bot: false }, presence: { status: 'offline' } }],
        ['bot', { user: { bot: true }, presence: { status: 'online' } }]
      ])
    }
  }
}

test('yalnızca çevrimiçi insan üyeleri sayar', () => {
  assert.equal(countActiveHumanMembers(makeGuild()), 3)
})

test('senkronizasyon aralığını en az otuz saniye ile sınırlar', () => {
  assert.equal(normalizeInterval(1_000), 30_000)
  assert.equal(normalizeInterval(90_000), 90_000)
  assert.equal(normalizeInterval('geçersiz'), 60_000)
})

test('sayacı tek Discord satırına service-role istemcisiyle yazar', async () => {
  const calls = []
  const supabaseClient = {
    from: (table) => ({
      upsert: async (payload, options) => {
        calls.push({ table, payload, options })
        return { error: null }
      }
    })
  }
  const sync = createCommunityStatsSync({
    supabaseClient,
    now: () => new Date('2026-08-27T10:00:00.000Z')
  })

  const result = await sync.syncGuild(makeGuild())
  assert.deepEqual(result, { activeMemberCount: 3, updatedAt: '2026-08-27T10:00:00.000Z' })
  assert.deepEqual(calls, [{
    table: 'monarch_community_stats',
    payload: { source: 'discord', active_member_count: 3, updated_at: '2026-08-27T10:00:00.000Z' },
    options: { onConflict: 'source' }
  }])
})

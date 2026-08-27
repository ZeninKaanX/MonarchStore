import { describe, expect, it } from 'vitest'
import { COMMUNITY_STATS_STALE_AFTER_MS, isFreshCommunityStat } from '../client/community-stats-ui-core.js'

describe('mağaza topluluk göstergesi', () => {
  const now = Date.parse('2026-08-27T10:00:00.000Z')

  it('geçerli ve güncel aktif üye sayısını kabul eder', () => {
    expect(isFreshCommunityStat({ active_member_count: 42, updated_at: '2026-08-27T09:59:30.000Z' }, now)).toBe(true)
  })

  it('veri yoksa, geçersizse veya eskiyse yanıltıcı sayı göstermez', () => {
    expect(isFreshCommunityStat(null, now)).toBe(false)
    expect(isFreshCommunityStat({ active_member_count: -1, updated_at: '2026-08-27T09:59:30.000Z' }, now)).toBe(false)
    expect(isFreshCommunityStat({ active_member_count: 2, updated_at: new Date(now - COMMUNITY_STATS_STALE_AFTER_MS - 1).toISOString() }, now)).toBe(false)
  })
})

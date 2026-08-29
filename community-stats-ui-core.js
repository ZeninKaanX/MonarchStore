export const COMMUNITY_STATS_REFRESH_MS = 60_000
export const COMMUNITY_STATS_STALE_AFTER_MS = 180_000

export function isFreshCommunityStat (data, now = Date.now()) {
  const count = Number(data?.active_member_count)
  const updatedAt = Date.parse(data?.updated_at || '')
  return Number.isInteger(count) && count >= 0 && Number.isFinite(updatedAt) && now - updatedAt >= 0 && now - updatedAt <= COMMUNITY_STATS_STALE_AFTER_MS
}

export function communityUpdatedLabel (value) {
  const date = new Date(value)
  return `Son güncelleme: ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
}

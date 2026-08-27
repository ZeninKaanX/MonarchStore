const { createClient } = require('@supabase/supabase-js')

const ACTIVE_PRESENCE_STATUSES = new Set(['online', 'idle', 'dnd'])
const MIN_SYNC_INTERVAL_MS = 30_000
const DEFAULT_SYNC_INTERVAL_MS = 60_000

function countActiveHumanMembers (guild) {
  if (!guild?.members?.cache) return 0
  let count = 0
  for (const member of guild.members.cache.values()) {
    const status = String(member.presence?.status || 'offline').toLowerCase()
    if (!member.user?.bot && ACTIVE_PRESENCE_STATUSES.has(status)) count += 1
  }
  return count
}

function normalizeInterval (value) {
  const candidate = Number(value)
  return Number.isFinite(candidate) ? Math.max(MIN_SYNC_INTERVAL_MS, candidate) : DEFAULT_SYNC_INTERVAL_MS
}

function createCommunityStatsSync ({ supabaseUrl, serviceRoleKey, syncIntervalMs, supabaseClient, logger = console, now = () => new Date() }) {
  if (!supabaseClient && (!supabaseUrl || !serviceRoleKey)) throw new Error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY zorunludur.')

  const supabase = supabaseClient || createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const intervalMs = normalizeInterval(syncIntervalMs)
  let busy = false
  let interval = null
  let scheduled = null
  let client = null
  let targetGuildId = null
  let listeners = []

  async function syncGuild (guild) {
    if (!guild) throw new Error('Discord sunucusu bulunamadı.')
    const activeMemberCount = countActiveHumanMembers(guild)
    const updatedAt = now().toISOString()
    const { error } = await supabase
      .from('monarch_community_stats')
      .upsert({ source: 'discord', active_member_count: activeMemberCount, updated_at: updatedAt }, { onConflict: 'source' })
    if (error) throw error
    return { activeMemberCount, updatedAt }
  }

  async function tick () {
    if (busy) return null
    busy = true
    try {
      const guild = client?.guilds?.cache?.get(targetGuildId)
      if (!guild) throw new Error('GUILD_ID ile belirtilen Discord sunucusu botun erişiminde değil.')
      return await syncGuild(guild)
    } catch (error) {
      logger.error('[TOPLULUK] Aktif üye sayısı güncellenemedi:', error.message)
      return null
    } finally {
      busy = false
    }
  }

  function scheduleSync (guildId) {
    if (guildId !== targetGuildId || scheduled) return
    scheduled = setTimeout(() => {
      scheduled = null
      tick()
    }, 5_000)
  }

  function stop () {
    if (interval) clearInterval(interval)
    if (scheduled) clearTimeout(scheduled)
    interval = null
    scheduled = null
    for (const [event, handler] of listeners) client?.off?.(event, handler)
    listeners = []
  }

  function start (nextClient, nextTargetGuildId) {
    stop()
    client = nextClient
    targetGuildId = nextTargetGuildId
    const onPresenceUpdate = (oldPresence, newPresence) => scheduleSync(newPresence?.guild?.id || oldPresence?.guild?.id)
    const onMemberChange = (member) => scheduleSync(member?.guild?.id)
    listeners = [['presenceUpdate', onPresenceUpdate], ['guildMemberAdd', onMemberChange], ['guildMemberRemove', onMemberChange]]
    for (const [event, handler] of listeners) client.on(event, handler)
    tick()
    interval = setInterval(tick, intervalMs)
    return stop
  }

  return { start, stop, tick, syncGuild, countActiveHumanMembers, intervalMs }
}

module.exports = { ACTIVE_PRESENCE_STATUSES, countActiveHumanMembers, normalizeInterval, createCommunityStatsSync }

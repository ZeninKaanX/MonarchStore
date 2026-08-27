const { PermissionFlagsBits } = require('discord.js')
const { loadStore, saveStore, logTo } = require('./util')
const { freezeMember } = require('./freeze')

const WINDOW = 3000
const MAX_MSGS = 4
const MAX_MENTIONS = 3
const STRIKE_RESET_MS = 30 * 60 * 1000
const RAID_JOINS = 5
const RAID_WINDOW = 10000
const RAID_DURATION = 600000
const RAID_ACCOUNT_DAYS = 14
const BAN_ACCOUNT_DAYS = 1
const LINK_AGE_DAYS = 7
const NEW_ACCOUNT_KICK_DAYS = 1

const spam = {}
const strikes = {}
const joins = {}
const raidUntil = {}

function isEnabled (gid) {
  const s = loadStore()
  return !!(s.security && s.security[gid] && s.security[gid].enabled)
}

async function deleteAll (guild, msgs) {
  const byChan = {}
  for (const m of msgs) (byChan[m.channelId] = byChan[m.channelId] || []).push(m)
  for (const [cid, list] of Object.entries(byChan)) {
    const ch = guild.channels.cache.get(cid)
    if (!ch) continue
    try {
      if (list.length >= 2) await ch.bulkDelete(list.map((m) => m.id))
      else await list[0].delete()
    } catch {
      for (const m of list) m.delete().catch(() => null)
    }
  }
}

async function handleMessage (message) {
  if (!message.guild || message.author.bot) return
  const gid = message.guild.id
  if (!isEnabled(gid)) return

  const now = Date.now()
  const uid = message.author.id
  const member = message.member
  const s = spam[uid] || { times: [], msgs: [], last: 0 }
  s.times = s.times.filter((t) => now - t < WINDOW)
  s.msgs = s.msgs.filter((m) => now - m.createdTimestamp < WINDOW)
  s.times.push(now)
  s.msgs.push(message)
  s.last = now
  spam[uid] = s

  const hasMentionPerm = member ? member.permissions.has(PermissionFlagsBits.MentionEveryone) : false
  const mentions = (message.content.match(/<@&?\d+>/g) || []).length
  const everyoneHere = !hasMentionPerm && /@(everyone|here)/.test(message.content)
  const ageDays = (now - message.author.createdTimestamp) / 86400000
  const hasLink = /(https?:\/\/|discord\.gg\/)/i.test(message.content)

  if (everyoneHere) {
    try { if (message.deletable) await message.delete() } catch {}
    try { await member.timeout(60 * 60 * 1000, '@everyone/@here koruması') } catch {}
    await logTo(message.guild, `🚫 \`${message.author.tag}\` izinsiz **@everyone/@here** pingi attı → **1 saat** susturuldu.`)
    return
  }

  const rapid = s.times.length >= MAX_MSGS
  const mentionSpam = s.times.length >= 2 && mentions >= MAX_MENTIONS
  const linkSpam = hasLink && ageDays < LINK_AGE_DAYS && s.times.length >= 2
  if (!rapid && !mentionSpam && !linkSpam) return

  const caught = s.msgs.length
  await deleteAll(message.guild, s.msgs)
  delete spam[uid]

  let st = strikes[uid]
  if (!st || now - st.ts > STRIKE_RESET_MS) st = { count: 0, ts: now }
  st.count++
  st.ts = now
  strikes[uid] = st
  const c = st.count
  const tag = message.author.tag

  if (c >= 2) {
    try {
      await freezeMember(message.guild, message.member, `Spam koruması (${c}. kez, ${caught} mesaj silindi)`, 'Sistem')
      await logTo(message.guild, `🧊 \`${tag}\` spam koruması nedeniyle **freeze kanalına yönlendirildi** (${c}. kez). ${caught} mesaj silindi.`)
      return
    } catch {}
  }
  try {
    await member.timeout(10 * 60 * 1000, 'Spam koruması')
  } catch {}
  await logTo(message.guild, `⚠️ \`${tag}\` spam yaptı → **10 dk susturuldu** (uyarı #${c}). **${caught} mesaj silindi.**`)
}

async function onMemberJoin (member) {
  const guild = member.guild
  const gid = guild.id
  if (!isEnabled(gid)) return

  const now = Date.now()
  const ageDays = (now - member.user.createdTimestamp) / 86400000

  const cfg = (loadStore().security[gid]) || {}
  const kickDays = typeof cfg.newKickDays === 'number' ? cfg.newKickDays : NEW_ACCOUNT_KICK_DAYS
  if (kickDays > 0 && ageDays < kickDays) {
    try {
      await freezeMember(guild, member, `Yeni hesap koruması (hesap ${Math.max(ageDays, 0).toFixed(1)} günlük)`, 'Sistem')
      await logTo(guild, `🆕 Yeni hesap koruması: \`${member.user.tag}\` (${Math.max(ageDays, 0).toFixed(1)} gün) **freeze kanalına yönlendirildi**.`)
      return
    } catch {}
  }

  joins[gid] = (joins[gid] || []).filter((t) => now - t < RAID_WINDOW)
  joins[gid].push(now)

  if (joins[gid].length >= RAID_JOINS && !raidUntil[gid]) {
    raidUntil[gid] = now + RAID_DURATION
    await logTo(guild, `🚨 **RAİD TESPİTİ!** Kısa sürede **${RAID_JOINS}+** kişi katıldı.\n**10 dakika raid modu** aktif — ${RAID_ACCOUNT_DAYS} günden genç hesaplar otomatik atılacak.`)
    const owner = await guild.fetchOwner().catch(() => null)
    if (owner) {
      owner.send(`🚨 **${guild.name}** sunucusunda RAID tespit edildi! Bot 10 dakika boyunca genç hesapları otomatik atıyor. \`/raid-modu\` ile elle kapatabilirsin.`).catch(() => null)
    }
  }

  if (!raidUntil[gid]) return
  if (now >= raidUntil[gid]) {
    delete raidUntil[gid]
    await logTo(guild, `✅ Raid modu sona erdi.`)
    return
  }

  if (ageDays >= RAID_ACCOUNT_DAYS) return
  try {
    await freezeMember(guild, member, `Raid koruması (hesap ${Math.max(ageDays, 0).toFixed(1)} günlük)`, 'Sistem')
    await logTo(guild, `🚨 Raid koruması: \`${member.user.tag}\` (**${Math.max(ageDays, 0).toFixed(1)} gün**) **freeze kanalına yönlendirildi**.`)
  } catch {}
}

async function toggleSecurity (interaction, enabled) {
  const store = loadStore()
  store.security[interaction.guild.id] = { ...(store.security[interaction.guild.id] || {}), enabled }
  saveStore(store)
  await interaction.reply({ content: enabled ? '🛡️ **Sunucu güvenliği AÇIK.** Spam, link ve raid koruması aktif.' : '🛡️ Sunucu güvenliği kapalı.', ephemeral: true })
  await logTo(interaction.guild, `${interaction.user.tag} sunucu güvenliğini ${enabled ? 'açtı' : 'kapattı'}.`)
}

async function setNewAccountKick (interaction) {
  const days = interaction.options.getInteger('gun')
  const store = loadStore()
  store.security[interaction.guild.id] = { ...(store.security[interaction.guild.id] || {}), newKickDays: days }
  saveStore(store)
  await interaction.reply({
    content: days <= 0
      ? '✅ Yeni hesap koruması kapatıldı (hiç kimse yaş yüzünden kısıtlanmayacak).'
      : `✅ **${days} günden genç** hesaplar güvenlik açıkken sunucuya girince Freeze işlemine alınacak.`,
    ephemeral: true
  })
  await logTo(interaction.guild, `${interaction.user.tag} yeni hesap atma sınırını ${days} güne ayarladı.`)
}

async function toggleRaid (interaction) {
  const gid = interaction.guild.id
  if (raidUntil[gid] && Date.now() < raidUntil[gid]) {
    delete raidUntil[gid]
    await interaction.reply({ content: '✅ Raid modu elle **kapatıldı**.', ephemeral: true })
    await logTo(interaction.guild, `${interaction.user.tag} raid modunu elle kapattı.`)
  } else {
    raidUntil[gid] = Date.now() + RAID_DURATION
    await interaction.reply({ content: `🚨 Raid modu elle **açıldı** (${RAID_DURATION / 60000} dakika). ${RAID_ACCOUNT_DAYS} günden genç hesaplar Freeze işlemine alınır.`, ephemeral: true })
    await logTo(interaction.guild, `${interaction.user.tag} raid modunu elle açtı.`)
  }
}

module.exports = { handleMessage, onMemberJoin, toggleSecurity, setNewAccountKick, toggleRaid }

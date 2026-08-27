const { ChannelType, EmbedBuilder } = require('discord.js')
const { loadStore, saveStore, logTo } = require('./util')

const ALLOWED = { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true, AttachFiles: true, EmbedLinks: true }

function getFreezeRole (guild) {
  const configuredRoleId = loadStore().freezeRole?.[guild.id]
  return configuredRoleId ? guild.roles.cache.get(configuredRoleId) || null : null
}

async function ensureFreezeOverwrites (guild, role) {
  const store = loadStore()
  const freezeChId = store.freezeChannel[guild.id]
  const freezeCh = freezeChId ? guild.channels.cache.get(freezeChId) : null
  for (const ch of guild.channels.cache.values()) {
    if (ch.type === ChannelType.GuildCategory) continue
    if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice && ch.type !== ChannelType.GuildAnnouncement) continue
    if (ch.permissionOverwrites.cache.has(role.id)) continue
    try {
      if (freezeCh && ch.id === freezeCh.id) await ch.permissionOverwrites.create(role, ALLOWED)
      else await ch.permissionOverwrites.create(role, { ViewChannel: false })
    } catch {}
  }
}

async function freezeMember (guild, member, reason, actor) {
  if (!member || !guild) return
  const store = loadStore()
  const gid = guild.id
  const role = getFreezeRole(guild)
  if (!role) throw new Error('Freeze rolü seçilmemiş veya artık sunucuda bulunmuyor. Önce `/freeze-rolu` ile mevcut bir rol seç.')

  store.frozen[gid] = store.frozen[gid] || {}
  const roleIds = member.roles.cache.map((r) => r.id).filter((id) => id !== gid)
  store.frozen[gid][member.id] = { roles: roleIds, reason, ts: Date.now() }
  saveStore(store)

  await ensureFreezeOverwrites(guild, role)
  try { await member.roles.add(role) } catch {}
  const toRemove = member.roles.cache.map((r) => r.id).filter((id) => id !== gid && id !== role.id)
  for (const id of toRemove) {
    try { await member.roles.remove(id) } catch {}
  }
  try { await member.timeout(null) } catch {}

  const freezeChId = store.freezeChannel[gid]
  const ch = freezeChId ? guild.channels.cache.get(freezeChId) : null
  if (ch && ch.type === ChannelType.GuildVoice) {
    try { await member.voice.setChannel(ch) } catch {}
  }
  if (ch && ch.isTextBased()) {
    await ch.send(`${member} 🧊 **FREEZE** — ${reason}\nBuradan **yalnızca bu kanala** yazabilirsin. Erişimini geri almak için yetkililere başvur.`).catch(() => null)
  }

  const embed = new EmbedBuilder()
    .setColor(0x2c3e50)
    .setTitle('🧊 Freeze (Donduruldu)')
    .addFields(
      { name: '👤 Üye', value: `${member} (\`${member.id}\`)`, inline: true },
      { name: '🛠️ İşlemi Yapan', value: actor || 'Sistem', inline: true },
      { name: '📝 Sebep', value: reason, inline: false },
      { name: '⏰ Zaman', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
    )
    .setFooter({ text: 'Freeze-Log • MonarchBot' })

  const logChId = store.freezeLogChannel[gid]
  const logCh = logChId ? guild.channels.cache.get(logChId) : null
  if (logCh && logCh.isTextBased()) await logCh.send({ embeds: [embed] }).catch(() => null)
  else await logTo(guild, `🧊 **FREEZE** — ${member}\n**Sebep:** ${reason}\n**Yapan:** ${actor || 'Sistem'}`)
}

async function unfreezeMember (guild, member, actor) {
  const store = loadStore()
  const gid = guild.id
  const rec = store.frozen[gid] && store.frozen[gid][member.id]
  const role = getFreezeRole(guild)

  let roleRemoved = false
  if (role) {
    try { await member.roles.remove(role); roleRemoved = true } catch {}
  }

  let restored = 0
  if (rec) {
    const existing = new Set(guild.roles.cache.map((r) => r.id))
    const roles = (rec.roles || []).filter((id) => id !== gid && existing.has(id))
    for (const id of roles) {
      try { await member.roles.add(id); restored++ } catch {}
    }
  }
  if (rec && roleRemoved) {
    delete store.frozen[gid][member.id]
    saveStore(store)
  }

  try { await member.timeout(null) } catch {}
  const stillFrozen = !!(role && member.roles.cache.has(role.id))
  const missing = rec ? (rec.roles || []).length - restored : 0
  await logTo(guild, `🧊 **UNFREEZE** — ${member} çözüldü${restored > 0 ? ` (${restored} rol geri verildi${missing > 0 ? `, ${missing} rol bulunamadı` : ''})` : ''}.`)
  return { roleRemoved, restored, stillFrozen }
}

async function setFreezeRole (interaction) {
  const role = interaction.options.getRole('rol')
  if (!role || role.managed) throw new Error('Yönetilen olmayan, mevcut bir Freeze rolü seçmelisin.')
  const store = loadStore()
  store.freezeRole = store.freezeRole || {}
  store.freezeRole[interaction.guild.id] = role.id
  saveStore(store)
  await interaction.reply({ content: `✅ Freeze rolü ${role} olarak kaydedildi. Bot yeni rol oluşturmaz.`, ephemeral: true })
}

async function setFreezeChannel (interaction) {
  const channel = interaction.options.getChannel('kanal')
  const role = getFreezeRole(interaction.guild)
  if (!role) throw new Error('Önce `/freeze-rolu` ile sunucuda zaten bulunan Freeze rolünü seç.')
  const store = loadStore()
  store.freezeChannel[interaction.guild.id] = channel.id
  saveStore(store)
  await ensureFreezeOverwrites(interaction.guild, role)
  await interaction.reply({ content: `✅ Freeze kanalı ${channel} olarak ayarlandı. Dondurulan üyeler **yalnızca burada** yazabilir.`, ephemeral: true })
}

async function setFreezeLogChannel (interaction) {
  const channel = interaction.options.getChannel('kanal')
  const store = loadStore()
  store.freezeLogChannel[interaction.guild.id] = channel.id
  saveStore(store)
  await interaction.reply({ content: `✅ Freeze-Log kanalı ${channel} olarak ayarlandı.`, ephemeral: true })
}

async function cmdFreeze (interaction) {
  const target = interaction.options.getUser('kullanici')
  const reason = interaction.options.getString('sebep') || 'Belirtilmedi'
  const member = interaction.guild.members.cache.get(target.id)
  if (!member) return interaction.reply({ content: 'Üye bulunamadı.', ephemeral: true })
  if (member.id === interaction.guild.ownerId) return interaction.reply({ content: 'Sunucu sahibini dondüremezsin.', ephemeral: true })
  if (member.id === interaction.user.id) return interaction.reply({ content: 'Kendini dondüremezsin.', ephemeral: true })
  await freezeMember(interaction.guild, member, reason, interaction.user.tag)
  await interaction.reply({ content: `🧊 ${member} donduruldu.\n**Sebep:** ${reason}\nRolleri alındı, freeze kanalına yönlendirildi.`, ephemeral: true })
  await logTo(interaction.guild, `🧊 \`${interaction.user.tag}\` → ${member} donduruldu (${reason}).`)
}

async function cmdUnfreeze (interaction) {
  const target = interaction.options.getUser('kullanici')
  const member = interaction.guild.members.cache.get(target.id)
  if (!member) return interaction.reply({ content: 'Üye bulunamadı.', ephemeral: true })
  const result = await unfreezeMember(interaction.guild, member, interaction.user.tag)
  let msg = `✅ ${member} çözüldü, erişimleri geri verildi.`
  if (result.stillFrozen) msg = `⚠️ ${member} hâlâ Freeze rolünde. Freeze rolü botun rolünden yüksek veya botun **Manage Roles** izni yok.`
  else if (!result.roleRemoved) msg = `⚠️ ${member} Freeze rolü bulunamadı (zaten çözülmüş olabilir).`
  if (result.restored > 0) msg += `\n${result.restored} rol geri verildi.`
  await interaction.reply({ content: msg, ephemeral: true })
  await logTo(interaction.guild, `✅ \`${interaction.user.tag}\` → ${member} unfreeze yaptı.`)
}

module.exports = { freezeMember, unfreezeMember, setFreezeChannel, setFreezeRole, setFreezeLogChannel, cmdFreeze, cmdUnfreeze, getFreezeRole }

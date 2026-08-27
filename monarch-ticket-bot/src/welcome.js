const { EmbedBuilder } = require('discord.js')
const { loadStore, saveStore, logTo } = require('./util')

const invites = {}

function setup (client) {
  client.on('guildCreate', (g) => { refresh(g).catch(() => null) })
  client.on('inviteCreate', (inv) => {
    if (!inv.guild) return
    refresh(inv.guild).catch(() => null)
  })
  client.on('inviteDelete', (inv) => {
    if (!inv.guild) return
    refresh(inv.guild).catch(() => null)
  })
}

async function refresh (guild) {
  try {
    const list = await guild.invites.fetch()
    invites[guild.id] = new Map(list.map((i) => [i.code, { uses: i.uses, inviterId: i.inviter ? i.inviter.id : null }]))
  } catch {}
}

async function onMemberJoin (member) {
  const guild = member.guild
  const store = loadStore()
  const chId = store.welcomeChannel[guild.id]
  const channel = chId ? guild.channels.cache.get(chId) : null

  let inviter = null
  let code = null
  try {
    const current = await guild.invites.fetch()
    const prev = invites[guild.id]
    if (prev && current) {
      for (const [c, inv] of current) {
        const p = prev.get(c)
        if (inv.uses > (p ? p.uses : 0)) {
          inviter = inv.inviter
          code = c
          break
        }
      }
    }
    invites[guild.id] = new Map(current.map((i) => [i.code, { uses: i.uses, inviterId: i.inviter ? i.inviter.id : null }]))
  } catch {}

  const ageMs = Date.now() - member.user.createdTimestamp
  const ageDays = Math.floor(ageMs / 86400000)
  const isNew = ageDays < 7

  const embed = new EmbedBuilder()
    .setColor(isNew ? 0xe74c3c : 0x2ecc71)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setDescription(`${member} sunucuya katıldı!`)
    .addFields(
      { name: '👤 Kullanıcı', value: `<@${member.user.id}>`, inline: true },
      { name: '📅 Hesap Yaşı', value: `${member.user.createdAt.toLocaleDateString('tr-TR')} (${ageDays} gün)${isNew ? ' ⚠️ YENİ HESAP' : ''}`, inline: true },
      { name: '📊 Sıra', value: `Sunucudaki **${guild.memberCount}. üye**`, inline: true },
      { name: '🤝 Davet Eden', value: inviter ? `${inviter.tag} (\`${code}\`)` : 'Bilinmiyor', inline: true }
    )
    .setFooter({ text: `ID: ${member.user.id}` })

  if (channel && channel.isTextBased()) {
    await channel.send({ embeds: [embed] }).catch(() => null)
  }
  await logTo(guild, `📥 \`${member.user.tag}\` katıldı${inviter ? ` — davet: \`${code}\` → ${inviter.tag}` : ''}.`)
}

async function onMemberBoost (member) {
  const guild = member.guild
  const store = loadStore()
  const chId = store.boostChannel[guild.id] || store.welcomeChannel[guild.id]
  const channel = chId ? guild.channels.cache.get(chId) : null

  const embed = new EmbedBuilder()
    .setColor(0xf47fff)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setDescription(`${member} sunucuyu **takviye etti! 🚀**`)
    .addFields(
      { name: '👤 Kullanıcı', value: `<@${member.user.id}>`, inline: true },
      { name: '💎 Toplam Takviye', value: `${guild.premiumSubscriptionCount}`, inline: true },
      { name: '🚀 Takviye Seviyesi', value: `Seviye ${guild.premiumTier}`, inline: true }
    )
    .setFooter({ text: `ID: ${member.user.id}` })

  if (channel && channel.isTextBased()) {
    await channel.send({ content: `🚀 <@${member.user.id}>`, embeds: [embed] }).catch(() => null)
  }
  await logTo(guild, `🚀 \`${member.user.tag}\` sunucuyu takviye etti.`)
}

async function setBoostChannel (interaction) {
  const channel = interaction.options.getChannel('kanal')
  const store = loadStore()
  store.boostChannel[interaction.guild.id] = channel.id
  saveStore(store)
  await interaction.reply({ content: `✅ Takviye bildirimleri ${channel} kanalına ayarlandı.`, ephemeral: true })
}

async function setWelcomeChannel (interaction) {
  const channel = interaction.options.getChannel('kanal')
  const store = loadStore()
  store.welcomeChannel[interaction.guild.id] = channel.id
  saveStore(store)
  refresh(interaction.guild).catch(() => null)
  await interaction.reply({ content: `✅ Karşılama bildirimleri ${channel} kanalına ayarlandı.`, ephemeral: true })
}

module.exports = { setup, refresh, onMemberJoin, onMemberBoost, setWelcomeChannel, setBoostChannel }

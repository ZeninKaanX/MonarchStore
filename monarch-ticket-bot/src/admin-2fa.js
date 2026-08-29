const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js')
const { createClient } = require('@supabase/supabase-js')
const { loadStore, saveStore, logTo } = require('./util')

const TWO_FACTOR_POLL_INTERVAL_MS = 2500

function get2FASettings (guildId) {
  const store = loadStore()
  return store.admin2FASettings?.[guildId] || null
}

function save2FASettings (guildId, settings) {
  const store = loadStore()
  store.admin2FASettings = store.admin2FASettings || {}
  store.admin2FASettings[guildId] = settings
  saveStore(store)
}

function findRoleByName (guild, name) {
  const normalized = name.toLowerCase().trim()
  return guild.roles.cache.find((role) => role.name.toLowerCase().trim() === normalized && role.id !== guild.id) || null
}

async function resolve2FAChannel (guild) {
  const settings = get2FASettings(guild.id)
  if (settings?.channelId) {
    const customChannel = await guild.channels.fetch(settings.channelId).catch(() => null)
    if (customChannel?.isTextBased()) return customChannel
  }

  // Otomatik #admin-2fa veya #yetkili-2fa kanalını ara
  let channel = guild.channels.cache.find((c) => c.isTextBased() && (c.name === 'admin-2fa' || c.name === 'yetkili-2fa'))
  if (channel) return channel

  // Roller: Founder ve Destek
  const founderRole = findRoleByName(guild, 'Founder') || findRoleByName(guild, 'Kurucu')
  const destekRole = findRoleByName(guild, 'Destek') || findRoleByName(guild, 'Yetkili')

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }
  ]

  if (founderRole) {
    permissionOverwrites.push({
      id: founderRole.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages]
    })
  }

  if (destekRole) {
    permissionOverwrites.push({
      id: destekRole.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages]
    })
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null)
  if (botMember) {
    permissionOverwrites.push({
      id: botMember.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory]
    })
  }

  // Yeni güvenli kanal oluştur
  channel = await guild.channels.create({
    name: 'admin-2fa',
    type: ChannelType.GuildText,
    topic: 'Monarch Store web paneli 2FA yetkili giriş kodları kanalı. Yalnızca Founder ve Destek rollerine açıktır.',
    permissionOverwrites
  }).catch((err) => {
    console.error('[2FA] Güvenli #admin-2fa kanalı oluşturulamadı:', err.message)
    return null
  })

  return channel
}

function create2FASync ({ supabaseUrl, serviceRoleKey, logger = console }) {
  if (!supabaseUrl || !serviceRoleKey) return { start: () => {}, tick: () => {} }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  let isPolling = false

  async function pollPending2FA (client, guildId) {
    if (isPolling) return
    isPolling = true
    try {
      const guild = client.guilds.cache.get(guildId)
      if (!guild) return

      // Bildirimi gitmemiş, süresi geçmemiş ve kullanılmamış 2FA kodlarını çek
      const { data: pendingRequests, error } = await supabase
        .from('monarch_admin_2fa')
        .select('*')
        .eq('discord_notified', false)
        .eq('consumed', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(5)

      if (error || !pendingRequests?.length) return

      const channel = await resolve2FAChannel(guild)
      if (!channel) {
        logger.error('[2FA] Bildirim gönderilecek 2FA kanalı bulunamadı.')
        return
      }

      for (const req of pendingRequests) {
        try {
          const expireUnix = Math.floor(new Date(req.expires_at).getTime() / 1000)
          const embed = new EmbedBuilder()
            .setColor(0x3e83b8)
            .setTitle('🔐 Monarch Store — Admin Giriş Doğrulama Kodu')
            .setDescription('Web yönetim paneline giriş talebinde bulunuldu. Girişi onaylamak için aşağıdaki 6 haneli 2FA kodunu tarayıcıya girin.')
            .addFields(
              { name: '🔑 Güvenlik Kodu', value: `\`\`\`${req.code}\`\`\``, inline: false },
              { name: '👤 Kullanıcı', value: `\`${req.admin_username}\``, inline: true },
              { name: '⏱️ Kalan Süre', value: `<t:${expireUnix}:R>`, inline: true },
              { name: '🛡️ Güvenlik Kapsamı', value: 'Bu kod yalnızca **Founder** ve **Destek** rolleri tarafından görüntülenebilir.', inline: false }
            )
            .setFooter({ text: 'Monarch Store Güvenlik Sistemi' })
            .setTimestamp()

          await channel.send({ embeds: [embed] })

          // Bildirildi olarak işaretle
          await supabase
            .from('monarch_admin_2fa')
            .update({ discord_notified: true })
            .eq('id', req.id)

          logger.log(`[2FA] Doğrulama kodu #${channel.name} kanalına gönderildi (${req.admin_username})`)
        } catch (itemErr) {
          logger.error('[2FA] Mesaj gönderilemedi:', itemErr.message)
        }
      }
    } catch (err) {
      // sessizce geç
    } finally {
      isPolling = false
    }
  }

  function start (client, guildId) {
    const timer = setInterval(() => pollPending2FA(client, guildId), TWO_FACTOR_POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }

  return { start, pollPending2FA }
}

async function set2FAChannel (interaction) {
  const channel = interaction.options.getChannel('kanal')
  if (!channel?.isTextBased()) throw new Error('2FA bildirimleri için geçerli bir metin kanalı seçmelisin.')
  save2FASettings(interaction.guild.id, { channelId: channel.id })
  return interaction.reply({
    content: `✅ Admin 2FA güvenlik kodları artık ${channel} kanalına gönderilecek.`,
    ephemeral: true
  })
}

module.exports = {
  create2FASync,
  set2FAChannel,
  get2FASettings,
  save2FASettings,
  resolve2FAChannel
}

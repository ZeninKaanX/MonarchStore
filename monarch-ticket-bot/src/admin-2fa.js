/**
 * Monarch Store - Admin Paneli 2FA Doğrulama & Bildirim Modülü
 * Supabase'deki `monarch_admin_2fa` tablosunu dinler ve yeni giriş taleplerinde
 * Discord sunucusundaki gizli `#admin-2fa` kanalına güvenlik kodunu iletir.
 */

const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js')
const { createClient } = require('@supabase/supabase-js')
const { loadStore, saveStore } = require('./util')

const POLL_INTERVAL = 3000

function get2FASettings (guildId) {
  const store = loadStore()
  store.admin2FASettings = store.admin2FASettings || {}
  return store.admin2FASettings[guildId] || null
}

function save2FASettings (guildId, channelId) {
  const store = loadStore()
  store.admin2FASettings = store.admin2FASettings || {}
  store.admin2FASettings[guildId] = { channelId }
  saveStore(store)
}

async function ensure2FAChannel (guild) {
  const settings = get2FASettings(guild.id)
  let channel = settings?.channelId ? guild.channels.cache.get(settings.channelId) : null

  if (!channel) {
    channel = guild.channels.cache.find(c => c.name === 'admin-2fa' && c.type === ChannelType.GuildText)
  }

  if (!channel) {
    // Sadece Yöneticilere açık özel kanal oluştur
    channel = await guild.channels.create({
      name: 'admin-2fa',
      type: ChannelType.GuildText,
      topic: 'Monarch Store Admin Paneli 2FA Güvenlik Kodları',
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ]
    }).catch(err => {
      console.error('[2FA KANAL HATA]', err.message)
      return null
    })
  }

  if (channel) {
    save2FASettings(guild.id, channel.id)
  }
  return channel
}

function create2FASync (supabaseUrl, serviceRoleKey) {
  if (!supabaseUrl || !serviceRoleKey) return null
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  let timer = null
  let running = false

  async function checkPendingChallenges (client, guildId) {
    if (running) return
    running = true

    try {
      const guild = client.guilds.cache.get(guildId)
      if (!guild) return

      const { data: challenges, error } = await supabase
        .from('monarch_admin_2fa')
        .select('*')
        .eq('discord_notified', false)
        .eq('consumed', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })

      if (error || !challenges || !challenges.length) return

      const channel = await ensure2FAChannel(guild)
      if (!channel) return

      for (const req of challenges) {
        const expiresDate = new Date(req.expires_at)
        const expUnix = Math.floor(expiresDate.getTime() / 1000)

        const embed = new EmbedBuilder()
          .setColor('#6366f1')
          .setTitle('🛡️ Admin Paneli 2FA Güvenlik Giriş Kodu')
          .setDescription(`Yönetim paneline (**admin.html**) bir giriş talebi yapıldı.\n\n### 🔑 Güvenlik Kodu: \`${req.code}\`\n\nBu kod **5 dakika** boyunca geçerlidir. Süre sonu: <t:${expUnix}:R>`)
          .addFields(
            { name: '👤 Yönetici Hesabı', value: `\`${req.admin_username}\``, inline: true },
            { name: '💬 Talep Eden Discord', value: req.discord_username ? `@${req.discord_username}` : 'Belirtilmedi', inline: true },
            { name: '🌐 Cihaz / IP', value: `\`${(req.ip_info || 'Bilinmiyor').substring(0, 40)}\``, inline: false }
          )
          .setFooter({ text: 'Monarch Store · Güvenlik Doğrulama Sistemi' })
          .setTimestamp()

        await channel.send({ embeds: [embed] })

        // Bildirildi olarak işaretle
        await supabase
          .from('monarch_admin_2fa')
          .update({ discord_notified: true })
          .eq('id', req.id)
      }
    } catch (err) {
      console.error('[2FA SENKRONİZASYON HATA]', err.message)
    } finally {
      running = false
    }
  }

  return {
    start (client, guildId) {
      if (timer) clearInterval(timer)
      checkPendingChallenges(client, guildId)
      timer = setInterval(() => checkPendingChallenges(client, guildId), POLL_INTERVAL)
      console.log('[2FA] Admin 2FA güvenlik senkronizasyonu başlatıldı.')
    },
    stop () {
      if (timer) clearInterval(timer)
      timer = null
    }
  }
}

module.exports = {
  create2FASync,
  ensure2FAChannel
}

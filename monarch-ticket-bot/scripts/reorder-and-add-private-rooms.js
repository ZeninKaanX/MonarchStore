require('dotenv').config()
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js')
const { loadStore, saveStore } = require('../src/util')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
})

async function setupOrderedServer (guild) {
  console.log(`[BAŞLADI] ${guild.name} için yönetim bölümleri aşağıya alınıyor ve özel odalar ekleniyor...`)

  const founderRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'founder')
  const adminRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('admin'))
  const staffRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('satış ekibi'))
  const everyone = guild.roles.everyone
  const botMember = guild.members.me

  const privateStaffOverwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
  ]

  if (botMember) {
    privateStaffOverwrites.push({
      id: botMember.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels]
    })
  }

  // 1. Kategorileri Getir veya Oluştur
  async function getOrCreateCategory (name, pos, overwrites = []) {
    let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase())
    if (!cat) {
      cat = await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        position: pos,
        permissionOverwrites: overwrites
      })
      console.log(`[KATEGORİ OLUŞTURULDU] ${name}`)
    } else {
      await cat.setPosition(pos).catch(() => {})
      if (overwrites.length > 0) {
        await cat.permissionOverwrites.set(overwrites).catch(() => {})
      }
    }
    return cat
  }

  const catInfo = await getOrCreateCategory('👑 │ BİLGİLENDİRME & REHBER', 0)
  const catStore = await getOrCreateCategory('📦 │ MONARCH SİPARİŞ', 1)
  const catTickets = await getOrCreateCategory('🎫 │ SİPARİŞ TİCKETLARI', 2)
  const catCommunity = await getOrCreateCategory('💬 │ TOPLULUK & SOHBET', 3)
  const catAdmin = await getOrCreateCategory('🛡️ │ YÖNETİM & GÜVENLİK', 4, privateStaffOverwrites)
  const catPrivateRooms = await getOrCreateCategory('👑 │ YÖNETİCİ ÖZEL ODALARI', 5, privateStaffOverwrites)

  // 2. Özel Odaları Oluştur (Kaan Özel, Emre Özel, Ömer Özel)
  async function ensureVoiceInCat (name, category, userLimit = 0) {
    let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === name.toLowerCase())
    if (!ch) {
      ch = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit
      })
      console.log(`[SES KANALI OLUŞTURULDU] ${name}`)
    } else {
      if (ch.parentId !== category.id) {
        await ch.setParent(category.id).catch(() => {})
      }
    }
    return ch
  }

  // Yönetici Özel Odaları (En Altta)
  await ensureVoiceInCat('👑 xKaan Özel', catPrivateRooms, 2)
  await ensureVoiceInCat('👑 xEmre Özel', catPrivateRooms, 2)
  await ensureVoiceInCat('👑 xÖmer Özel', catPrivateRooms, 2)

  // Topluluk Kategorisinde "Özel Oda Oluştur"
  await ensureVoiceInCat('➕︲Özel Oda Oluştur', catCommunity, 0)

  // 3. Pozisyonları Kesinleştir
  await catInfo.setPosition(0).catch(() => {})
  await catStore.setPosition(1).catch(() => {})
  await catTickets.setPosition(2).catch(() => {})
  await catCommunity.setPosition(3).catch(() => {})
  await catAdmin.setPosition(4).catch(() => {})
  await catPrivateRooms.setPosition(5).catch(() => {})

  console.log('[BAŞARILI] Yönetim ve özel odalar en alta alındı, topluluk ve sipariş bölümleri yukarıda yerleştirildi!')
}

client.once('ready', async () => {
  const guild = client.guilds.cache.get(process.env.GUILD_ID)
  if (guild) {
    try {
      await setupOrderedServer(guild)
    } catch (err) {
      console.error('Hata:', err)
    }
  }
  setTimeout(() => {
    client.destroy()
    process.exit(0)
  }, 2500)
})

client.login(process.env.DISCORD_TOKEN)

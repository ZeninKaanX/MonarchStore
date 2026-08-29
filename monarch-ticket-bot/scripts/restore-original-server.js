require('dotenv').config()
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js')
const { loadStore, saveStore } = require('../src/util')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
})

async function restoreOriginalLayout (guild) {
  console.log(`[ORİJİNAL DÜZEN GERİ YÜKLENİYOR] ${guild.name}...`)

  const founderRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'founder')
  const adminRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('admin'))
  const staffRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('satış ekibi'))
  const creatorRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('içerik üreticisi'))
  const everyone = guild.roles.everyone

  const privateStaffOverwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
  ]

  // Helper Kategori
  async function ensureCat (name, pos, overwrites = []) {
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
      await cat.setName(name).catch(() => {})
      await cat.setPosition(pos).catch(() => {})
      if (overwrites.length > 0) await cat.permissionOverwrites.set(overwrites).catch(() => {})
    }
    return cat
  }

  // Helper Metin Kanalı
  async function ensureText (name, category, topic = '') {
    let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === name.toLowerCase())
    if (!ch) {
      ch = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic
      })
      console.log(`[METİN KANALI] #${name}`)
    } else {
      if (ch.parentId !== category.id) await ch.setParent(category.id, { lockPermissions: false }).catch(() => {})
      if (ch.name !== name) await ch.setName(name).catch(() => {})
    }
    return ch
  }

  // Helper Ses Kanalı
  async function ensureVoice (name, category, userLimit = 0) {
    let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === name.toLowerCase())
    if (!ch) {
      ch = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit
      })
      console.log(`[SES KANALI] 🔊 ${name}`)
    } else {
      if (ch.parentId !== category.id) await ch.setParent(category.id).catch(() => {})
      if (ch.name !== name) await ch.setName(name).catch(() => {})
    }
    return ch
  }

  // 1. Orijinal Kategoriler (Yukarıdan Aşağıya)
  const catGiris = await ensureCat('Giriş-Çıkış', 0)
  const catMonarchStore = await ensureCat('𝙼𝚘𝚗𝚊𝚛𝚌𝚑 𝚂𝚝𝚘𝚛𝚎', 1)
  const catMetin = await ensureCat('Metin Kanalları', 2)
  const catSes = await ensureCat('Ses Kanalları', 3)
  const catPartner = await ensureCat('Partnerlik', 4)
  const catDestek = await ensureCat('Destek', 5)
  const catStoreSiparis = await ensureCat('Monarch-Store', 6)

  // Yönetim Kategorileri (Aşağıda)
  const catYonetim = await ensureCat('👑︲Yönetim', 7, privateStaffOverwrites)
  const catYonetimBilgi = await ensureCat('👑︲Yönetim Bilgi', 8, privateStaffOverwrites)
  const catYonetimLog = await ensureCat('👑︲Yönetim Log', 9, privateStaffOverwrites)
  const catClientLog = await ensureCat('👑︲Client Log', 10, privateStaffOverwrites)
  const catClientInceleme = await ensureCat('👑︲Client İnceleme', 11, privateStaffOverwrites)

  const originalCatIds = new Set([
    catGiris.id, catMonarchStore.id, catMetin.id, catSes.id, catPartner.id, catDestek.id, catStoreSiparis.id,
    catYonetim.id, catYonetimBilgi.id, catYonetimLog.id, catClientLog.id, catClientInceleme.id
  ])

  // 2. Orijinal Kanallar
  // Giriş-Çıkış
  const chGelenGiden = await ensureText('🌌︲gelen-giden', catGiris)

  // 𝙼𝚘𝚗𝚊𝚛𝚌𝚑 𝚂𝚝𝚘𝚛𝚎
  await ensureText('︲duyuru', catMonarchStore)
  const chIcerik = await ensureText('📽️︲içerik-üreticisi', catMonarchStore)
  if (creatorRole) {
    await chIcerik.permissionOverwrites.set([
      { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      { id: creatorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
      { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }
    ]).catch(() => {})
  }

  // Metin Kanalları
  const chKurallar = await ensureText('︲kurallar', catMetin)
  await ensureText('🤖︲minecraft-bots', catMetin)
  await ensureText('📟-site', catMetin)
  await ensureText('🔧︲client-öneri', catMetin)
  await ensureText('📝︲github', catMetin)
  await ensureText('💬︲genel-sohbet', catMetin)
  await ensureText('📸︲görsel-sohbet', catMetin)

  // Ses Kanalları
  await ensureVoice('➕︲Özel Oda Oluştur', catSes)

  // Partnerlik
  await ensureText('📌︲partner-text', catPartner)
  await ensureText('🎗️︲partner', catPartner)

  // Destek
  await ensureText('🎟️︲destek-talebi', catDestek)
  await ensureText('🏆︲invite-ödülleri', catDestek)
  await ensureText('destek-log', catDestek)

  // Monarch-Store (Sipariş Akışı)
  const chSatinAlim = await ensureText('📊︲satın-alım', catStoreSiparis)
  const chGorusme = await ensureVoice('Satış Görüşmesi', catStoreSiparis, 5)

  // Açık Sipariş Ticketlarını Monarch-Store Kategorisine Taşı
  guild.channels.cache.forEach(async (ch) => {
    if (ch.name.startsWith('siparis-') && ch.type === ChannelType.GuildText) {
      if (ch.parentId !== catStoreSiparis.id) {
        await ch.setParent(catStoreSiparis.id).catch(() => {})
      }
    }
  })

  // 👑︲Yönetim
  const chAdmin2FA = await ensureText('admin-2fa', catYonetim)
  await ensureText('🔑︲yönetim-sohbet', catYonetim)
  await ensureVoice('xKaan Özel', catYonetim, 2)
  await ensureVoice('xEmre Özel', catYonetim, 2)
  await ensureVoice('xÖmer Özel', catYonetim, 2)

  // 👑︲Yönetim Bilgi
  await ensureText('🔒︲bi̇lgi', catYonetimBilgi)
  await ensureText('🔒︲bi̇lgi-2', catYonetimBilgi)
  await ensureText('🔒︲önemli', catYonetimBilgi)
  await ensureText('🔒︲eklenecekler', catYonetimBilgi)
  await ensureText('🔒︲eklenenler', catYonetimBilgi)
  await ensureText('🔒︲update', catYonetimBilgi)
  await ensureText('🔒︲güncelleme', catYonetimBilgi)

  // 👑︲Yönetim Log
  await ensureText('🛡️︲davet-log', catYonetimLog)
  await ensureText('🛡️︲chat-log', catYonetimLog)
  await ensureText('🛡️︲ses-log', catYonetimLog)
  await ensureText('🛡️︲ban-log', catYonetimLog)
  await ensureText('🛡️︲unban-log', catYonetimLog)
  await ensureText('🛡️︲store-log', catYonetimLog)

  // 👑︲Client Log
  await ensureText('📝︲satış-log', catClientLog)
  await ensureText('📝︲süre-log', catClientLog)

  // 👑︲Client İnceleme
  await ensureText('🔮︲sunucular', catClientInceleme)
  await ensureText('🔮︲hesaplar', catClientInceleme)
  await ensureText('🔮︲hesap-bilgiler', catClientInceleme)

  // 3. Ekstra Eklenmiş Kategorileri Temizle
  const extraCatNames = ['👑 │ BİLGİLENDİRME & REHBER', '👑 │ BİLGİLENDİRME', '📦 │ MONARCH SİPARİŞ', '🎫 │ SİPARİŞ TİCKETLARI', '💬 │ TOPLULUK & SOHBET', '🛡️ │ YÖNETİM & GÜVENLİK', '👑 │ YÖNETİCİ ÖZEL ODALARI']
  for (const [id, cat] of guild.channels.cache) {
    if (cat.type === ChannelType.GuildCategory && !originalCatIds.has(cat.id)) {
      const children = guild.channels.cache.filter(c => c.parentId === cat.id)
      for (const [cid, child] of children) {
        if (child.name.startsWith('siparis-')) {
          await child.setParent(catStoreSiparis.id).catch(() => {})
        } else {
          await child.delete('Orijinal düzen geri yükleme').catch(() => {})
        }
      }
      await cat.delete('Orijinal düzen geri yükleme').catch(() => {})
      console.log(`[ESKİ KATEGORİ SİLİNDİ] ${cat.name}`)
    }
  }

  // 4. store.json Orijinal Kanallarla Bağla
  const store = loadStore()
  const guildId = guild.id

  store.orderSettings = store.orderSettings || {}
  store.orderSettings[guildId] = {
    purchaseChannelId: chSatinAlim.id,
    ticketCategoryId: catStoreSiparis.id,
    staffRoleId: staffRole.id,
    voiceChannelId: chGorusme.id
  }

  store.welcomeChannel = store.welcomeChannel || {}
  store.welcomeChannel[guildId] = chGelenGiden.id

  store.admin2FASettings = store.admin2FASettings || {}
  store.admin2FASettings[guildId] = {
    channelId: chAdmin2FA.id
  }

  store.generalTicketSettings = store.generalTicketSettings || {}
  store.generalTicketSettings[guildId] = {
    categoryId: catDestek.id,
    staffRoleId: staffRole.id
  }

  saveStore(store)
  console.log('[SİSTEM] store.json orijinal kanal bağlarıyla güncellendi!')
}

client.once('ready', async () => {
  const guild = client.guilds.cache.get(process.env.GUILD_ID)
  if (guild) {
    try {
      await restoreOriginalLayout(guild)
      console.log('[TAMAMLANDI] Orijinal kanal ve kategori düzeni eksiksiz geri yüklendi!')
    } catch (e) {
      console.error('Hata:', e)
    }
  }
  setTimeout(() => {
    client.destroy()
    process.exit(0)
  }, 2500)
})

client.login(process.env.DISCORD_TOKEN)

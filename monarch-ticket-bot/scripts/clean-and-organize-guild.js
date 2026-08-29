require('dotenv').config()
const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')
const { loadStore, saveStore } = require('../src/util')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
})

async function cleanAndOrganize (guild) {
  console.log(`[TEMİZLİK BAŞLADI] ${guild.name} sunucusu sadeleştiriliyor ve düzenleniyor...`)

  // 1. ROLLERİ BUL VEYA DÜZENLE
  async function ensureRole (name, options = {}) {
    let role = guild.roles.cache.find(r => r.name.toLowerCase().trim() === name.toLowerCase().trim())
    if (!role) {
      role = await guild.roles.create({
        name,
        color: options.color || '#94a3b8',
        hoist: options.hoist !== undefined ? options.hoist : true,
        mentionable: options.mentionable !== undefined ? options.mentionable : true,
        reason: 'Monarch Store rol düzeni'
      })
    } else {
      if (options.color && role.hexColor.toLowerCase() !== options.color.toLowerCase()) {
        await role.setColor(options.color).catch(() => {})
      }
      if (options.hoist !== undefined && role.hoist !== options.hoist) {
        await role.setHoist(options.hoist).catch(() => {})
      }
    }
    return role
  }

  const founderRole = await ensureRole('Founder', { color: '#7c3aed', hoist: true })
  const adminRole = await ensureRole('︲Admin', { color: '#e11d48', hoist: true })
  const staffRole = await ensureRole('Satış Ekibi', { color: '#3b82f6', hoist: true })
  const creatorRole = await ensureRole('📽️︲İçerik Üreticisi', { color: '#ff2a5f', hoist: true })
  const customerRole = await ensureRole('💎︲Müşteri', { color: '#10b981', hoist: true })
  const boosterRole = await ensureRole('︲Monarch Booster', { color: '#f47fff', hoist: true })
  const memberRole = await ensureRole('︲Üye', { color: '#94a3b8', hoist: false })
  const freezeRole = await ensureRole('❄️︲Freeze', { color: '#ef4444', hoist: true })

  const everyone = guild.roles.everyone
  const botMember = guild.members.me

  // İzin Şablonları
  const publicReadOverwrites = [
    { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
    { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }
  ]

  const privateStaffOverwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
  ]

  // 2. KATEGORİLERİ OLUŞTUR / DÜZENLE
  async function ensureCleanCategory (name, position, overwrites = []) {
    let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase())
    if (!cat) {
      cat = await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        position,
        permissionOverwrites: overwrites
      })
      console.log(`[KATEGORİ OLUŞTURULDU] ${name}`)
    } else {
      await cat.setPosition(position).catch(() => {})
      if (overwrites.length > 0) await cat.permissionOverwrites.set(overwrites).catch(() => {})
    }
    return cat
  }

  const catInfo = await ensureCleanCategory('👑 │ BİLGİLENDİRME & REHBER', 0, publicReadOverwrites)
  const catStore = await ensureCleanCategory('📦 │ MONARCH SİPARİŞ', 1)
  const catTickets = await ensureCleanCategory('🎫 │ SİPARİŞ TİCKETLARI', 2, privateStaffOverwrites)
  const catCommunity = await ensureCleanCategory('💬 │ TOPLULUK & SOHBET', 3, [
    { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: freezeRole.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] }
  ])
  const catAdmin = await ensureCleanCategory('🛡️ │ YÖNETİM & GÜVENLİK', 4, privateStaffOverwrites)

  const protectedCategoryIds = new Set([catInfo.id, catStore.id, catTickets.id, catCommunity.id, catAdmin.id])

  // 3. GEREKLİ ANA KANALLARI SAĞLAMLAŞTIR
  async function placeTextChannel (name, category, options = {}) {
    let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === name.toLowerCase())
    if (!ch) {
      ch = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: options.topic || 'Monarch Store resmi kanalı.',
        permissionOverwrites: options.overwrites || []
      })
      console.log(`[KANAL OLUŞTURULDU] #${name}`)
    } else {
      if (ch.parentId !== category.id) await ch.setParent(category.id, { lockPermissions: false }).catch(() => {})
      if (options.overwrites && options.overwrites.length > 0) {
        await ch.permissionOverwrites.set(options.overwrites).catch(() => {})
      }
    }
    return ch
  }

  async function placeVoiceChannel (name, category, options = {}) {
    let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === name.toLowerCase())
    if (!ch) {
      ch = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit: options.userLimit || 0
      })
      console.log(`[SES OLUŞTURULDU] 🔊 ${name}`)
    } else {
      if (ch.parentId !== category.id) await ch.setParent(category.id).catch(() => {})
    }
    return ch
  }

  // --- Kategori 1: Bilgilendirme ---
  const chKurallar = await placeTextChannel('📜︲kurallar', catInfo, { overwrites: publicReadOverwrites })
  const chDuyurular = await placeTextChannel('📢︲duyurular', catInfo, { overwrites: publicReadOverwrites })
  const chWebsite = await placeTextChannel('🌐︲web-sitesi', catInfo, { overwrites: publicReadOverwrites })
  const chSiparisRehber = await placeTextChannel('🛒︲siparis-rehberi', catInfo, { overwrites: publicReadOverwrites })
  const chIcerik = await placeTextChannel('📽️︲içerik-üreticisi', catInfo, {
    overwrites: [
      { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      { id: creatorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
      { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }
    ]
  })
  const chGelenGiden = await placeTextChannel('👋︲gelen-giden', catInfo)
  const chBoostLog = await placeTextChannel('🚀︲boost-log', catInfo, { overwrites: publicReadOverwrites })

  // --- Kategori 2: Monarch Sipariş ---
  const chSatinAlimlar = await placeTextChannel('📥︲satin-alimlar', catStore, { overwrites: privateStaffOverwrites })
  const chGorusme = await placeVoiceChannel('🔊 Sipariş Görüşme Odası', catStore, { userLimit: 5 })

  // --- Kategori 3: Topluluk & Sohbet ---
  const chSohbet = await placeTextChannel('💬︲genel-sohbet', catCommunity)
  const chBotKomut = await placeTextChannel('🤖︲bot-komut', catCommunity)
  const chMinecraft = await placeTextChannel('⛏️︲minecraft-sohbet', catCommunity)
  const chTasarim = await placeTextChannel('🎨︲tasarim-vitrini', catCommunity)
  const chGorsel = await placeTextChannel('📸︲görsel-galeri', catCommunity)
  const chPartner = await placeTextChannel('🎗️︲partnerlik', catCommunity)
  await placeVoiceChannel('🔊 Sohbet Odası 1', catCommunity)
  await placeVoiceChannel('🔊 Sohbet Odası 2', catCommunity)
  await placeVoiceChannel('🎮 Oyun Odası', catCommunity)

  // --- Kategori 4: Yönetim & Güvenlik ---
  const chAdmin2FA = await placeTextChannel('admin-2fa', catAdmin, { overwrites: privateStaffOverwrites })
  const chYonetimSohbet = await placeTextChannel('🔑︲yönetim-sohbet', catAdmin, { overwrites: privateStaffOverwrites })
  const chSiparisLog = await placeTextChannel('📋︲siparis-log', catAdmin, { overwrites: privateStaffOverwrites })
  const chGuvenlikLog = await placeTextChannel('🚨︲guvenlik-log', catAdmin, { overwrites: privateStaffOverwrites })
  const chFreezeOdasi = await placeTextChannel('❄️︲freeze-odasi', catAdmin, {
    overwrites: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: freezeRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ]
  })
  const chFreezeLog = await placeTextChannel('❄️︲freeze-log', catAdmin, { overwrites: privateStaffOverwrites })
  await placeVoiceChannel('🔒 Yönetim Toplantı', catAdmin)

  const protectedChannelIds = new Set([
    chKurallar.id, chDuyurular.id, chWebsite.id, chSiparisRehber.id, chIcerik.id, chGelenGiden.id, chBoostLog.id,
    chSatinAlimlar.id, chGorusme.id,
    chSohbet.id, chBotKomut.id, chMinecraft.id, chTasarim.id, chGorsel.id, chPartner.id,
    chAdmin2FA.id, chYonetimSohbet.id, chSiparisLog.id, chGuvenlikLog.id, chFreezeOdasi.id, chFreezeLog.id
  ])

  // 4. AÇIK SİPARİŞ TİCKETLARINI TİCKET KATEGORİSİNE TAŞI
  guild.channels.cache.forEach(async (ch) => {
    if (ch.name.startsWith('siparis-') && ch.type === ChannelType.GuildText) {
      if (ch.parentId !== catTickets.id) {
        await ch.setParent(catTickets.id).catch(() => {})
        console.log(`[TİCKET TAŞINDI] ${ch.name} -> ${catTickets.name}`)
      }
    }
  })

  // 5. GEREKSİZ / ESKİ YEDEK KANALLARI VE KATEGORİLERİ TEMİZLE
  console.log('[TEMİZLİK] Fazlalık ve mükerrer kanallar siliniyor...')
  for (const [id, ch] of guild.channels.cache) {
    if (ch.type === ChannelType.GuildCategory) {
      if (!protectedCategoryIds.has(ch.id)) {
        // Eğer kategori içinde taşınmamış sipariş ticketı varsa taşındıktan sonra sil
        const children = guild.channels.cache.filter(c => c.parentId === ch.id)
        for (const [childId, child] of children) {
          if (child.name.startsWith('siparis-')) {
            await child.setParent(catTickets.id).catch(() => {})
          } else if (!protectedChannelIds.has(child.id)) {
            await child.delete('Gereksiz/Mükerrer kanal temizliği').catch(() => {})
          }
        }
        await ch.delete('Eski/Mükerrer kategori temizliği').catch(() => {})
        console.log(`[KATEGORİ SİLİNDİ] ${ch.name}`)
      }
    } else {
      if (!protectedChannelIds.has(ch.id) && !ch.name.startsWith('siparis-') && !protectedCategoryIds.has(ch.parentId)) {
        await ch.delete('Gereksiz/Mükerrer kanal temizliği').catch(() => {})
        console.log(`[KANAL SİLİNDİ] ${ch.name}`)
      }
    }
  }

  // 6. STORE.JSON GÜNCELLEMESİ
  const store = loadStore()
  const guildId = guild.id

  store.orderSettings = store.orderSettings || {}
  store.orderSettings[guildId] = {
    purchaseChannelId: chSatinAlimlar.id,
    ticketCategoryId: catTickets.id,
    staffRoleId: staffRole.id,
    voiceChannelId: chGorusme.id
  }

  store.welcomeChannel = store.welcomeChannel || {}
  store.welcomeChannel[guildId] = chGelenGiden.id

  store.boostChannel = store.boostChannel || {}
  store.boostChannel[guildId] = chBoostLog.id

  store.freezeChannel = store.freezeChannel || {}
  store.freezeChannel[guildId] = chFreezeOdasi.id

  store.freezeRole = store.freezeRole || {}
  store.freezeRole[guildId] = freezeRole.id

  store.freezeLogChannel = store.freezeLogChannel || {}
  store.freezeLogChannel[guildId] = chFreezeLog.id

  store.admin2FASettings = store.admin2FASettings || {}
  store.admin2FASettings[guildId] = {
    channelId: chAdmin2FA.id
  }

  store.generalTicketSettings = store.generalTicketSettings || {}
  store.generalTicketSettings[guildId] = {
    categoryId: catTickets.id,
    staffRoleId: staffRole.id
  }

  saveStore(store)
  console.log('[SİSTEM] store.json tamamen temizlenmiş yeni hiyerarşiyle kaydedildi!')

  return { success: true }
}

client.once('ready', async () => {
  const guild = client.guilds.cache.get(process.env.GUILD_ID)
  if (guild) {
    try {
      await cleanAndOrganize(guild)
      console.log('[BAŞARILI] Discord sunucusu kristal netliğinde ve sade olarak düzenlendi!')
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

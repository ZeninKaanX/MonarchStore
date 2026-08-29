const { 
  ChannelType, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js')
const { loadStore, saveStore } = require('./util')

async function ensureRole (guild, name, options = {}) {
  let role = guild.roles.cache.find(r => r.name.toLowerCase().trim() === name.toLowerCase().trim())
  if (!role) {
    try {
      role = await guild.roles.create({
        name,
        color: options.color || '#94a3b8',
        hoist: options.hoist !== undefined ? options.hoist : true,
        mentionable: options.mentionable !== undefined ? options.mentionable : true,
        permissions: options.permissions || undefined,
        reason: 'Monarch Store otomatik rol kurulumu'
      })
      console.log(`[ROL] Yeni rol oluşturuldu: ${name}`)
    } catch (err) {
      console.error(`[ROL HATA] ${name} oluşturulamadı:`, err.message)
    }
  } else {
    // Mevcut rolü güncelle
    if (options.color && role.hexColor.toLowerCase() !== options.color.toLowerCase()) {
      await role.setColor(options.color).catch(() => {})
    }
    if (options.hoist !== undefined && role.hoist !== options.hoist) {
      await role.setHoist(options.hoist).catch(() => {})
    }
  }
  return role
}

async function ensureCategory (guild, name, position, permissionOverwrites = []) {
  let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes(name.toLowerCase().replace(/[^a-z0-9]/gi, '')))
  if (!category) {
    category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase())
  }

  if (!category) {
    try {
      category = await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        position,
        permissionOverwrites,
        reason: 'Monarch Store kategori kurulumu'
      })
      console.log(`[KATEGORİ] Oluşturuldu: ${name}`)
    } catch (err) {
      console.error(`[KATEGORİ HATA] ${name} oluşturulamadı:`, err.message)
    }
  } else {
    if (category.name !== name) {
      await category.setName(name).catch(() => {})
    }
    if (permissionOverwrites.length > 0) {
      await category.permissionOverwrites.set(permissionOverwrites).catch(() => {})
    }
  }
  return category
}

async function ensureTextChannel (guild, name, category, options = {}) {
  const cleanSearch = name.replace(/[^a-z0-9-]/gi, '').toLowerCase()
  let channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && (
    c.name.toLowerCase() === name.toLowerCase() ||
    c.name.replace(/[^a-z0-9-]/gi, '').toLowerCase() === cleanSearch
  ))

  if (!channel) {
    try {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category?.id,
        topic: options.topic || 'Monarch Store resmi kanalı.',
        permissionOverwrites: options.permissionOverwrites || [],
        reason: 'Monarch Store kanal kurulumu'
      })
      console.log(`[KANAL] Oluşturuldu: #${name}`)
    } catch (err) {
      console.error(`[KANAL HATA] #${name} oluşturulamadı:`, err.message)
    }
  } else {
    if (category && channel.parentId !== category.id) {
      await channel.setParent(category.id, { lockPermissions: false }).catch(() => {})
    }
    if (options.permissionOverwrites && options.permissionOverwrites.length > 0) {
      await channel.permissionOverwrites.set(options.permissionOverwrites).catch(() => {})
    }
    if (options.topic && channel.topic !== options.topic) {
      await channel.setTopic(options.topic).catch(() => {})
    }
  }
  return channel
}

async function ensureVoiceChannel (guild, name, category, options = {}) {
  let channel = guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes(name.toLowerCase()))

  if (!channel) {
    try {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: category?.id,
        userLimit: options.userLimit || 0,
        permissionOverwrites: options.permissionOverwrites || [],
        reason: 'Monarch Store ses kanalı kurulumu'
      })
      console.log(`[SES] Oluşturuldu: 🔊 ${name}`)
    } catch (err) {
      console.error(`[SES HATA] 🔊 ${name} oluşturulamadı:`, err.message)
    }
  } else {
    if (category && channel.parentId !== category.id) {
      await channel.setParent(category.id).catch(() => {})
    }
  }
  return channel
}

async function setupFullServerHierarchy (guild) {
  console.log(`[KURULUM BAŞLADI] ${guild.name} için Monarch Store rol ve kanal mimarisi yapılandırılıyor...`)

  // 1. ROLLERİN KURULUMU
  const founderRole = await ensureRole(guild, 'Founder', { color: '#7c3aed', hoist: true })
  const adminRole = await ensureRole(guild, '︲Admin', { color: '#e11d48', hoist: true })
  const staffRole = await ensureRole(guild, 'Satış Ekibi', { color: '#3b82f6', hoist: true })
  const customerRole = await ensureRole(guild, '💎︲Müşteri', { color: '#10b981', hoist: true })
  const boosterRole = await ensureRole(guild, '︲Monarch Booster', { color: '#f47fff', hoist: true })
  const memberRole = await ensureRole(guild, '︲Üye', { color: '#94a3b8', hoist: false })
  const freezeRole = await ensureRole(guild, '❄️︲Freeze', { color: '#ef4444', hoist: true })

  const everyone = guild.roles.everyone
  const botMember = guild.members.me

  // Yetki şablonları
  const publicReadPermissions = [
    { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }
  ]

  const privateStaffPermissions = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ]

  if (botMember) {
    privateStaffPermissions.push({
      id: botMember.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels]
    })
  }

  // 2. KATEGORİLER VE KANALLAR
  // Kategori 1: Bilgilendirme
  const catInfo = await ensureCategory(guild, '👑 │ BİLGİLENDİRME', 0)
  const chKurallar = await ensureTextChannel(guild, '📜︲kurallar', catInfo, {
    topic: 'Monarch Store sunucu ve sipariş kuralları.',
    permissionOverwrites: publicReadPermissions
  })
  const chDuyurular = await ensureTextChannel(guild, '📢︲duyurular', catInfo, {
    topic: 'Monarch Store güncellemeleri, indirimler ve duyurular.',
    permissionOverwrites: publicReadPermissions
  })
  const chWebsite = await ensureTextChannel(guild, '🌐︲web-sitesi', catInfo, {
    topic: 'Monarch Store resmi web sitesi ve ürün kataloğu: http://astralissaga.xyz/',
    permissionOverwrites: publicReadPermissions
  })
  const chHosgeldin = await ensureTextChannel(guild, '👋︲hos-geldiniz', catInfo, {
    topic: 'Aramıza katılan yeni üyelerimizin karşılama kanalı.'
  })
  const chBoostLog = await ensureTextChannel(guild, '🚀︲boost-log', catInfo, {
    topic: 'Sunucu takviye (boost) bildirimleri.'
  })

  // Kategori 2: Sipariş & Hizmetler
  const catStore = await ensureCategory(guild, '📦 │ MONARCH SİPARİŞ', 1)
  const chSiparisBilgi = await ensureTextChannel(guild, '🛒︲siparis-bilgi', catStore, {
    topic: 'Siteden sipariş verme ve otomatik teslimat rehberi.',
    permissionOverwrites: publicReadPermissions
  })
  const chSatinAlim = await ensureTextChannel(guild, '📥︲satin-alimlar', catStore, {
    topic: 'Web sitesi üzerinden gelen doğrulanmış sipariş kartları.',
    permissionOverwrites: privateStaffPermissions
  })
  const chGorusme = await ensureVoiceChannel(guild, '🔊 Sipariş Görüşme Odası', catStore, {
    userLimit: 5
  })

  // Kategori 3: Sipariş Ticketları (Otomatik Müşteri Ticket Kategorisi)
  const catTickets = await ensureCategory(guild, '🎫 │ SİPARİŞ TİCKETLARI', 2, privateStaffPermissions)

  // Kategori 4: Topluluk & Sohbet
  const catCommunity = await ensureCategory(guild, '💬 │ TOPLULUK & SOHBET', 3)
  const chSohbet = await ensureTextChannel(guild, '💬︲genel-sohbet', catCommunity, {
    topic: 'Monarch Store topluluk sohbet kanalı.'
  })
  const chBotKomut = await ensureTextChannel(guild, '🤖︲bot-komut', catCommunity, {
    topic: 'Bot komutlarını kullanabileceğiniz kanal.'
  })
  const chMinecraft = await ensureTextChannel(guild, '⛏️︲minecraft-sohbet', catCommunity, {
    topic: 'Minecraft AFK, Miner ve Farmer botları hakkında sohbet.'
  })
  const chTasarim = await ensureTextChannel(guild, '🎨︲tasarim-vitrini', catCommunity, {
    topic: 'UI/UX arayüz ve sunum tasarımlarının paylaşıldığı vitrin.'
  })
  const chGorsel = await ensureTextChannel(guild, '📸︲görsel-galeri', catCommunity, {
    topic: 'Fotoğraf, ekran görüntüsü ve medya paylaşım kanalı.'
  })

  await ensureVoiceChannel(guild, '🔊 Sohbet Odası 1', catCommunity)
  await ensureVoiceChannel(guild, '🔊 Sohbet Odası 2', catCommunity)
  await ensureVoiceChannel(guild, '🎮 Oyun Odası', catCommunity)

  // Kategori 5: Yönetim & Güvenlik (Tamamen Gizli)
  const catAdmin = await ensureCategory(guild, '🛡️ │ YÖNETİM & GÜVENLİK', 4, privateStaffPermissions)
  const chAdmin2FA = await ensureTextChannel(guild, 'admin-2fa', catAdmin, {
    topic: 'Web paneli 2FA yetkili giriş kodları ve etiket kanalı.',
    permissionOverwrites: privateStaffPermissions
  })
  const chSiparisLog = await ensureTextChannel(guild, '📋︲siparis-log', catAdmin, {
    topic: 'Sipariş durum değişiklikleri ve teslimat logları.',
    permissionOverwrites: privateStaffPermissions
  })
  const chGuvenlikLog = await ensureTextChannel(guild, '🚨︲guvenlik-log', catAdmin, {
    topic: 'Spam, raid, filtre ve moderasyon logları.',
    permissionOverwrites: privateStaffPermissions
  })
  const chFreezeOdasi = await ensureTextChannel(guild, '❄️︲freeze-odasi', catAdmin, {
    topic: 'Moderasyon inceleme ve dondurma odası.',
    permissionOverwrites: privateStaffPermissions
  })
  const chFreezeLog = await ensureTextChannel(guild, '❄️︲freeze-log', catAdmin, {
    topic: 'Freeze işlem kayıtları.',
    permissionOverwrites: privateStaffPermissions
  })

  // 3. STORE.JSON'A TÜM SERVİSLERİ KAYDETME
  const store = loadStore()
  const guildId = guild.id

  store.orderSettings = store.orderSettings || {}
  store.orderSettings[guildId] = {
    purchaseChannelId: chSatinAlim.id,
    ticketCategoryId: catTickets.id,
    staffRoleId: staffRole.id,
    voiceChannelId: chGorusme.id
  }

  store.welcomeChannel = store.welcomeChannel || {}
  store.welcomeChannel[guildId] = chHosgeldin.id

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
  console.log('[SİSTEM] store.json tüm kanal ve rol ayarlarıyla güncellendi!')

  // 4. BİLGİLENDİRME KANALLARINA GÖMÜLÜ EMBED MESAJLARI GÖNDERME
  await postWebsiteEmbed(chWebsite)
  await postRulesEmbed(chKurallar)
  await postOrderInfoEmbed(chSiparisBilgi)

  return {
    success: true,
    roles: { founderRole, adminRole, staffRole, customerRole, boosterRole, memberRole, freezeRole },
    channels: { chWebsite, chKurallar, chSiparisBilgi, chSatinAlim, chHosgeldin, chAdmin2FA }
  }
}

async function postWebsiteEmbed (channel) {
  if (!channel) return
  const messages = await channel.messages.fetch({ limit: 5 }).catch(() => null)
  if (messages && messages.size > 0) return // Zaten mesaj varsa tekrar gönderme

  const embed = new EmbedBuilder()
    .setColor(0x3e83b8)
    .setTitle('👑 Monarch Store — Resmi Web Sitesi & Mağazamız')
    .setDescription('En üst düzey **Minecraft Botları**, modern **UI/UX Tasarımlar** ve profesyonel **Sunum Hizmetleri** için web mağazamızı ziyaret edin!\n\n🌐 **Web Adresimiz:** [http://astralissaga.xyz/](http://astralissaga.xyz/)')
    .addFields(
      {
        name: '🤖 Minecraft Bot Paketleri',
        value: '• **AFK Botu:** 7/24 Kesintisiz Sunucu Varlığı (150 TL)\n• **Madenci Botu:** Otomatik Blok & Maden Toplama (300 TL)\n• **Çiftçi Botu:** Otomatik Hasat & Sandık Depolama (250 TL)',
        inline: false
      },
      {
        name: '🎨 UI/UX Tasarım Hizmetleri',
        value: '• **Starter Paket:** Modern Dashboard Arayüzü (400 TL)\n• **Pro Sistem:** Kapsamlı Figma Tasarım & Prototip (750 TL)\n• **Custom Design:** Özel Marka & Web Çözümleri (1.200 TL)',
        inline: false
      },
      {
        name: '📑 Sunum & Slayt Hazırlama',
        value: '• **Basic Paket:** 10 Slaytlık Şık Sunum (150 TL)\n• **Pro Sunum:** 20 Slayt & Animasyonlu Geçişler (275 TL)\n• **Premium Deck:** Sınırsız Revizyon & Pitch Deck (450 TL)',
        inline: false
      },
      {
        name: '⚡ Nasıl Satın Alınır?',
        value: '1. [astralissaga.xyz](http://astralissaga.xyz/) adresine gidin ve ürünleri sepete ekleyin.\n2. Discord kullanıcı adınızı yazarak sipariş oluşturun.\n3. Siparişiniz otomatik olarak Discord sunucumuzda doğrulanır ve özel teslimat ticket\'ınız açılır!',
        inline: false
      }
    )
    .setImage('https://raw.githubusercontent.com/ZeninKaanX/MonarchStore/main/images/hero-banner.webp')
    .setFooter({ text: 'Monarch Store Enterprise © 2026' })
    .setTimestamp()

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🌐 Web Sitesini Aç')
      .setStyle(ButtonStyle.Link)
      .setURL('http://astralissaga.xyz/'),
    new ButtonBuilder()
      .setLabel('💬 Discord Destek')
      .setStyle(ButtonStyle.Link)
      .setURL('https://discord.gg/monarchstore')
  )

  await channel.send({ embeds: [embed], components: [row] }).catch(() => {})
}

async function postRulesEmbed (channel) {
  if (!channel) return
  const messages = await channel.messages.fetch({ limit: 5 }).catch(() => null)
  if (messages && messages.size > 0) return

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('📜 Monarch Store — Sunucu ve Alışveriş Kuralları')
    .setDescription('Topluluğumuzda ve alışveriş süreçlerimizde huzurlu ve güvenli bir ortam sağlamak adına kurallarımız:')
    .addFields(
      { name: '1. Saygı ve Hoşgörü', value: 'Sunucu üyelerine ve destek ekibine karşı her türlü hakaret, küfür, argo ve kışkırtma yasaktır.' },
      { name: '2. Reklam ve Spam Yasağı', value: 'Özelden veya kanallardan yetkisiz sunucu reklamı yapmak, link paylaşmak ve spam atmak kesinlikle yasaktır.' },
      { name: '3. Sipariş & Ödeme Güvenliği', value: 'Tüm siparişler yalnızca web sitemiz [astralissaga.xyz](http://astralissaga.xyz/) ve yetkili ticket kanalları üzerinden yürütülür. Yetkili olmayan kişilere asla ödeme yapmayınız.' },
      { name: '4. Gizlilik ve 2FA Koruması', value: 'Yetkili hesapları Discord 2FA sistemiyle çift katmanlı korunmaktadır. Güvenlik kodlarınızı kimseyle paylaşmayınız.' }
    )
    .setFooter({ text: 'Kurallara uymayan kullanıcılar uyarılmaksızın uzaklaştırılabilir.' })

  await channel.send({ embeds: [embed] }).catch(() => {})
}

async function postOrderInfoEmbed (channel) {
  if (!channel) return
  const messages = await channel.messages.fetch({ limit: 5 }).catch(() => null)
  if (messages && messages.size > 0) return

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('🛒 Monarch Store — Sipariş ve Teslimat Süreci')
    .setDescription('Web sitemiz üzerinden verilen siparişler otomatik olarak Discord botumuza iletilir ve dakikalar içinde işleme alınır!')
    .addFields(
      { name: '📦 1. Sepetini Oluştur', value: '[astralissaga.xyz](http://astralissaga.xyz/) adresinde istediğin Minecraft botunu, tasarım veya sunum paketini seç.' },
      { name: '💬 2. Discord Adını Belirt', value: 'Ödeme ekranında Discord kullanıcı adını yazarak siparişi tamamla.' },
      { name: '🎫 3. Otomatik Ticket', value: 'Botumuz sunucumuzda sana özel bir **Sipariş Ticketı** açacak ve Satış Ekibimiz anında seninle iletişime geçecektir.' },
      { name: '🔊 4. Sesli Görüşme (Opsiyonel)', value: 'Detaylı bot yapılandırması veya özel tasarımlar için Görüşme Odasında ekran paylaşımıyla teslimat yapılır.' }
    )
    .setFooter({ text: 'Monarch Store Hızlı Teslimat Güvencesi' })

  await channel.send({ embeds: [embed] }).catch(() => {})
}

module.exports = {
  setupFullServerHierarchy,
  postWebsiteEmbed,
  postRulesEmbed,
  postOrderInfoEmbed
}

require('dotenv').config()
const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('discord.js')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
})

async function run () {
  console.log('[BAĞLANTI] Discord botu bağlanıyor...')
  const guild = client.guilds.cache.get(process.env.GUILD_ID)
  if (!guild) {
    console.error('Sunucu bulunamadı.')
    process.exit(1)
  }

  console.log(`Sunucu: ${guild.name} (${guild.id})`)

  // 1. ROLLERİ BUL VEYA OLUŞTUR
  async function getOrCreateRole (name, options = {}) {
    let role = guild.roles.cache.find(r => r.name.toLowerCase().trim() === name.toLowerCase().trim())
    if (!role) {
      role = await guild.roles.create({
        name,
        color: options.color || '#94a3b8',
        hoist: options.hoist !== undefined ? options.hoist : true,
        mentionable: options.mentionable !== undefined ? options.mentionable : true,
        reason: 'Monarch Store rol kurulumu'
      })
      console.log(`[ROL OLUŞTURULDU] ${name}`)
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

  const founderRole = await getOrCreateRole('Founder', { color: '#7c3aed', hoist: true })
  const adminRole = await getOrCreateRole('︲Admin', { color: '#e11d48', hoist: true })
  const staffRole = await getOrCreateRole('Satış Ekibi', { color: '#3b82f6', hoist: true })
  const creatorRole = await getOrCreateRole('📽️︲İçerik Üreticisi', { color: '#ff2a5f', hoist: true })
  const customerRole = await getOrCreateRole('💎︲Müşteri', { color: '#10b981', hoist: true })
  const boosterRole = await getOrCreateRole('︲Monarch Booster', { color: '#f47fff', hoist: true })
  const memberRole = await getOrCreateRole('︲Üye', { color: '#94a3b8', hoist: false })
  const freezeRole = await getOrCreateRole('❄️︲Freeze', { color: '#ef4444', hoist: true })

  const everyone = guild.roles.everyone
  const botMember = guild.members.me

  // 2. KROX_06'YA İÇERİK ÜRETİCİSİ ROLÜNÜ VER
  console.log('krox_06 üyesi aranıyor...')
  const members = await guild.members.fetch()
  const krox = members.find(m => 
    m.user.username.toLowerCase().includes('krox') || 
    m.displayName.toLowerCase().includes('krox') ||
    m.id === '1511798638022496495'
  )

  if (krox) {
    await krox.roles.add(creatorRole).catch(err => console.error('Rol verilemedi:', err.message))
    console.log(`[BAŞARILI] ${krox.user.tag} (${krox.id}) kullanıcısına ${creatorRole.name} rolü verildi!`)
  } else {
    console.warn('[UYARI] krox_06 sunucuda bulunamadı.')
  }

  // 3. KANALLARI VE KATEGORİLERİ DÜZENLE
  const channels = guild.channels.cache

  // Kategori 1: 👑 │ BİLGİLENDİRME
  const catInfo = channels.find(c => c.type === ChannelType.GuildCategory && c.name.includes('BİLGİLENDİRME'))
  if (catInfo) {
    await catInfo.permissionOverwrites.set([
      { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }
    ])

    // İçerik Üreticisi Kanalı
    let chCreator = channels.find(c => c.type === ChannelType.GuildText && c.name.includes('içerik-üreticisi'))
    if (!chCreator) {
      chCreator = await guild.channels.create({
        name: '📽️︲içerik-üreticisi',
        type: ChannelType.GuildText,
        parent: catInfo.id,
        topic: 'Monarch Store yetkili içerik üreticilerinin video ve canlı yayın paylaşım kanalı.'
      })
    } else {
      if (chCreator.parentId !== catInfo.id) await chCreator.setParent(catInfo.id).catch(() => {})
    }

    if (chCreator) {
      await chCreator.permissionOverwrites.set([
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: creatorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
        { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
        { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }
      ])
      console.log('[İZİN GÜNCELLENDİ] #📽️︲içerik-üreticisi kanalı izinleri ayarlandı.')
    }
  }

  // Kategori 2: 📦 │ MONARCH SİPARİŞ
  const catStore = channels.find(c => c.type === ChannelType.GuildCategory && c.name.includes('MONARCH SİPARİŞ'))
  if (catStore) {
    const chSatinAlim = channels.find(c => c.type === ChannelType.GuildText && c.name.includes('satin-alimlar'))
    if (chSatinAlim) {
      await chSatinAlim.permissionOverwrites.set([
        { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] }
      ])
    }
  }

  // Kategori 3: 🎫 │ SİPARİŞ TİCKETLARI
  const catTickets = channels.find(c => c.type === ChannelType.GuildCategory && c.name.includes('SİPARİŞ TİCKETLARI'))
  if (catTickets) {
    await catTickets.permissionOverwrites.set([
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
    ])
  }

  // Kategori 4: 💬 │ TOPLULUK & SOHBET
  const catCommunity = channels.find(c => c.type === ChannelType.GuildCategory && c.name.includes('TOPLULUK & SOHBET'))
  if (catCommunity) {
    await catCommunity.permissionOverwrites.set([
      { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
      { id: freezeRole.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] }
    ])
  }

  // Kategori 5: 🛡️ │ YÖNETİM & GÜVENLİK
  const catAdmin = channels.find(c => c.type === ChannelType.GuildCategory && c.name.includes('YÖNETİM & GÜVENLİK'))
  if (catAdmin) {
    await catAdmin.permissionOverwrites.set([
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] }
    ])

    // Freeze Odası: Yalnızca Freeze rolü ve yetkililer görebilir
    const chFreeze = channels.find(c => c.type === ChannelType.GuildText && c.name.includes('freeze-odasi'))
    if (chFreeze) {
      await chFreeze.permissionOverwrites.set([
        { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: freezeRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ])
    }
  }

  console.log('[TAMAMLANDI] Tüm roller, yetkiler ve kanal erişim izinleri başarıyla ayarlandı!')
}

client.once('ready', async () => {
  try {
    await run()
  } catch (err) {
    console.error('Hata:', err)
  } finally {
    setTimeout(() => {
      client.destroy()
      process.exit(0)
    }, 2000)
  }
})

client.login(process.env.DISCORD_TOKEN)

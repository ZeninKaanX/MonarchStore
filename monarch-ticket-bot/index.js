require('dotenv').config()

const {
  Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder, ActivityType
} = require('discord.js')
const readline = require('readline')
const filter = require('./src/filter')
const security = require('./src/security')
const freeze = require('./src/freeze')
const mirror = require('./src/mirror')
const welcome = require('./src/welcome')
const tickets = require('./src/tickets')
const { createOrderQueue, configuredForOrders } = require('./src/orders')
const { findMember, getRank, loadStore, logTo, saveStore } = require('./src/util')

const TOKEN = process.env.DISCORD_TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID
const PREFIX = process.env.PREFIX || '!'
const POLL_INTERVAL = Math.max(8000, Number(process.env.ORDER_POLL_INTERVAL_MS) || 12000)

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('[HATA] DISCORD_TOKEN, CLIENT_ID ve hedef GUILD_ID .env dosyasında tanımlanmalıdır.')
  process.exit(1)
}

const adminOnly = (interaction) => interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || interaction.user.id === interaction.guild?.ownerId || getRank(interaction.member) >= 50
const modOnly = (interaction) => interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) || interaction.user.id === interaction.guild?.ownerId || getRank(interaction.member) >= 30
const withUser = (builder, name, description, required = true) => builder.addUserOption((option) => option.setName(name).setDescription(description).setRequired(required))
const withText = (builder, name, description, required = true) => builder.addStringOption((option) => option.setName(name).setDescription(description).setRequired(required))

const slashCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Bot gecikmesini gösterir.'),
  new SlashCommandBuilder().setName('yardim').setDescription('Komut listesini gösterir.'),
  new SlashCommandBuilder().setName('sunucu').setDescription('Sunucu bilgilerini gösterir.'),
  new SlashCommandBuilder().setName('botbilgi').setDescription('Bot durumunu gösterir.'),
  new SlashCommandBuilder().setName('sil').setDescription('Mesajları siler.').addIntegerOption((o) => o.setName('adet').setDescription('1-100 arası mesaj sayısı').setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('yaz').setDescription('Botla mesaj yazdırır.').addStringOption((o) => o.setName('metin').setDescription('Gönderilecek mesaj').setRequired(true)),
  withUser(new SlashCommandBuilder().setName('ban').setDescription('Üyeyi yasaklar.'), 'kullanici', 'Yasaklanacak üye'),
  withUser(new SlashCommandBuilder().setName('kick').setDescription('Üyeyi atar.'), 'kullanici', 'Atılacak üye'),
  withUser(new SlashCommandBuilder().setName('sustur').setDescription('Üyeyi geçici susturur.'), 'kullanici', 'Susturulacak üye').addIntegerOption((o) => o.setName('dakika').setDescription('1-10080 dakika').setMinValue(1).setMaxValue(10080).setRequired(true)),
  withUser(new SlashCommandBuilder().setName('susturma-kaldir').setDescription('Üyenin susturmasını kaldırır.'), 'kullanici', 'Susturması kaldırılacak üye'),
  withText(withUser(new SlashCommandBuilder().setName('uyar').setDescription('Üyeye uyarı verir.'), 'kullanici', 'Uyarılacak üye'), 'sebep', 'Uyarı nedeni'),
  withUser(new SlashCommandBuilder().setName('uyarilar').setDescription('Üyenin uyarılarını gösterir.'), 'kullanici', 'Üye'),
  withUser(new SlashCommandBuilder().setName('uyarilari-sil').setDescription('Üyenin tüm uyarılarını siler.'), 'kullanici', 'Üye'),
  new SlashCommandBuilder().setName('kilitle').setDescription('Bu metin kanalını kilitler.'),
  new SlashCommandBuilder().setName('kilidi-ac').setDescription('Bu metin kanalının kilidini açar.'),
  new SlashCommandBuilder().setName('yavas-mod').setDescription('Bu kanalda yavaş modu ayarlar.').addIntegerOption((o) => o.setName('saniye').setDescription('0-21600 saniye').setMinValue(0).setMaxValue(21600).setRequired(true)),
  withText(withText(new SlashCommandBuilder().setName('duyuru').setDescription('Gömülü duyuru gönderir.'), 'baslik', 'Duyuru başlığı'), 'metin', 'Duyuru metni'),
  withText(new SlashCommandBuilder().setName('anket').setDescription('Tepkili anket oluşturur.'), 'soru', 'Anket sorusu'),
  new SlashCommandBuilder().setName('ticket-panel').setDescription('Genel destek ticket paneli gönderir.').addChannelOption((o) => o.setName('kanal').setDescription('Panel kanalı').addChannelTypes(ChannelType.GuildText).setRequired(false)),
  new SlashCommandBuilder().setName('ticket-ayarla').setDescription('Mevcut genel destek kategorisi ve ekip rolünü seçer.')
    .addChannelOption((o) => o.setName('ticket_kategorisi').setDescription('Mevcut destek kategorisi').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    .addRoleOption((o) => o.setName('ekip_rolu').setDescription('Destek ticketlarını görecek mevcut ekip rolü').setRequired(true)),
  new SlashCommandBuilder().setName('ticket-kapat').setDescription('Genel destek ticketını kapatır.'),
  new SlashCommandBuilder().setName('filtre').setDescription('Küfür filtresini açar veya kapatır.').addBooleanOption((o) => o.setName('aktif').setDescription('Filtre durumu').setRequired(true)),
  withText(new SlashCommandBuilder().setName('yasakli-kelime-ekle').setDescription('Özel yasaklı kelime ekler.'), 'kelime', 'Eklenecek kelime'),
  withText(new SlashCommandBuilder().setName('yasakli-kelime-sil').setDescription('Özel yasaklı kelime siler.'), 'kelime', 'Silinecek kelime'),
  new SlashCommandBuilder().setName('guvenlik').setDescription('Spam ve raid korumasını açar veya kapatır.').addBooleanOption((o) => o.setName('aktif').setDescription('Güvenlik durumu').setRequired(true)),
  new SlashCommandBuilder().setName('raid-modu').setDescription('Raid modunu açar veya kapatır.'),
  new SlashCommandBuilder().setName('yeni-hesap-koruma').setDescription('Yeni hesap koruması için gün sınırı ayarlar.').addIntegerOption((o) => o.setName('gun').setDescription('0 korumayı kapatır').setMinValue(0).setMaxValue(365).setRequired(true)),
  withText(withUser(new SlashCommandBuilder().setName('freeze').setDescription('Üyeyi freeze kanalına alır.'), 'kullanici', 'Dondurulacak üye'), 'sebep', 'Freeze nedeni', false),
  withUser(new SlashCommandBuilder().setName('unfreeze').setDescription('Üyenin erişimlerini geri verir.'), 'kullanici', 'Çözülecek üye'),
  new SlashCommandBuilder().setName('freeze-rolu').setDescription('Sunucuda var olan Freeze rolünü seçer.').addRoleOption((o) => o.setName('rol').setDescription('Mevcut Freeze rolü').setRequired(true)),
  new SlashCommandBuilder().setName('freeze-kanali').setDescription('Freeze kanalını ayarlar.').addChannelOption((o) => o.setName('kanal').setDescription('Metin veya ses kanalı').setRequired(true)),
  new SlashCommandBuilder().setName('freeze-log').setDescription('Freeze log kanalını ayarlar.').addChannelOption((o) => o.setName('kanal').setDescription('Log metin kanalı').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('hosgeldin-kanali').setDescription('Karşılama kanalını ayarlar.').addChannelOption((o) => o.setName('kanal').setDescription('Karşılama metin kanalı').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('boost-kanali').setDescription('Takviye bildirim kanalını ayarlar.').addChannelOption((o) => o.setName('kanal').setDescription('Takviye metin kanalı').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  withUser(new SlashCommandBuilder().setName('youtube-yansit').setDescription('Bir üyenin YouTube etkinliğini bota yansıtır.'), 'kullanici', 'Takip edilecek üye'),
  new SlashCommandBuilder().setName('siparis-kur').setDescription('Sipariş ticket kanalı ve ekip ayarlarını kaydeder.')
    .addChannelOption((o) => o.setName('satin_alim_kanali').setDescription('Doğrulanmış sipariş kartlarının kanalı').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption((o) => o.setName('ticket_kategorisi').setDescription('Özel sipariş ticket kategorisi').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    .addRoleOption((o) => o.setName('ekip_rolu').setDescription('Ticketları görecek ekip rolü').setRequired(true))
    .addChannelOption((o) => o.setName('gorusme_kanali').setDescription('Müşterilerin alınacağı ses kanalı').addChannelTypes(ChannelType.GuildVoice).setRequired(true)),
  new SlashCommandBuilder().setName('siparis-tara').setDescription('Bekleyen siparişleri hemen kontrol eder.'),
  withText(new SlashCommandBuilder().setName('siraya-al').setDescription('Doğrulanmış siparişi sıraya ekler.'), 'talep_kodu', 'Örn. MS-AB12CD'),
  withText(new SlashCommandBuilder().setName('isleme-al').setDescription('Sıradaki siparişi aktif işleme alır.'), 'talep_kodu', 'Örn. MS-AB12CD'),
  new SlashCommandBuilder().setName('sira-listesi').setDescription('Açık sipariş sırasını gösterir.'),
  withText(new SlashCommandBuilder().setName('sese-cektir').setDescription('Sipariş sahibini görüşme ses kanalına alır.'), 'talep_kodu', 'Örn. MS-AB12CD'),
  withText(new SlashCommandBuilder().setName('siparis-kapat').setDescription('Sipariş ticketını kapatır.'), 'talep_kodu', 'Örn. MS-AB12CD')
]

async function registerSlashCommands () {
  const rest = new REST({ version: '10' }).setToken(TOKEN)
  const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID)
  await rest.put(route, { body: slashCommands.map((command) => command.toJSON()) })
  console.log(`[SİSTEM] ${slashCommands.length} slash komutu yüklendi${GUILD_ID ? ' (anlık sunucu kaydı)' : ''}.`)
}

function requireGuild (interaction) {
  if (interaction.guild) return true
  interaction.reply({ content: 'Bu komut yalnızca Discord sunucusunda kullanılabilir.', ephemeral: true })
  return false
}

async function requirePermission (interaction, check) {
  if (check(interaction)) return true
  await interaction.reply({ content: 'Bu komutu kullanma yetkin yok.', ephemeral: true })
  return false
}

function warningStore (guildId) {
  const store = loadStore()
  store.warnings[guildId] = store.warnings[guildId] || {}
  return store
}

async function handleCommand (interaction, orderQueue, client) {
  if (!interaction.isChatInputCommand()) return
  if (!requireGuild(interaction)) return
  const name = interaction.commandName
  const adminCommands = new Set(['sil', 'yaz', 'ban', 'kick', 'sustur', 'susturma-kaldir', 'uyar', 'uyarilari-sil', 'kilitle', 'kilidi-ac', 'yavas-mod', 'duyuru', 'anket', 'ticket-panel', 'ticket-ayarla', 'filtre', 'yasakli-kelime-ekle', 'yasakli-kelime-sil', 'guvenlik', 'raid-modu', 'yeni-hesap-koruma', 'freeze', 'unfreeze', 'freeze-rolu', 'freeze-kanali', 'freeze-log', 'hosgeldin-kanali', 'boost-kanali', 'youtube-yansit', 'siparis-kur', 'siparis-tara', 'siraya-al', 'isleme-al', 'sira-listesi', 'sese-cektir', 'siparis-kapat'])
  const orderCommands = new Set(['siparis-kur', 'siparis-tara', 'siraya-al', 'isleme-al', 'sira-listesi', 'sese-cektir', 'siparis-kapat'])
  if (adminCommands.has(name) && !(await requirePermission(interaction, name === 'siparis-kur' ? adminOnly : modOnly))) return

  try {
    if (orderCommands.has(name) && interaction.guild.id !== GUILD_ID) throw new Error('Sipariş komutları yalnızca yapılandırılmış hedef sunucuda kullanılabilir.')
    if (name === 'ping') return interaction.reply(`🏓 Pong — WebSocket: ${Math.round(client.ws.ping)} ms`)
    if (name === 'yardim') return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor(0x3e83b8).setTitle('MonarchBot komutları').setDescription('Sipariş: `/siparis-kur`, `/siparis-tara`, `/siraya-al`, `/isleme-al`, `/sira-listesi`, `/sese-cektir`, `/siparis-kapat`\nDestek: `/ticket-panel`, `/ticket-kapat`\nModerasyon: `/sil`, `/uyar`, `/ban`, `/kick`, `/sustur`, `/freeze`, `/guvenlik`, `/filtre`\nTopluluk: `/hosgeldin-kanali`, `/boost-kanali`, `/youtube-yansit`')] })
    if (name === 'sunucu') return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(interaction.guild.name).addFields({ name: 'Üyeler', value: String(interaction.guild.memberCount), inline: true }, { name: 'Kanallar', value: String(interaction.guild.channels.cache.size), inline: true }, { name: 'ID', value: interaction.guild.id, inline: true })] })
    if (name === 'botbilgi') return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('MonarchBot').addFields({ name: 'Sunucular', value: String(client.guilds.cache.size), inline: true }, { name: 'Ping', value: `${Math.round(client.ws.ping)} ms`, inline: true }, { name: 'Çalışma', value: `${Math.floor(process.uptime() / 60)} dk`, inline: true })] })
    if (name === 'sil') { const count = interaction.options.getInteger('adet'); const deleted = await interaction.channel.bulkDelete(count, true); return interaction.reply({ content: `🧹 ${deleted.size} mesaj silindi.`, ephemeral: true }) }
    if (name === 'yaz') return interaction.reply(interaction.options.getString('metin'))
    if (name === 'ban' || name === 'kick') { const user = interaction.options.getUser('kullanici'); const member = await interaction.guild.members.fetch(user.id).catch(() => null); if (!member) throw new Error('Üye bulunamadı.'); if (name === 'ban') await member.ban({ reason: `MonarchBot: ${interaction.user.tag}` }); else await member.kick(`MonarchBot: ${interaction.user.tag}`); return interaction.reply(`✅ ${user.tag} ${name === 'ban' ? 'yasaklandı' : 'atıldı'}.`) }
    if (name === 'sustur' || name === 'susturma-kaldir') { const user = interaction.options.getUser('kullanici'); const member = await interaction.guild.members.fetch(user.id); await member.timeout(name === 'sustur' ? interaction.options.getInteger('dakika') * 60 * 1000 : null, `MonarchBot: ${interaction.user.tag}`); return interaction.reply(`✅ ${user.tag} için susturma ${name === 'sustur' ? 'uygulandı' : 'kaldırıldı'}.`) }
    if (name === 'uyar') { const user = interaction.options.getUser('kullanici'); const store = warningStore(interaction.guild.id); const list = store.warnings[interaction.guild.id][user.id] = store.warnings[interaction.guild.id][user.id] || []; list.push({ ts: Date.now(), reason: interaction.options.getString('sebep'), actor: interaction.user.id }); saveStore(store); return interaction.reply(`⚠️ ${user} uyarıldı. Toplam uyarı: ${list.length}.`) }
    if (name === 'uyarilar') { const user = interaction.options.getUser('kullanici'); const list = warningStore(interaction.guild.id).warnings[interaction.guild.id][user.id] || []; return interaction.reply({ ephemeral: true, content: list.length ? list.map((item, index) => `${index + 1}. ${item.reason} — <t:${Math.floor(item.ts / 1000)}:R>`).join('\n') : 'Uyarı bulunmuyor.' }) }
    if (name === 'uyarilari-sil') { const user = interaction.options.getUser('kullanici'); const store = warningStore(interaction.guild.id); delete store.warnings[interaction.guild.id][user.id]; saveStore(store); return interaction.reply(`✅ ${user.tag} için uyarılar silindi.`) }
    if (name === 'kilitle' || name === 'kilidi-ac') { await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: name === 'kilidi-ac' ? null : false }); return interaction.reply(name === 'kilitle' ? '🔒 Kanal kilitlendi.' : '🔓 Kanalın kilidi açıldı.') }
    if (name === 'yavas-mod') { const seconds = interaction.options.getInteger('saniye'); await interaction.channel.setRateLimitPerUser(seconds); return interaction.reply(`✅ Yavaş mod ${seconds} saniye olarak ayarlandı.`) }
    if (name === 'duyuru') return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3e83b8).setTitle(interaction.options.getString('baslik')).setDescription(interaction.options.getString('metin')).setTimestamp()] })
    if (name === 'anket') { const message = await interaction.reply({ content: `📊 **Anket:** ${interaction.options.getString('soru')}`, fetchReply: true }); await message.react('✅'); await message.react('❌'); return }
    if (name === 'ticket-ayarla') { tickets.saveTicketSettings(interaction.guild.id, { categoryId: interaction.options.getChannel('ticket_kategorisi').id, staffRoleId: interaction.options.getRole('ekip_rolu').id }); return interaction.reply({ content: 'Genel destek ticket kategorisi ve ekip rolü kaydedildi. Bot yeni kategori veya rol oluşturmaz.', ephemeral: true }) }
    if (name === 'ticket-panel') return tickets.sendTicketPanel(interaction)
    if (name === 'ticket-kapat') return tickets.closeTicket(interaction)
    if (name === 'filtre') { filter.setFilterEnabled(interaction.guild.id, interaction.options.getBoolean('aktif')); return interaction.reply(`✅ Küfür filtresi ${interaction.options.getBoolean('aktif') ? 'açıldı' : 'kapatıldı'}.`) }
    if (name === 'yasakli-kelime-ekle' || name === 'yasakli-kelime-sil') { const word = interaction.options.getString('kelime'); const changed = name === 'yasakli-kelime-ekle' ? filter.addWord(interaction.guild.id, word) : filter.removeWord(interaction.guild.id, word); return interaction.reply(changed ? '✅ Kelime listesi güncellendi.' : 'Bu kelime listede zaten yok / mevcut.') }
    if (name === 'guvenlik') return security.toggleSecurity(interaction, interaction.options.getBoolean('aktif'))
    if (name === 'raid-modu') return security.toggleRaid(interaction)
    if (name === 'yeni-hesap-koruma') return security.setNewAccountKick(interaction)
    if (name === 'freeze') return freeze.cmdFreeze(interaction)
    if (name === 'unfreeze') return freeze.cmdUnfreeze(interaction)
    if (name === 'freeze-rolu') return freeze.setFreezeRole(interaction)
    if (name === 'freeze-kanali') return freeze.setFreezeChannel(interaction)
    if (name === 'freeze-log') return freeze.setFreezeLogChannel(interaction)
    if (name === 'hosgeldin-kanali') return welcome.setWelcomeChannel(interaction)
    if (name === 'boost-kanali') return welcome.setBoostChannel(interaction)
    if (name === 'youtube-yansit') return mirror.setMirror(interaction)
    if (name === 'siparis-kur') { orderQueue.saveOrderSettings(interaction.guild.id, { purchaseChannelId: interaction.options.getChannel('satin_alim_kanali').id, ticketCategoryId: interaction.options.getChannel('ticket_kategorisi').id, staffRoleId: interaction.options.getRole('ekip_rolu').id, voiceChannelId: interaction.options.getChannel('gorusme_kanali').id }); return interaction.reply({ ephemeral: true, content: '✅ Sipariş kanalı, özel ticket kategorisi, ekip rolü ve görüşme kanalı ayarlandı.' }) }
    if (name === 'siparis-tara') { await orderQueue.tick(client, GUILD_ID); return interaction.reply({ ephemeral: true, content: '✅ Bekleyen siparişler kontrol edildi.' }) }
    if (name === 'siraya-al') { const order = await orderQueue.queueOrder(interaction, interaction.options.getString('talep_kodu')); return interaction.reply(`✅ ${order.order_code} talebi #${order.queue_position} sıraya eklendi.`) }
    if (name === 'isleme-al') { const order = await orderQueue.takeOrder(interaction, interaction.options.getString('talep_kodu')); return interaction.reply(`✅ ${order.order_code} talebi işleme alındı.`) }
    if (name === 'sira-listesi') { const list = await orderQueue.listQueue(interaction.guild); return interaction.reply({ ephemeral: true, content: list.length ? list.map((order) => `#${order.queue_position || '-'} · ${order.order_code} · ${order.discord_username} · ${order.status}`).join('\n') : 'Açık sipariş sırası yok.' }) }
    if (name === 'sese-cektir') { const code = interaction.options.getString('talep_kodu').toUpperCase(); const order = await orderQueue.getOpenOrder(code); if (!order?.discord_user_id) throw new Error('Sipariş bulunamadı veya ses görüşmesi için uygun değil.'); const settings = orderQueue.getOrderSettings(interaction.guild.id); if (!configuredForOrders(settings)) throw new Error('Sipariş kanalı ayarları eksik. Önce `/siparis-kur` komutunu kullan.'); const member = await interaction.guild.members.fetch(order.discord_user_id).catch(() => null); if (!member) throw new Error('Sipariş sahibi artık bu Discord sunucusunda değil.'); if (!member.voice.channelId) throw new Error('Kullanıcı şu an bir ses kanalında değil; önce bir ses kanalına katılması gerekir.'); const destination = await interaction.guild.channels.fetch(settings.voiceChannelId).catch(() => null); if (!destination?.isVoiceBased()) throw new Error('Ayarlanan görüşme kanalı artık geçerli değil.'); await member.voice.setChannel(destination, `Sipariş görüşmesi: ${code}`); return interaction.reply(`✅ ${member} görüşme kanalına alındı.`) }
    if (name === 'siparis-kapat') { const order = await orderQueue.closeOrder(interaction, interaction.options.getString('talep_kodu')); return interaction.reply(`✅ ${order.order_code} siparişi kapatıldı.`) }
  } catch (error) {
    console.error('[KOMUT HATASI]', name, error)
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: `❌ ${error.message || 'İşlem tamamlanamadı.'}`, ephemeral: true })
    else await interaction.reply({ content: `❌ ${error.message || 'İşlem tamamlanamadı.'}`, ephemeral: true })
  }
}

function setupConsole (client, orderQueue) {
  const line = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'MonarchBot> ' })
  line.prompt()
  line.on('line', async (raw) => {
    const [command, ...args] = raw.trim().split(/\s+/)
    if (command === 'yardim' || command === 'help') console.log('sunucular | kanallar <sunucu_id> | gonder <kanal_id> <metin> | durum <metin> | siparis-tara | cikis')
    else if (command === 'sunucular') client.guilds.cache.forEach((guild) => console.log(`[${guild.id}] ${guild.name}`))
    else if (command === 'kanallar') { const guild = client.guilds.cache.get(args[0]); guild?.channels.cache.forEach((channel) => console.log(`[${channel.id}] ${channel.name}`)) }
    else if (command === 'gonder') { const channel = await client.channels.fetch(args.shift()).catch(() => null); if (channel?.isTextBased()) await channel.send(args.join(' ')) }
    else if (command === 'durum') client.user.setActivity(args.join(' '), { type: ActivityType.Playing })
    else if (command === 'siparis-tara') await orderQueue.tick(client, GUILD_ID)
    else if (['cikis', 'exit', 'quit'].includes(command)) { client.destroy(); process.exit(0) }
    else if (command) console.log('Bilinmeyen komut. Liste için yardım yaz.')
    line.prompt()
  })
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildPresences], partials: [Partials.Channel, Partials.Message, Partials.User] })
const orderQueue = createOrderQueue({ supabaseUrl: process.env.SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY, pollIntervalMs: POLL_INTERVAL })

client.once('clientReady', async (readyClient) => {
  console.log(`[AKTİF] ${readyClient.user.tag} · ${readyClient.guilds.cache.size} sunucu`)
  readyClient.user.setActivity('Monarch Store siparişleri', { type: ActivityType.Watching })
  await registerSlashCommands().catch((error) => console.error('[KOMUT KAYDI]', error.message))
  for (const guild of readyClient.guilds.cache.values()) welcome.refresh(guild).catch(() => null)
  mirror.setup(readyClient)
  if (process.env.YOUTUBE_LOCAL_MIRROR === 'true') mirror.startLocal(readyClient)
  orderQueue.start(readyClient, GUILD_ID)
  setupConsole(readyClient, orderQueue)
})
client.on('interactionCreate', (interaction) => { if (interaction.isButton()) { if (interaction.customId.startsWith('ticket_') && interaction.customId !== 'ticket_close') return tickets.openTicket(interaction); if (interaction.customId === 'ticket_close') return tickets.closeTicket(interaction) } return handleCommand(interaction, orderQueue, client) })
client.on('messageCreate', async (message) => { if (message.author.bot) return; await filter.handleMessage(message); await security.handleMessage(message) })
welcome.setup(client)
client.on('guildMemberAdd', async (member) => { await security.onMemberJoin(member); await welcome.onMemberJoin(member) })
client.on('guildMemberUpdate', async (oldMember, newMember) => { if (!oldMember.premiumSinceTimestamp && newMember.premiumSinceTimestamp) await welcome.onMemberBoost(newMember) })
client.on('error', (error) => console.error('[DISCORD]', error.message))
client.login(TOKEN).catch((error) => { console.error('[GİRİŞ]', error.message); process.exit(1) })

const { PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js')
const { loadStore, saveStore, logTo } = require('./util')

const TICKET_TYPES = {
  ticket_genel: { word: 'destek', label: 'Genel Destek' },
  ticket_partner: { word: 'ortaklik', label: 'İş Birliği' },
  ticket_clan: { word: 'klan', label: 'Klan Başvurusu' }
}

function sanitizeName (str) {
  return String(str).toLowerCase()
    .replace(/[/\\@#:&?<>|"]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
}

function getTicketSettings (guildId) {
  return loadStore().generalTicketSettings?.[guildId] || null
}

function saveTicketSettings (guildId, settings) {
  const store = loadStore()
  store.generalTicketSettings = store.generalTicketSettings || {}
  store.generalTicketSettings[guildId] = settings
  saveStore(store)
}

async function getTicketResources (guild) {
  const settings = getTicketSettings(guild.id)
  if (!settings?.categoryId || !settings?.staffRoleId) throw new Error('Önce `/ticket-ayarla` ile mevcut ticket kategorisini ve ekip rolünü seç.')
  const [category, staffRole] = await Promise.all([
    guild.channels.fetch(settings.categoryId).catch(() => null),
    guild.roles.fetch(settings.staffRoleId).catch(() => null)
  ])
  if (!category || category.type !== ChannelType.GuildCategory) throw new Error('Ayarlanan destek kategorisi artık geçerli değil.')
  if (!staffRole) throw new Error('Ayarlanan destek ekip rolü artık bulunmuyor.')
  return { category, staffRole }
}

function buildGeneralTicketOverwrites (guildId, userId, staffRoleId) {
  return [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }
  ]
}

async function sendTicketPanel (interaction) {
  const channel = interaction.options.getChannel('kanal') || interaction.channel
  if (!channel?.isTextBased()) throw new Error('Ticket paneli için metin kanalı seçmelisin.')
  await getTicketResources(interaction.guild)
  const embed = new EmbedBuilder()
    .setColor(0x3e83b8)
    .setTitle('Monarch Destek')
    .setDescription('Yardım, iş birliği veya klan başvurusu için uygun seçeneği kullanarak sana özel destek ticketı açabilirsin.')
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_genel').setLabel('Genel Destek').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_partner').setLabel('İş Birliği').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_clan').setLabel('Klan Başvurusu').setStyle(ButtonStyle.Secondary)
  )
  await channel.send({ embeds: [embed], components: [row] })
  await interaction.reply({ content: `Ticket paneli ${channel} kanalına gönderildi.`, ephemeral: true })
}

async function openTicket (interaction) {
  const type = TICKET_TYPES[interaction.customId] || TICKET_TYPES.ticket_genel
  const user = interaction.user
  const guild = interaction.guild
  await interaction.deferReply({ ephemeral: true })

  const existing = guild.channels.cache.find((channel) => channel.topic === `ticket:${user.id}`)
  if (existing) return interaction.editReply({ content: `Zaten açık bir destek ticketın var: ${existing}` })

  const { category, staffRole } = await getTicketResources(guild)
  const channel = await guild.channels.create({
    name: `destek-${type.word}-${sanitizeName(user.username) || 'kullanici'}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `ticket:${user.id}`,
    permissionOverwrites: buildGeneralTicketOverwrites(guild.id, user.id, staffRole.id)
  })

  const embed = new EmbedBuilder()
    .setColor(0x3e83b8)
    .setTitle(type.label)
    .setDescription(`**Açan:** ${user}\n\nMonarch ekibi mümkün olan en kısa sürede bu ticket üzerinden dönüş yapacaktır.`)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Ticketı kapat').setStyle(ButtonStyle.Danger)
  )
  await channel.send({ content: `${user}`, embeds: [embed], components: [row] })
  return interaction.editReply({ content: `Ticketın oluşturuldu: ${channel}` })
}

async function closeTicket (interaction) {
  const channel = interaction.channel
  if (!channel?.topic?.startsWith('ticket:')) return interaction.reply({ content: 'Bu komut yalnızca genel destek ticketlarında kullanılabilir.', ephemeral: true })
  const settings = getTicketSettings(interaction.guild.id)
  const isStaff = interaction.member.roles.cache.has(settings?.staffRoleId) || interaction.member.id === interaction.guild.ownerId
  const isOwner = channel.topic === `ticket:${interaction.user.id}`
  if (!isStaff && !isOwner) return interaction.reply({ content: 'Bu ticketı kapatmaya yetkin yok.', ephemeral: true })
  await interaction.reply('Ticket 10 saniye içinde kapatılacak.')
  await logTo(interaction.guild, `Destek ticketı \`${channel.name}\`, \`${interaction.user.tag}\` tarafından kapatıldı.`)
  setTimeout(() => channel.delete('Monarch destek ticketı kapandı').catch(() => null), 10_000)
}

module.exports = { sendTicketPanel, openTicket, closeTicket, getTicketSettings, saveTicketSettings, getTicketResources, buildGeneralTicketOverwrites }

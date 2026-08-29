const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js')
const { createClient } = require('@supabase/supabase-js')
const { loadStore, saveStore } = require('./util')
const { formatOrderItems, normalizeDiscordUsername, normalizeOrderCode, sanitizeChannelName } = require('./order-utils')

const STAFF_TICKET_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
PermissionFlagsBits.SendMessages,
PermissionFlagsBits.ReadMessageHistory,
PermissionFlagsBits.ManageMessages
]

function getOrderSettings (guildId) {
  const store = loadStore()
  store.orderSettings = store.orderSettings || {}
  return store.orderSettings[guildId] || null
}

function saveOrderSettings (guildId, settings) {
  const store = loadStore()
  store.orderSettings = store.orderSettings || {}
  store.orderSettings[guildId] = settings
  saveStore(store)
}

function configuredForOrders (settings) {
  return Boolean(settings?.purchaseChannelId && settings?.ticketCategoryId && settings?.staffRoleId && settings?.voiceChannelId)
}

async function findExactGuildMember (guild, requestedUsername) {
  const username = normalizeDiscordUsername(requestedUsername)
  if (!username) return null
    const candidates = await guild.members.fetch({ query: username, limit: 10 }).catch(() => null)
    if (!candidates) return null
      const exact = candidates.filter((member) => normalizeDiscordUsername(member.user.username) === username)
      return exact.size === 1 ? exact.first() : null
}

async function resolveOrderResources (guild, settings) {
  const [purchaseChannel, category, staffRole, voiceChannel] = await Promise.all([
    guild.channels.fetch(settings.purchaseChannelId).catch(() => null),
                                                                                 guild.channels.fetch(settings.ticketCategoryId).catch(() => null),
                                                                                 guild.roles.fetch(settings.staffRoleId).catch(() => null),
                                                                                 guild.channels.fetch(settings.voiceChannelId).catch(() => null)
  ])

  if (!purchaseChannel?.isTextBased()) throw new Error('Ayarlanan satın alım kanalı artık geçerli bir metin kanalı değil.')
    if (!category || category.type !== ChannelType.GuildCategory) throw new Error('Ayarlanan ticket kategorisi artık geçerli değil.')
      if (!staffRole) throw new Error('Ayarlanan ekip rolü artık sunucuda bulunmuyor.')
        if (!voiceChannel || !voiceChannel.isVoiceBased()) throw new Error('Ayarlanan görüşme kanalı artık geçerli bir ses kanalı değil.')
          return { purchaseChannel, category, staffRole, voiceChannel }
}

function orderTopic (order) {
  return `monarch-order:${order.id};member:${order.discord_user_id || 'pending'};code:${order.order_code}`
}

function orderMarker (order) {
  return `Talep ID: ${order.id}`
}

function findCachedOrderTicket (guild, order) {
  return guild.channels.cache.find((channel) => channel.topic?.startsWith(`monarch-order:${order.id};`)) || null
}

function buildPrivateTicketOverwrites (guildId, memberId, staffRoleId) {
  return [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: memberId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: staffRoleId, allow: STAFF_TICKET_PERMISSIONS }
  ]
}

function findDemandRole (guild) {
  const role = guild.roles.cache.find((candidate) => candidate.name === 'Talep' && candidate.id !== guild.id)
  if (!role) throw new Error('Siparişleri işlemeye başlamadan önce sunucuda mevcut bir `Talep` rolü oluşturmalısın.')
    if (role.managed) throw new Error('`Talep` rolü başka bir uygulama tarafından yönetiliyor; bot bu rolü veremez.')
      return role
}

async function assignDemandRole (guild, member, demandRole) {
  if (member.roles.cache.has(demandRole.id)) return false

    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null)
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error('Botun `Rolleri Yönet` izni olmadan `Talep` rolü verilemez.')
    }
    if (demandRole.position >= botMember.roles.highest.position) {
      throw new Error('Bot rolü, `Talep` rolünün üzerinde olmalı.')
    }

    await member.roles.add(demandRole, 'Monarch Store: doğrulanmış sipariş talebi')
    return true
}

async function ensureOrderTicket (guild, member, order, resources) {
  let channel = findCachedOrderTicket(guild, order)
  if (!channel && order.ticket_channel_id) channel = await guild.channels.fetch(order.ticket_channel_id).catch(() => null)

    if (!channel) {
      channel = await guild.channels.create({
        name: `siparis-${order.order_code.toLowerCase()}-${sanitizeChannelName(member.user.username)}`,
                                            type: ChannelType.GuildText,
                                            parent: resources.category.id,
                                            topic: orderTopic({ ...order, discord_user_id: member.id }),
                                            permissionOverwrites: buildPrivateTicketOverwrites(guild.id, member.id, resources.staffRole.id)
      })
    }

    const recentMessages = await channel.messages.fetch({ limit: 20 }).catch(() => null)
    const alreadyIntroduced = recentMessages?.some((message) => message.embeds.some((embed) => embed.footer?.text === orderMarker(order)))
    if (!alreadyIntroduced) {
      const embed = new EmbedBuilder()
      .setColor(0x3e83b8)
      .setTitle(`Monarch sipariş talebi · ${order.order_code}`)
      .setDescription('Bu alan yalnızca sen ve Monarch ekibi tarafından görülebilir. Ödeme bilgisi istemeyiz; yetkili uygun olduğunda burada yazacaktır.')
      .addFields(
        { name: 'Ürünler', value: formatOrderItems(order.items) },
                 { name: 'Talep toplamı', value: `${order.total_tl} TL`, inline: true },
                 { name: 'Durum', value: 'Üyelik doğrulandı', inline: true }
      )
      .setFooter({ text: orderMarker(order) })
      .setTimestamp()
      await channel.send({ content: `${member}`, embeds: [embed] })
    }
    return channel
}

async function findPurchaseMessage (purchaseChannel, order) {
  if (!order.purchase_message_id) {
    const messages = await purchaseChannel.messages.fetch({ limit: 100 }).catch(() => null)
    return messages?.find((message) => message.embeds.some((embed) => embed.footer?.text === orderMarker(order))) || null
  }
  return purchaseChannel.messages.fetch(order.purchase_message_id).catch(() => null)
}

function buildPurchaseEmbed (member, order, ticket) {
  return new EmbedBuilder()
  .setColor(0x46a66a)
  .setTitle(`Doğrulanmış sipariş · ${order.order_code}`)
  .setDescription('Üyelik eşleşti. Ekip, talebi uygun olduğunda `/siraya-al` komutuyla sıraya ekleyebilir.')
  .addFields(
    { name: 'Discord üyesi', value: `${member.user.tag} (${member.id})` },
             { name: 'Ürünler', value: formatOrderItems(order.items) },
             { name: 'Toplam', value: `${order.total_tl} TL`, inline: true },
             { name: 'Özel ticket', value: `${ticket}`, inline: true },
             { name: 'Durum', value: 'Doğrulandı', inline: true }
  )
  .setFooter({ text: orderMarker(order) })
  .setTimestamp()
}

function createOrderQueue ({ supabaseUrl, serviceRoleKey, pollIntervalMs, supabaseClient, logger = console }) {
  if (!supabaseClient && (!supabaseUrl || !serviceRoleKey)) throw new Error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY zorunludur.')
    const supabase = supabaseClient || createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    let busy = false

    async function releaseClaim (requestId) {
      const { error } = await supabase.from('order_requests')
      .update({ status: 'pending_validation', processing_started_at: null })
      .eq('id', requestId)
      .eq('status', 'processing')
      if (error) throw error
    }

    async function removeInvalidRequest (request) {
      const { error } = await supabase.from('order_requests').delete().eq('id', request.id).eq('status', 'processing')
      if (error) throw error
    }

    async function rememberValidatedOrder (request, member, ticket) {
      const { data, error } = await supabase.from('order_requests')
      .update({
        status: 'validated',
        discord_user_id: member.id,
        ticket_channel_id: ticket.id,
        processing_started_at: null,
        validated_at: new Date().toISOString()
      })
      .eq('id', request.id)
      .eq('status', 'processing')
      .select('*')
      .maybeSingle()
      if (error) throw error
        if (!data) throw new Error('Talep başka bir süreç tarafından güncellendi.')
          return data
    }

    async function publishValidationCard (purchaseChannel, member, order, ticket) {
      let message = await findPurchaseMessage(purchaseChannel, order)
      if (!message) message = await purchaseChannel.send({ embeds: [buildPurchaseEmbed(member, order, ticket)] })
        const { error } = await supabase.from('order_requests')
        .update({ purchase_message_id: message.id })
        .eq('id', order.id)
        .eq('status', 'validated')
        if (error) throw error
          return message
    }

    async function claimPendingRequests () {
      const { data, error } = await supabase.rpc('monarch_claim_pending_order_requests', { p_limit: 10 })
      if (error) throw error
        return data || []
    }

    async function recoverStalledRequests () {
      const { error } = await supabase.rpc('monarch_requeue_stalled_order_requests')
      if (error) throw error
    }

    async function publishValidatedOrders (guild, resources) {
      const { data: validatedOrders, error } = await supabase.from('order_requests')
      .select('*')
      .eq('status', 'validated')
      .is('purchase_message_id', null)
      .order('validated_at', { ascending: true })
      .limit(20)
      if (error) throw error

        for (const order of validatedOrders || []) {
          try {
            const [member, ticket] = await Promise.all([
              guild.members.fetch(order.discord_user_id).catch(() => null),
                                                       guild.channels.fetch(order.ticket_channel_id).catch(() => null)
            ])
            if (!member || !ticket?.isTextBased()) {
              logger.error('[SİPARİŞ] Doğrulanmış talep için üye veya ticket bulunamadı:', order.order_code)
              continue
            }
            await publishValidationCard(resources.purchaseChannel, member, order, ticket)
          } catch (error) {
            logger.error('[SİPARİŞ] Satın alım bildirimi gönderilemedi:', order.order_code, error.message)
          }
        }
    }

    async function processGuild (guild) {
      const settings = getOrderSettings(guild.id)
      if (!configuredForOrders(settings)) return
        const resources = await resolveOrderResources(guild, settings)
        await recoverStalledRequests()
        const requests = await claimPendingRequests()

        for (const request of requests) {
          try {
            const member = await findExactGuildMember(guild, request.discord_username)
            if (!member) {
              await removeInvalidRequest(request)
              continue
            }
            const demandRole = findDemandRole(guild)
            await assignDemandRole(guild, member, demandRole)
            const ticket = await ensureOrderTicket(guild, member, request, resources)
            const validated = await rememberValidatedOrder(request, member, ticket)
            await publishValidationCard(resources.purchaseChannel, member, validated, ticket)
          } catch (error) {
            logger.error('[SİPARİŞ] Talep işlenemedi:', request.order_code, error.message)
            await releaseClaim(request.id).catch((releaseError) => logger.error('[SİPARİŞ] Talep kilidi bırakılamadı:', releaseError.message))
          }
        }
        await publishValidatedOrders(guild, resources)
    }

    async function tick (client, targetGuildId) {
      if (busy) return
        busy = true
        try {
          const guild = client.guilds.cache.get(targetGuildId)
          if (!guild) throw new Error('GUILD_ID ile belirtilen Discord sunucusu botun erişiminde değil.')
            await processGuild(guild)
        } catch (error) {
          logger.error('[SİPARİŞ] Kuyruk işleme hatası:', error.message)
        } finally {
          busy = false
        }
    }

    function start (client, targetGuildId) {
      tick(client, targetGuildId)
      return setInterval(() => tick(client, targetGuildId), pollIntervalMs)
    }

    async function queueOrder (interaction, orderCode) {
      const settings = getOrderSettings(interaction.guild.id)
      if (!configuredForOrders(settings)) throw new Error('Önce `/siparis-kur` ile mevcut satın alım kanalı, ticket kategorisi, ekip rolü ve görüşme kanalını seç.')
        const { data, error } = await supabase.rpc('monarch_enqueue_validated_order', { p_order_code: normalizeOrderCode(orderCode), p_handled_by: interaction.user.id })
        if (error) throw error
          const order = Array.isArray(data) ? data[0] : data
          if (!order) throw new Error('Sipariş bulunamadı veya henüz üyelik doğrulamasını geçmedi.')
            const ticket = await interaction.guild.channels.fetch(order.ticket_channel_id).catch(() => null)
            if (ticket?.isTextBased()) await ticket.send(`Yetkili ${interaction.user} talebini sıraya aldı. Görüşme için uygun olduğunda seni ses kanalına davet edeceğiz.`)
              return order
    }

    async function takeOrder (interaction, orderCode) {
      const normalized = normalizeOrderCode(orderCode)
      const { data, error } = await supabase.from('order_requests')
      .update({ status: 'in_progress', handled_by: interaction.user.id })
      .eq('order_code', normalized)
      .eq('status', 'queued')
      .select('*')
      .maybeSingle()
      if (error) throw error
        if (!data) throw new Error('Sipariş bulunamadı veya sırada değil.')
          const ticket = await interaction.guild.channels.fetch(data.ticket_channel_id).catch(() => null)
          if (ticket?.isTextBased()) await ticket.send(`Yetkili ${interaction.user} talebini işleme aldı.`)
            return data
    }

    async function listQueue () {
      const { data, error } = await supabase.from('order_requests')
      .select('*')
      .in('status', ['queued', 'in_progress'])
      .order('queue_position', { ascending: true })
      if (error) throw error
        return data || []
    }

    async function getOpenOrder (orderCode) {
      const { data, error } = await supabase.from('order_requests')
      .select('*')
      .eq('order_code', normalizeOrderCode(orderCode))
      .in('status', ['queued', 'in_progress'])
      .maybeSingle()
      if (error) throw error
        return data
    }

    async function closeOrder (interaction, orderCode) {
      const normalized = normalizeOrderCode(orderCode)
      const { data: order, error: lookupError } = await supabase.from('order_requests').select('*').eq('order_code', normalized).maybeSingle()
      if (lookupError || !order) throw new Error('Sipariş bulunamadı.')
        if (!['validated', 'queued', 'in_progress'].includes(order.status)) throw new Error('Bu sipariş zaten kapalı veya doğrulama bekliyor.')
          const { data: closed, error } = await supabase.from('order_requests')
          .update({ status: 'closed', closed_at: new Date().toISOString(), handled_by: interaction.user.id })
          .eq('id', order.id)
          .eq('status', order.status)
          .select('*')
          .maybeSingle()
          if (error) throw error
            if (!closed) throw new Error('Sipariş durumu başka bir işlem tarafından değiştirildi.')

              const ticket = await interaction.guild.channels.fetch(order.ticket_channel_id).catch(() => null)
              if (ticket?.isTextBased()) {
                await ticket.send(`Bu sipariş ${interaction.user} tarafından kapatıldı. Yardıma ihtiyacın olursa yeni bir talep oluşturabilirsin.`).catch(() => null)
                if (order.discord_user_id) await ticket.permissionOverwrites.edit(order.discord_user_id, { SendMessages: false, AddReactions: false }).catch(() => null)
                  await ticket.setName(`kapali-${ticket.name}`.slice(0, 100), 'Monarch siparişi kapandı').catch(() => null)
              }
              return closed
    }

    return { start, tick, queueOrder, takeOrder, listQueue, getOpenOrder, closeOrder, getOrderSettings, saveOrderSettings, configuredForOrders, resolveOrderResources }
}

module.exports = { createOrderQueue, getOrderSettings, saveOrderSettings, configuredForOrders, findExactGuildMember, resolveOrderResources, buildPrivateTicketOverwrites, findDemandRole, assignDemandRole }

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
import { PRODUCT_CATALOG, formatCart, getCartTotalTl, isDiscordUsername, normalizeDiscordUsername, summarizeCart } from './order-queue-core.js'
import { COMMUNITY_STATS_REFRESH_MS, communityUpdatedLabel, isFreshCommunityStat } from './community-stats-ui-core.js'

const SUPABASE_URL = 'https://aipnaodheezawsezrjpz.supabase.co'
const SUPABASE_ANON = 'sb_publishable_PzkqDMBy4zdBC7wmgjjN4Q_phBvtzN2'

let supabaseInstance = null
function getSupabase () {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    })
  }
  return supabaseInstance
}

let visitorPromise
async function ensureVisitor (forceNew = false) {
  const supabase = getSupabase()
  if (forceNew) {
    visitorPromise = null
    await supabase.auth.signOut().catch(() => null)
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw new Error('Sipariş oturumu başlatılamadı.')
    return data.user
  }
  if (visitorPromise) return visitorPromise
  visitorPromise = (async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user) return sessionData.session.user
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw new Error('Sipariş oturumu başlatılamadı.')
    return data.user
  })()
  try {
    return await visitorPromise
  } catch (error) {
    visitorPromise = null
    throw error
  }
}

function escapeHtml (value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}

export function bindCommunityStats ({ countElement, statusElement }) {
  if (!countElement || !statusElement) return () => {}
  const renderUnavailable = () => {
    countElement.textContent = '—'
    statusElement.textContent = 'Canlı durum bekleniyor'
    statusElement.dataset.state = 'waiting'
  }
  const refresh = async () => {
    try {
      const supabase = getSupabase()
      const { data, error } = await supabase.from('monarch_community_stats').select('active_member_count, updated_at').eq('source', 'discord').maybeSingle()
      if (error || !isFreshCommunityStat(data)) return renderUnavailable()
      countElement.textContent = String(data.active_member_count)
      statusElement.textContent = communityUpdatedLabel(data.updated_at)
      statusElement.dataset.state = 'live'
    } catch {
      renderUnavailable()
    }
  }
  renderUnavailable()
  // Refresh stats after initial idle time to prioritize critical rendering
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => refresh())
  } else {
    setTimeout(refresh, 200)
  }
  const interval = window.setInterval(refresh, COMMUNITY_STATS_REFRESH_MS)
  const stop = () => window.clearInterval(interval)
  window.addEventListener('pagehide', stop, { once: true })
  return stop
}

function renderCart (cart, summary, submitButton) {
  const items = formatCart(cart)
  if (!items.length) {
    summary.innerHTML = '<p class="cart-empty-msg" style="text-align: center; color: var(--muted); padding: 14px 0; margin: 0;">Sepetinizde ürün bulunmuyor.</p>'
    submitButton.disabled = true
    return
  }

  summary.innerHTML = `
    <ul class="cart-items-list">
      ${items.map((item) => `
        <li class="cart-item-row" data-sku="${item.sku}">
          <div class="cart-item-info">
            <b class="cart-item-title">${escapeHtml(item.name)}</b>
            <span class="cart-item-unit-price">${item.unitPriceTl} TL / adet</span>
          </div>
          <div class="cart-item-actions">
            <div class="cart-qty-box">
              <button type="button" class="cart-btn-qty" data-action="dec" data-sku="${item.sku}" title="Miktarı azalt">-</button>
              <span class="cart-qty-number">${item.quantity}</span>
              <button type="button" class="cart-btn-qty" data-action="inc" data-sku="${item.sku}" title="Miktarı arttır">+</button>
            </div>
            <strong class="cart-item-total">${item.lineTotalTl} TL</strong>
            <button type="button" class="cart-btn-remove" data-action="remove" data-sku="${item.sku}" title="Ürünü sepetten sil">Kaldır</button>
          </div>
        </li>
      `).join('')}
    </ul>
    <div class="order-total-bar">
      <button type="button" class="cart-btn-clear" data-action="clear" title="Tüm sepeti temizle">Sepeti Temizle</button>
      <div class="order-total-sum">
        <span>Talep toplamı:</span>
        <b>${getCartTotalTl(items)} TL</b>
      </div>
    </div>
  `
  submitButton.disabled = false
}

export function bindOrderUI ({ cartButton, cartCount, dialog, closeButton, form, discordInput, summary, submitButton, notify }) {
  const cart = []
  const update = () => {
    const items = summarizeCart(cart)
    cart.splice(0, cart.length, ...items)
    cartCount.textContent = String(items.reduce((count, item) => count + item.quantity, 0))
    renderCart(cart, summary, submitButton)
  }
  const open = () => {
    update()
    if (!cart.length) return notify('Sepetin boş', 'Önce bir ürünü sepete ekle.')
    dialog.showModal()
    window.setTimeout(() => discordInput.focus(), 30)
  }

  summary.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    const sku = btn.dataset.sku

    if (action === 'inc') {
      const item = cart.find((i) => i.sku === sku)
      if (item) item.quantity = Math.min(10, item.quantity + 1)
      update()
    } else if (action === 'dec') {
      const item = cart.find((i) => i.sku === sku)
      if (item) {
        item.quantity -= 1
        if (item.quantity <= 0) {
          const idx = cart.findIndex((i) => i.sku === sku)
          if (idx !== -1) cart.splice(idx, 1)
        }
      }
      update()
    } else if (action === 'remove') {
      const idx = cart.findIndex((i) => i.sku === sku)
      if (idx !== -1) {
        cart.splice(idx, 1)
        update()
        if (PRODUCT_CATALOG[sku]) notify('Ürün Çıkarıldı', `${PRODUCT_CATALOG[sku].name} sepetinizden silindi.`)
      }
    } else if (action === 'clear') {
      cart.splice(0, cart.length)
      update()
      notify('Sepet Temizlendi', 'Sepetinizdeki tüm ürünler boşaltıldı.')
    }
  })

  document.querySelectorAll('[data-add-to-cart]').forEach((button) => {
    button.addEventListener('click', () => {
      const sku = button.dataset.addToCart
      if (!PRODUCT_CATALOG[sku]) return
      const existing = cart.find((item) => item.sku === sku)
      if (existing) existing.quantity = Math.min(10, existing.quantity + 1)
      else cart.push({ sku, quantity: 1 })
      update()
      notify('Sepete eklendi', `${PRODUCT_CATALOG[sku].name} talep listene eklendi.`)
    })
  })
  cartButton.addEventListener('click', open)
  closeButton.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const discordUsername = normalizeDiscordUsername(discordInput.value)
    if (!isDiscordUsername(discordUsername)) {
      notify('Discord kullanıcı adı gerekli', 'Sunucudaki kullanıcı adını @ olmadan, doğru şekilde yaz.')
      discordInput.focus()
      return
    }
    update()
    if (!cart.length) return

    // 5 Dakika Bekleme Süresi Kontrolü
    const lastOrderTime = Number(localStorage.getItem('monarch_last_order_time') || 0)
    const cooldownMs = 5 * 60 * 1000 // 5 dakika
    const elapsed = Date.now() - lastOrderTime
    if (elapsed < cooldownMs) {
      const remainSec = Math.ceil((cooldownMs - elapsed) / 1000)
      const min = Math.floor(remainSec / 60)
      const sec = remainSec % 60
      notify('Bekleme Süresi (5 Dk)', `Yeni bir talep açmak için lütfen ${min} dk ${sec} sn bekleyin.`)
      return
    }

    submitButton.disabled = true
    submitButton.textContent = 'Talep gönderiliyor…'
    try {
      const supabase = getSupabase()
      const user = await ensureVisitor(true)
      const items = summarizeCart(cart)
      const { data, error } = await supabase.from('order_requests').insert({
        visitor_id: user.id,
        discord_username: discordUsername,
        items,
        total_tl: getCartTotalTl(items),
        status: 'pending_validation'
      }).select('order_code').single()
      if (error) {
        if (error.code === '23505') throw new Error('Zaten işlenmekte olan bir talebin var. Discord ticket kanalını kontrol et.')
        throw new Error('Talep şu an gönderilemedi. Birkaç dakika sonra tekrar dene.')
      }
      localStorage.setItem('monarch_last_order_time', Date.now().toString())
      cart.splice(0, cart.length)
      update()
      dialog.close()
      form.reset()
      notify('İşlemin sıraya alındı', `Talep kodun ${data.order_code}. Discord sunucu üyeliğin doğrulanınca sana özel ticket açılacak.`)
    } catch (error) {
      notify('Talep gönderilemedi', error?.message || 'Beklenmeyen bir sorun oluştu.')
    } finally {
      submitButton.textContent = 'Talebi sıraya al'
      submitButton.disabled = false
    }
  })
  update()
}

export async function fetchUserSupportTickets () {
  try {
    const supabase = getSupabase()
    const { data: auth } = await supabase.auth.getSession()
    const sessRaw = localStorage.getItem('monarch_session_v1')
    const localSess = sessRaw ? JSON.parse(sessRaw) : null
    const visitorId = auth?.session?.user?.id

    const { data, error } = await supabase.from('order_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error || !data) return []

    // Filter support tickets that match current user (visitor_id, discord_username, or username in messages)
    return data.filter((row) => {
      const isSupport = Array.isArray(row.items) && (row.items[0]?.type === 'support' || row.items[0]?.sku === 'support_ticket')
      if (!isSupport) return false

      if (visitorId && row.visitor_id === visitorId) return true
      if (localSess?.discordUsername && row.discord_username?.toLowerCase() === localSess.discordUsername.toLowerCase()) return true
      if (localSess?.username && row.items[0]?.site_username?.toLowerCase() === localSess.username.toLowerCase()) return true
      return false
    })
  } catch (err) {
    console.error('Destek talepleri getirilemedi:', err)
    return []
  }
}

export async function sendUserTicketReply (orderCode, messageText, authorName = 'Kullanıcı') {
  const supabase = getSupabase()
  const cleanCode = (orderCode || '').trim().toUpperCase()

  const cacheKey = `monarch_ticket_thread_${cleanCode}`
  const cachedMessages = JSON.parse(localStorage.getItem(cacheKey) || '[]')
  const newMsg = {
    sender: 'user',
    author: authorName,
    text: messageText.trim(),
    createdAt: new Date().toISOString()
  }
  cachedMessages.push(newMsg)
  localStorage.setItem(cacheKey, JSON.stringify(cachedMessages))

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('monarch_append_ticket_message', {
      p_order_code: cleanCode,
      p_sender: 'user',
      p_author: authorName,
      p_text: messageText.trim()
    })

    if (!rpcError && rpcData?.success && rpcData?.order) {
      return rpcData.order
    }
  } catch (rpcErr) {
    console.warn('RPC append message fallback to local thread:', rpcErr)
  }

  try {
    const { data: ticket } = await supabase.from('order_requests')
      .select('*')
      .eq('order_code', cleanCode)
      .single()

    if (ticket) {
      const items = Array.isArray(ticket.items) ? [...ticket.items] : [{}]
      items[0].messages = Array.isArray(items[0].messages) ? [...items[0].messages] : []
      items[0].messages.push(newMsg)

      const { data: updated } = await supabase.from('order_requests')
        .update({ items })
        .eq('order_code', cleanCode)
        .select('*')
        .single()

      if (updated) return updated
    }
  } catch (err) {
    console.warn('Supabase order update fallback:', err)
  }

  return {
    order_code: cleanCode,
    status: 'validated',
    created_at: new Date().toISOString(),
    items: [{ messages: cachedMessages }]
  }
}

export async function closeUserTicket (orderCode) {
  const supabase = getSupabase()
  const cleanCode = (orderCode || '').trim().toUpperCase()

  try {
    await supabase.from('order_requests')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('order_code', cleanCode)
  } catch (err) {
    console.warn('Close ticket error:', err)
  }

  // Update cached status
  const cachedTickets = JSON.parse(localStorage.getItem('monarch_local_tickets') || '[]')
  const found = cachedTickets.find(t => (t.order_code || '').toUpperCase() === cleanCode)
  if (found) {
    found.status = 'closed'
    localStorage.setItem('monarch_local_tickets', JSON.stringify(cachedTickets))
  }

  return true
}

export function bindSupportUI ({ button, dialog, closeButton, form, discordInput, subjectInput, messageInput, submitButton, notify }) {
  if (!button || !dialog) return

  let activeChatTicket = null
  const tabNew = document.querySelector('#supportTabNew')
  const tabMyTickets = document.querySelector('#supportTabMyTickets')
  const breadcrumbSub = document.querySelector('#supportBreadcrumbSub')
  const viewNew = document.querySelector('#supportViewNew')
  const viewList = document.querySelector('#supportViewList')
  const viewChat = document.querySelector('#supportViewChat')
  const ticketsListEl = document.querySelector('#supportTicketsList')
  const chatBackBtn = document.querySelector('#supportChatBackBtn')
  const chatMessagesEl = document.querySelector('#supportChatMessages')
  const chatReplyForm = document.querySelector('#supportChatReplyForm')
  const chatReplyInput = document.querySelector('#supportChatReplyInput')
  const chatReplySubmit = document.querySelector('#supportChatReplySubmit')
  const chatCloseTicketBtn = document.querySelector('#supportChatCloseTicketBtn')
  const chatTitleEl = document.querySelector('#supportChatTitle')
  const chatStatusEl = document.querySelector('#supportChatStatus')

  const showTab = (tabName) => {
    if (viewNew) viewNew.style.display = tabName === 'new' ? 'block' : 'none'
    if (viewList) viewList.style.display = tabName === 'list' ? 'block' : 'none'
    if (viewChat) viewChat.style.display = tabName === 'chat' ? 'block' : 'none'

    if (tabNew) tabNew.classList.toggle('active', tabName === 'new')
    if (tabMyTickets) tabMyTickets.classList.toggle('active', tabName === 'list' || tabName === 'chat')

    if (breadcrumbSub) {
      if (tabName === 'new') breadcrumbSub.textContent = 'Yeni Talep'
      else if (tabName === 'list') breadcrumbSub.textContent = 'Taleplerim'
    }

    if (tabName === 'list') {
      loadAndRenderUserTickets()
    }
  }

  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'Az önce'
    const diff = Date.now() - new Date(isoString).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Az önce'
    if (mins < 60) return `${mins} dakika önce`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} saat önce`
    const days = Math.floor(hours / 24)
    return `${days} gün önce`
  }

  const loadAndRenderUserTickets = async () => {
    if (!ticketsListEl) return
    ticketsListEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">Talepleriniz yükleniyor…</div>'

    const tickets = await fetchUserSupportTickets()
    if (!tickets || tickets.length === 0) {
      ticketsListEl.innerHTML = `
        <div style="text-align: center; padding: 50px 20px; background: rgba(7, 13, 20, 0.6); border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 32px; margin-bottom: 12px; color: var(--text-muted);"></div>
          <p style="margin-bottom: 16px; color: var(--text-muted); font-size: 14px;">Henüz açılmış bir destek talebiniz bulunmuyor.</p>
          <button type="button" class="account-submit" id="supportEmptyNewBtn" style="display: inline-block; width: auto; padding: 0 24px;">Yeni Destek Talebi Aç</button>
        </div>
      `
      document.querySelector('#supportEmptyNewBtn')?.addEventListener('click', () => showTab('new'))
      return
    }

    const sessRaw = localStorage.getItem('monarch_session_v1')
    const localSess = sessRaw ? JSON.parse(sessRaw) : null
    const userAvatar = localSess?.avatarUrl || 'images/default-avatar.jpg'
    const userName = localSess?.username || 'Kullanıcı'

    ticketsListEl.innerHTML = `
      <div style="overflow-x: auto; background: #070d14; border: 1px solid var(--border); border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border); background: rgba(255, 255, 255, 0.02); color: var(--text-muted); font-family: var(--font-mono); font-size: 11px; text-transform: uppercase;">
              <th style="padding: 14px 16px;">Başlık / ID</th>
              <th style="padding: 14px 16px;">Kullanıcı</th>
              <th style="padding: 14px 16px;">Kategori</th>
              <th style="padding: 14px 16px;">Durum</th>
              <th style="padding: 14px 16px;">Tarih</th>
              <th style="padding: 14px 16px; text-align: right;">İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.map((t) => {
              const item = Array.isArray(t.items) ? t.items[0] : {}
              const subject = item.subject || item.title || 'Genel Destek'
              const cleanCode = (t.order_code || '').trim().toUpperCase()
              const cachedMsgs = JSON.parse(localStorage.getItem(`monarch_ticket_thread_${cleanCode}`) || '[]')
              const remoteMsgs = Array.isArray(item.messages) ? item.messages : []
              const allMsgs = [...remoteMsgs, ...cachedMsgs]
              
              const lastMsg = allMsgs[allMsgs.length - 1]
              const hasAdminReply = allMsgs.some(m => m.sender === 'admin')
              const isUserLast = lastMsg && lastMsg.sender === 'user' && allMsgs.length > 1
              const dateStr = new Date(t.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              const relTime = formatRelativeTime(t.created_at)

              let statusBadge = `<span class="badge" style="background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11px;">Açık</span>`
              if (hasAdminReply && !isUserLast) {
                statusBadge = `<span class="badge" style="background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11px;">Yanıtlandı</span>`
              } else if (isUserLast) {
                statusBadge = `<span class="badge" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11px;">Kullanıcı Yanıtı</span>`
              }
              if (t.status === 'closed' || t.status === 'cancelled') {
                statusBadge = `<span class="badge" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11px;">Kapalı</span>`
              }

              return `
                <tr class="support-ticket-row" data-code="${t.order_code}" style="border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; transition: background .15s;">
                  <td style="padding: 14px 16px;">
                    <div style="font-weight: 700; color: var(--text); font-size: 13.5px; margin-bottom: 2px;">${subject}</div>
                    <div style="font-family: var(--font-mono); color: #38bdf8; font-size: 11.5px;">#${t.order_code}</div>
                  </td>
                  <td style="padding: 14px 16px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <img src="${userAvatar}" alt="${userName}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border);" />
                      <div>
                        <div style="font-weight: 600; color: var(--text); font-size: 12.5px;">${userName}</div>
                        <div style="color: var(--text-muted); font-size: 11px;">@${t.discord_username || userName}</div>
                      </div>
                    </div>
                  </td>
                  <td style="padding: 14px 16px; color: var(--text-muted); font-size: 12.5px;">${item.subject || 'Genel Destek'}</td>
                  <td style="padding: 14px 16px;">${statusBadge}</td>
                  <td style="padding: 14px 16px;">
                    <div style="color: var(--text); font-size: 12px;">${dateStr}</div>
                    <div style="color: var(--text-muted); font-size: 10.5px;">${relTime}</div>
                  </td>
                  <td style="padding: 14px 16px; text-align: right;">
                    <button type="button" class="btn-support-view" data-code="${t.order_code}" style="background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3); color: #38bdf8; padding: 6px 14px; border-radius: 4px; font: 700 11.5px var(--font-mono); cursor: pointer;">Görüntüle</button>
                  </td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    `

    ticketsListEl.querySelectorAll('.support-ticket-row, .btn-support-view').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const code = el.dataset.code
        const ticket = tickets.find(t => t.order_code === code)
        if (ticket) openChatView(ticket)
      })
    })
  }

  const openChatView = (ticket) => {
    activeChatTicket = ticket
    const item = Array.isArray(ticket.items) ? ticket.items[0] : {}
    const subject = item.subject || item.title || 'Genel Destek'
    const sessRaw = localStorage.getItem('monarch_session_v1')
    const localSess = sessRaw ? JSON.parse(sessRaw) : null
    const userAvatar = localSess?.avatarUrl || 'images/default-avatar.jpg'
    const userName = localSess?.username || 'Kullanıcı'

    if (breadcrumbSub) breadcrumbSub.textContent = `Talep #${ticket.order_code}`
    if (chatTitleEl) chatTitleEl.textContent = subject
    if (chatStatusEl) chatStatusEl.textContent = ticket.status === 'closed' ? 'Kapalı Talep' : 'Aktif Talep'

    if (chatCloseTicketBtn) {
      if (ticket.status === 'closed' || ticket.status === 'cancelled') {
        chatCloseTicketBtn.disabled = true
        chatCloseTicketBtn.textContent = 'Talep Kapalı'
        chatCloseTicketBtn.style.opacity = '0.5'
      } else {
        chatCloseTicketBtn.disabled = false
        chatCloseTicketBtn.textContent = 'Talebi Kapat'
        chatCloseTicketBtn.style.opacity = '1'
      }
    }

    // Left column details card elements
    const dAvatar = document.querySelector('#supportDetailUserAvatar')
    const dUsername = document.querySelector('#supportDetailUsername')
    const dDiscord = document.querySelector('#supportDetailDiscord')
    const dCategory = document.querySelector('#supportDetailCategory')
    const dStatusBadge = document.querySelector('#supportDetailStatusBadge')
    const dCode = document.querySelector('#supportDetailCode')
    const dDate = document.querySelector('#supportDetailDate')
    const dUpdated = document.querySelector('#supportDetailUpdated')

    if (dAvatar) dAvatar.src = userAvatar
    if (dUsername) dUsername.textContent = userName
    if (dDiscord) dDiscord.textContent = ticket.discord_username ? `@${ticket.discord_username}` : `@${userName}`
    if (dCategory) dCategory.textContent = item.subject || 'Genel Destek'
    if (dCode) dCode.textContent = `#${ticket.order_code}`
    if (dDate) dDate.textContent = new Date(ticket.created_at).toLocaleString('tr-TR')
    if (dUpdated) dUpdated.textContent = formatRelativeTime(ticket.created_at)

    if (dStatusBadge) {
      dStatusBadge.innerHTML = ticket.status === 'closed'
        ? '<span class="badge" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">Kapalı</span>'
        : '<span class="badge" style="background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">Açık</span>'
    }

    renderChatMessages(ticket)
    showTab('chat')
  }

  const renderChatMessages = (ticket) => {
    if (!chatMessagesEl) return
    const cleanCode = (ticket.order_code || '').trim().toUpperCase()
    const item = Array.isArray(ticket.items) ? ticket.items[0] : {}
    const remoteMsgs = Array.isArray(item.messages) ? item.messages : []
    const cachedMsgs = JSON.parse(localStorage.getItem(`monarch_ticket_thread_${cleanCode}`) || '[]')

    const sessRaw = localStorage.getItem('monarch_session_v1')
    const localSess = sessRaw ? JSON.parse(sessRaw) : null
    const userAvatar = localSess?.avatarUrl || 'images/default-avatar.jpg'
    const adminAvatar = 'images/lena-officer-avatar.jpg'

    const allMsgsMap = new Map()
    if (item.message || item.description) {
      allMsgsMap.set(`init_${ticket.created_at}`, {
        sender: 'user',
        author: ticket.discord_username ? `@${ticket.discord_username}` : 'Müşteri',
        text: item.message || item.description,
        createdAt: ticket.created_at
      })
    }
    remoteMsgs.forEach(m => allMsgsMap.set(`${m.createdAt}_${m.text}`, m))
    cachedMsgs.forEach(m => allMsgsMap.set(`${m.createdAt}_${m.text}`, m))

    const messages = Array.from(allMsgsMap.values()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    chatMessagesEl.innerHTML = messages.map((m) => {
      const isAdmin = m.sender === 'admin'
      const timeStr = formatRelativeTime(m.createdAt)
      const fullDateStr = m.createdAt ? new Date(m.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''
      const author = m.author || (isAdmin ? 'Monarch Destek Ekibi' : (localSess?.username || 'Siz'))
      const avatar = isAdmin ? adminAvatar : userAvatar

      return `
        <div style="display: flex; gap: 14px; margin-bottom: 20px; align-items: flex-start;">
          <img src="${avatar}" alt="${author}" style="width: 44px; height: 44px; border-radius: ${isAdmin ? '6px' : '50%'}; object-fit: cover; border: 2px solid ${isAdmin ? 'rgba(34,197,94,0.4)' : 'rgba(56,189,248,0.4)'}; flex-shrink: 0;" />
          <div style="flex: 1; background: ${isAdmin ? 'rgba(34,197,94,0.06)' : '#070d14'}; border: 1px solid ${isAdmin ? 'rgba(34,197,94,0.25)' : 'var(--border)'}; border-radius: 8px; padding: 14px 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="color: ${isAdmin ? '#22c55e' : '#38bdf8'}; font-size: 13.5px;">${author}</strong>
                ${isAdmin ? '<span class="badge" style="background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); font-size: 9.5px; padding: 1px 6px;">YÖNETİCİ</span>' : ''}
              </div>
              <span style="color: var(--text-muted); font-size: 11px;">${timeStr} (${fullDateStr})</span>
            </div>
            <div style="color: var(--text); font-size: 13.5px; line-height: 1.6; white-space: pre-wrap;">${m.text}</div>
          </div>
        </div>
      `
    }).join('')

    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  }

  // Hızlı Yanıt Preset Çipleri Olayları
  dialog.querySelectorAll('.quick-reply-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const presetText = chip.dataset.text
      if (!presetText || !chatReplyInput) return
      chatReplyInput.value = presetText
      chatReplyInput.focus()
    })
  })

  // Talebi Kapat Butonu Olayı
  chatCloseTicketBtn?.addEventListener('click', async () => {
    if (!activeChatTicket) return
    if (activeChatTicket.status === 'closed') {
      notify('Bilgi', 'Bu destek talebi zaten kapalı.')
      return
    }
    if (!confirm('Bu destek talebini çözüldü olarak kapatmak istediğinize emin misiniz?')) return

    try {
      chatCloseTicketBtn.disabled = true
      chatCloseTicketBtn.textContent = 'Kapatılıyor…'
      await closeUserTicket(activeChatTicket.order_code)
      activeChatTicket.status = 'closed'
      if (chatStatusEl) chatStatusEl.textContent = 'Kapalı Talep'
      const dStatusBadge = document.querySelector('#supportDetailStatusBadge')
      if (dStatusBadge) dStatusBadge.innerHTML = '<span class="badge" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 10.5px;">Kapalı</span>'
      chatCloseTicketBtn.textContent = 'Talep Kapalı'
      chatCloseTicketBtn.style.opacity = '0.5'
      notify('Talep Kapatıldı', 'Destek talebiniz başarıyla çözüldü ve kapatıldı.')
    } catch (err) {
      notify('Hata', err?.message || 'Talep kapatılamadı.')
      chatCloseTicketBtn.disabled = false
      chatCloseTicketBtn.textContent = 'Talebi Kapat'
    }
  })

  // Sekme Olayları
  tabNew?.addEventListener('click', () => showTab('new'))
  tabMyTickets?.addEventListener('click', () => showTab('list'))
  chatBackBtn?.addEventListener('click', () => showTab('list'))

  button.addEventListener('click', () => {
    // 1. Üyelik Giriş Kontrolü
    const sessRaw = localStorage.getItem('monarch_session_v1')
    const sess = sessRaw ? JSON.parse(sessRaw) : null
    if (!sess) {
      notify('Giriş Yapmalısınız', 'Destek talebi açabilmek veya mesajlarınızı görebilmek için lütfen giriş yapın veya kayıt olun.')
      document.querySelector('#accountDialog')?.showModal()
      return
    }

    if (sess?.discordUsername && discordInput && !discordInput.value) {
      discordInput.value = sess.discordUsername
    }

    showTab('new')
    dialog.showModal()
  })

  closeButton?.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })

  // Kullanıcı Yeni Destek Talebi Gönder
  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const sessRaw = localStorage.getItem('monarch_session_v1')
    const sess = sessRaw ? JSON.parse(sessRaw) : null
    if (!sess) {
      notify('Giriş Gerekli', 'Destek açabilmek için oturum açmalısınız.')
      dialog.close()
      document.querySelector('#accountDialog')?.showModal()
      return
    }

    const discordUsername = normalizeDiscordUsername(discordInput.value)
    if (!isDiscordUsername(discordUsername)) {
      notify('Discord Kullanıcı Adı Gerekli', 'Sunucudaki kullanıcı adınızı @ olmadan doğru yazın.')
      discordInput.focus()
      return
    }

    const subject = subjectInput?.value?.trim() || 'Genel Destek'
    const message = messageInput?.value?.trim()
    if (!message || message.length < 5) {
      notify('Mesaj Gerekli', 'Lütfen sorununuzu veya talebinizi en az 5 karakterle açıklayın.')
      messageInput?.focus()
      return
    }

    // 5 Dakika Cooldown
    const lastSupportTime = Number(localStorage.getItem('monarch_last_support_time') || 0)
    const cooldownMs = 5 * 60 * 1000
    const elapsed = Date.now() - lastSupportTime
    if (elapsed < cooldownMs) {
      const remainSec = Math.ceil((cooldownMs - elapsed) / 1000)
      const min = Math.floor(remainSec / 60)
      const sec = remainSec % 60
      notify('Bekleme Süresi (5 Dk)', `Yeni bir destek talebi açmak için lütfen ${min} dk ${sec} sn bekleyin.`)
      return
    }

    submitButton.disabled = true
    submitButton.textContent = 'Destek talebi açılıyor…'

    try {
      const supabase = getSupabase()
      const user = await ensureVisitor(true)

      const items = [{
        type: 'support',
        sku: 'support_ticket',
        title: `Destek: ${subject}`,
        subject,
        message,
        site_username: sess.username,
        messages: [{
          sender: 'user',
          author: sess.username,
          text: message,
          createdAt: new Date().toISOString()
        }],
        unit_price: 1,
        price_tl: 1
      }]

      const { data, error } = await supabase.from('order_requests').insert({
        visitor_id: user.id,
        discord_username: discordUsername,
        items,
        total_tl: 1,
        status: 'pending_validation'
      }).select('*').single()

      if (error) {
        throw new Error('Destek talebi iletilemedi. Lütfen birkaç dakika sonra tekrar deneyin.')
      }

      localStorage.setItem('monarch_last_support_time', Date.now().toString())
      form.reset()
      notify('Destek Talebi Oluşturuldu', `Talep kodunuz: ${data.order_code}. Talebiniz ve yanıtlaşma ekranı açılıyor.`)
      
      // Anında sohbet ekranına geç
      openChatView(data)
    } catch (err) {
      notify('İşlem Başarısız', err?.message || 'Beklenmeyen bir sorun oluştu.')
    } finally {
      submitButton.textContent = 'Destek Talebini Gönder'
      submitButton.disabled = false
    }
  })

  // Kullanıcı Destek Talebine Yanıt Gönder
  chatReplyForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!activeChatTicket || !chatReplyInput) return

    const text = chatReplyInput.value.trim()
    if (!text) return

    const sessRaw = localStorage.getItem('monarch_session_v1')
    const sess = sessRaw ? JSON.parse(sessRaw) : null
    const authorName = sess?.username || 'Kullanıcı'

    try {
      chatReplySubmit.disabled = true
      chatReplySubmit.textContent = 'Gönderiliyor…'

      const updatedTicket = await sendUserTicketReply(activeChatTicket.order_code, text, authorName)
      activeChatTicket = updatedTicket
      chatReplyInput.value = ''
      renderChatMessages(updatedTicket)
      notify('Yanıtınız İletildi', 'Mesajınız destek talebinize eklendi ve ekibe iletildi.')
    } catch (err) {
      notify('Yanıt Gönderilemedi', err.message)
    } finally {
      chatReplySubmit.disabled = false
      chatReplySubmit.textContent = 'Yanıt Gönder'
    }
  })
}

window.bindOrderUI = bindOrderUI
window.bindSupportUI = bindSupportUI
window.bindCommunityStats = bindCommunityStats
window.closeUserTicket = closeUserTicket
window.sendUserTicketReply = sendUserTicketReply


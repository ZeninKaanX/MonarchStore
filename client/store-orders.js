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
    const { data: ticket } = await supabase.from('order_requests')
      .select('*')
      .eq('order_code', cleanCode)
      .single()

    if (ticket) {
      const items = Array.isArray(ticket.items) ? [...ticket.items] : [{}]
      items[0].messages = Array.isArray(items[0].messages) ? [...items[0].messages] : []
      items[0].messages.push(newMsg)

      await supabase.from('order_requests')
        .update({ items })
        .eq('order_code', cleanCode)
    }
  } catch {}

  return {
    order_code: cleanCode,
    items: [{ messages: cachedMessages }]
  }
}

export function bindSupportUI ({ button, dialog, closeButton, form, discordInput, subjectInput, messageInput, submitButton, notify }) {
  if (!button || !dialog) return

  let activeChatTicket = null
  const tabNew = document.querySelector('#supportTabNew')
  const tabMyTickets = document.querySelector('#supportTabMyTickets')
  const viewNew = document.querySelector('#supportViewNew')
  const viewList = document.querySelector('#supportViewList')
  const viewChat = document.querySelector('#supportViewChat')
  const ticketsListEl = document.querySelector('#supportTicketsList')
  const chatBackBtn = document.querySelector('#supportChatBackBtn')
  const chatMessagesEl = document.querySelector('#supportChatMessages')
  const chatReplyForm = document.querySelector('#supportChatReplyForm')
  const chatReplyInput = document.querySelector('#supportChatReplyInput')
  const chatReplySubmit = document.querySelector('#supportChatReplySubmit')
  const chatTitleEl = document.querySelector('#supportChatTitle')
  const chatStatusEl = document.querySelector('#supportChatStatus')

  const showTab = (tabName) => {
    if (viewNew) viewNew.style.display = tabName === 'new' ? 'block' : 'none'
    if (viewList) viewList.style.display = tabName === 'list' ? 'block' : 'none'
    if (viewChat) viewChat.style.display = tabName === 'chat' ? 'block' : 'none'

    if (tabNew) tabNew.classList.toggle('active', tabName === 'new')
    if (tabMyTickets) tabMyTickets.classList.toggle('active', tabName === 'list' || tabName === 'chat')

    if (tabName === 'list') {
      loadAndRenderUserTickets()
    }
  }

  const loadAndRenderUserTickets = async () => {
    if (!ticketsListEl) return
    ticketsListEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 25px;">Talepleriniz yükleniyor…</div>'

    const tickets = await fetchUserSupportTickets()
    if (!tickets || tickets.length === 0) {
      ticketsListEl.innerHTML = `
        <div style="text-align: center; padding: 30px 15px; color: var(--text-muted);">
          <p style="margin-bottom: 12px;">Henüz açılmış bir destek talebiniz bulunmuyor.</p>
          <button type="button" class="btn-support" id="supportEmptyNewBtn" style="margin: 0 auto;">Yeni Destek Talebi Aç</button>
        </div>
      `
      document.querySelector('#supportEmptyNewBtn')?.addEventListener('click', () => showTab('new'))
      return
    }

    ticketsListEl.innerHTML = tickets.map((t) => {
      const item = Array.isArray(t.items) ? t.items[0] : {}
      const subject = item.subject || item.title || 'Genel Destek'
      const cleanCode = (t.order_code || '').trim().toUpperCase()
      const cachedMsgs = JSON.parse(localStorage.getItem(`monarch_ticket_thread_${cleanCode}`) || '[]')
      const msgCount = (Array.isArray(item.messages) ? item.messages.length : 1) + cachedMsgs.length
      const hasAdminReply = Array.isArray(item.messages) && item.messages.some(m => m.sender === 'admin')
      const dateStr = new Date(t.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })

      let statusBadge = `<span class="badge" style="background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3);">Açık</span>`
      if (hasAdminReply) {
        statusBadge = `<span class="badge" style="background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3);">Admin Yanıtladı</span>`
      }
      if (t.status === 'closed' || t.status === 'cancelled') {
        statusBadge = `<span class="badge" style="background: rgba(148,163,184,0.15); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3);">Kapalı</span>`
      }

      return `
        <div class="support-ticket-card" data-code="${t.order_code}" style="background: #070d14; border: 1px solid var(--border); border-radius: 4px; padding: 12px 14px; margin-bottom: 10px; cursor: pointer; transition: border-color 0.2s, background 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="font-family: var(--font-mono); color: #38bdf8; font-size: 13px;">${t.order_code}</strong>
            ${statusBadge}
          </div>
          <div style="font-weight: 700; color: var(--text); font-size: 13px; margin-bottom: 4px;">${subject}</div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted);">
            <span>${dateStr}</span>
            <span>💬 ${msgCount} Mesaj</span>
          </div>
        </div>
      `
    }).join('')

    ticketsListEl.querySelectorAll('.support-ticket-card').forEach((card) => {
      card.addEventListener('click', () => {
        const code = card.dataset.code
        const ticket = tickets.find(t => t.order_code === code)
        if (ticket) openChatView(ticket)
      })
    })
  }

  const openChatView = (ticket) => {
    activeChatTicket = ticket
    const item = Array.isArray(ticket.items) ? ticket.items[0] : {}
    const subject = item.subject || item.title || 'Genel Destek'

    if (chatTitleEl) chatTitleEl.textContent = `${ticket.order_code} · ${subject}`
    if (chatStatusEl) chatStatusEl.textContent = ticket.status === 'closed' ? 'Talebiniz Çözüldü/Kapandı' : 'Aktif Destek Talebi'

    renderChatMessages(ticket)
    showTab('chat')
  }

  const renderChatMessages = (ticket) => {
    if (!chatMessagesEl) return
    const cleanCode = (ticket.order_code || '').trim().toUpperCase()
    const item = Array.isArray(ticket.items) ? ticket.items[0] : {}
    const remoteMsgs = Array.isArray(item.messages) ? item.messages : []
    const cachedMsgs = JSON.parse(localStorage.getItem(`monarch_ticket_thread_${cleanCode}`) || '[]')

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
      const timeStr = m.createdAt ? new Date(m.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''
      const author = m.author || (isAdmin ? 'Monarch Destek Ekibi' : 'Siz')

      if (isAdmin) {
        return `
          <div style="display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px; font-size: 11px;">
              <span class="badge" style="background: rgba(34,197,94,0.2); color: #22c55e; border: 1px solid rgba(34,197,94,0.4); padding: 1px 6px; font-size: 9.5px;">MONARCH DESTEK</span>
              <strong style="color: #22c55e;">${author}</strong>
              <span style="color: var(--text-muted); font-size: 10px;">${timeStr}</span>
            </div>
            <div style="background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.25); border-radius: 6px; padding: 10px 14px; max-width: 85%; color: var(--text); font-size: 13px; line-height: 1.5; white-space: pre-wrap;">${m.text}</div>
          </div>
        `
      }

      return `
        <div style="display: flex; flex-direction: column; align-items: flex-end; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px; font-size: 11px;">
            <span style="color: var(--text-muted); font-size: 10px;">${timeStr}</span>
            <strong style="color: #38bdf8;">${author}</strong>
          </div>
          <div style="background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.35); border-radius: 6px; padding: 10px 14px; max-width: 85%; color: var(--text); font-size: 13px; line-height: 1.5; white-space: pre-wrap;">${m.text}</div>
        </div>
      `
    }).join('')

    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  }

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


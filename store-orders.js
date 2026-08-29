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

export function bindSupportUI ({ button, dialog, closeButton, form, discordInput, subjectInput, messageInput, submitButton, notify }) {
  if (!button || !dialog || !form) return

  button.addEventListener('click', () => {
    try {
      const sessRaw = localStorage.getItem('monarch_session_v1')
      if (sessRaw) {
        const sess = JSON.parse(sessRaw)
        if (sess?.discordUsername && discordInput && !discordInput.value) {
          discordInput.value = sess.discordUsername
        }
      }
    } catch {}
    dialog.showModal()
  })

  closeButton?.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
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
        unit_price: 1,
        price_tl: 1
      }]

      const { data, error } = await supabase.from('order_requests').insert({
        visitor_id: user.id,
        discord_username: discordUsername,
        items,
        total_tl: 1,
        status: 'pending_validation'
      }).select('order_code').single()

      if (error) {
        throw new Error('Destek talebi iletilemedi. Lütfen birkaç dakika sonra tekrar deneyin.')
      }

      localStorage.setItem('monarch_last_support_time', Date.now().toString())
      dialog.close()
      form.reset()
      notify('Destek Talebi Oluşturuldu', `Talep kodunuz: ${data.order_code}. Discord sunucumuzda adınıza özel destek kanalı açılıyor.`)
    } catch (err) {
      notify('İşlem Başarısız', err?.message || 'Beklenmeyen bir sorun oluştu.')
    } finally {
      submitButton.textContent = 'Destek Talebini Gönder'
      submitButton.disabled = false
    }
  })
}

window.bindOrderUI = bindOrderUI
window.bindSupportUI = bindSupportUI
window.bindCommunityStats = bindCommunityStats

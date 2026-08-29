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
async function ensureVisitor () {
  if (visitorPromise) return visitorPromise
  visitorPromise = (async () => {
    const supabase = getSupabase()
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
  summary.innerHTML = items.length
    ? `<ul>${items.map((item) => `<li><span>${escapeHtml(item.name)} × ${item.quantity}</span><b>${item.lineTotalTl} TL</b></li>`).join('')}</ul><div class="order-total"><span>Talep toplamı</span><b>${getCartTotalTl(items)} TL</b></div>`
    : '<p>Sepetinde ürün yok.</p>'
  submitButton.disabled = items.length === 0
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
    submitButton.disabled = true
    submitButton.textContent = 'Talep gönderiliyor…'
    try {
      const supabase = getSupabase()
      const user = await ensureVisitor()
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

window.bindOrderUI = bindOrderUI
window.bindCommunityStats = bindCommunityStats

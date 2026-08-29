import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://aipnaodheezawsezrjpz.supabase.co'
const SUPABASE_ANON = 'sb_publishable_PzkqDMBy4zdBC7wmgjjN4Q_phBvtzN2'

const SESSION_STORAGE_KEY = 'monarch_admin_token'
const USERNAME_STORAGE_KEY = 'monarch_admin_user'
const EXPIRES_STORAGE_KEY = 'monarch_admin_exp'

let supabaseClient = null
function getSupabase () {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    })
  }
  return supabaseClient
}

// SHA-256 Hash
export async function sha256 (plainText) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plainText)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getAdminSession () {
  const token = localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY)
  const exp = localStorage.getItem(EXPIRES_STORAGE_KEY) || sessionStorage.getItem(EXPIRES_STORAGE_KEY)
  if (!token || !exp) return null
  if (new Date(exp).getTime() <= Date.now()) {
    clearAdminSession()
    return null
  }
  return {
    token,
    username: localStorage.getItem(USERNAME_STORAGE_KEY) || sessionStorage.getItem(USERNAME_STORAGE_KEY) || 'admin',
    discordUsername: localStorage.getItem('monarch_admin_discord_user') || sessionStorage.getItem('monarch_admin_discord_user') || null,
    expiresAt: exp
  }
}

export function setAdminSession (token, username, expiresAt) {
  const exp = expiresAt || new Date(Date.now() + 12 * 3600 * 1000).toISOString()
  localStorage.setItem(SESSION_STORAGE_KEY, token)
  localStorage.setItem(USERNAME_STORAGE_KEY, username)
  localStorage.setItem(EXPIRES_STORAGE_KEY, exp)
  sessionStorage.setItem(SESSION_STORAGE_KEY, token)
  sessionStorage.setItem(USERNAME_STORAGE_KEY, username)
  sessionStorage.setItem(EXPIRES_STORAGE_KEY, exp)
}

export function clearAdminSession () {
  localStorage.removeItem(SESSION_STORAGE_KEY)
  localStorage.removeItem(USERNAME_STORAGE_KEY)
  localStorage.removeItem(EXPIRES_STORAGE_KEY)
  localStorage.removeItem('monarch_admin_discord_user')
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  sessionStorage.removeItem(USERNAME_STORAGE_KEY)
  sessionStorage.removeItem(EXPIRES_STORAGE_KEY)
  sessionStorage.removeItem('monarch_admin_discord_user')
}

export async function requestAdmin2FA (username, password, discordUsername = null) {
  const supabase = getSupabase()
  const passwordHash = await sha256(password)
  const { data, error } = await supabase.rpc('monarch_admin_request_2fa', {
    p_username: username,
    p_password_hash: passwordHash,
    p_ip_info: navigator.userAgent.substring(0, 100),
    p_discord_username: discordUsername ? discordUsername.trim() : null
  })

  if (error) throw new Error(error.message || '2FA talebi oluşturulamadı.')
  if (!data?.success) throw new Error(data?.message || 'Kullanıcı adı veya şifre hatalı.')
  return data
}

export async function verifyAdmin2FA (challengeId, code, discordUsername = null) {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('monarch_admin_verify_2fa', {
    p_challenge_id: challengeId,
    p_code: code.trim(),
    p_discord_username: discordUsername ? discordUsername.trim() : null
  })

  if (error) throw new Error(error.message || 'Doğrulama başarısız.')
  if (!data?.success) throw new Error(data?.message || 'Geçersiz veya süresi dolmuş 2FA kodu.')
  
  setAdminSession(data.session_token, data.username, data.expires_at)
  return data
}

export async function fetchAdminOrders () {
  const session = getAdminSession()
  if (!session) throw new Error('Oturum süresi doldu. Lütfen tekrar giriş yapın.')
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('monarch_admin_get_orders', {
    p_session_token: session.token
  })

  if (error) throw new Error(error.message || 'Siparişler yüklenemedi.')
  if (!data?.success) throw new Error(data?.message || 'Yetkisiz erişim.')
  return data
}

export async function updateOrderStatus (orderCode, newStatus, notes = null) {
  const session = getAdminSession()
  if (!session) throw new Error('Oturum süresi doldu. Lütfen tekrar giriş yapın.')
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('monarch_admin_update_order_status', {
    p_session_token: session.token,
    p_order_code: orderCode,
    p_new_status: newStatus,
    p_notes: notes
  })

  if (error) throw new Error(error.message || 'Durum güncellenemedi.')
  if (!data?.success) throw new Error(data?.message || 'İşlem gerçekleştirilemedi.')
  return data
}

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}

function formatDate (isoString) {
  if (!isoString) return '—'
  const date = new Date(isoString)
  return date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime (isoString) {
  if (!isoString) return '—'
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diffSec < 60) return 'Az önce'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dk önce`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} sa önce`
  return `${Math.floor(diffSec / 86400)} gün önce`
}

function formatStatusBadge (status) {
  const map = {
    'pending_validation': { label: 'Doğrulama Bekliyor', color: 'badge-pending', svg: '<svg class="adm-badge-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
    'processing': { label: 'İşleniyor', color: 'badge-processing', svg: '<svg class="adm-badge-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>' },
    'validated': { label: 'Doğrulandı (Ticket Açık)', color: 'badge-validated', svg: '<svg class="adm-badge-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
    'queued': { label: 'Sırada', color: 'badge-queued', svg: '<svg class="adm-badge-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' },
    'in_progress': { label: 'Aktif İşlemde', color: 'badge-progress', svg: '<svg class="adm-badge-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' },
    'closed': { label: 'Tamamlandı / Kapalı', color: 'badge-closed', svg: '<svg class="adm-badge-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' },
    'cancelled': { label: 'İptal Edildi', color: 'badge-cancelled', svg: '<svg class="adm-badge-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' }
  }
  const item = map[status] || { label: status, color: 'badge-default', svg: '<span class="adm-badge-dot"></span>' }
  return `<span class="adm-badge ${item.color}">${item.svg}<span>${escapeHtml(item.label)}</span></span>`
}

function formatItems (items) {
  if (!Array.isArray(items) || !items.length) return '<span class="adm-muted">—</span>'
  return items.map(item => `
    <span class="adm-item-pill" title="${escapeHtml(item.sku || 'Ürün')} (${item.quantity} adet)">
      <b>${escapeHtml(item.sku || 'Ürün')}</b> × ${item.quantity}
    </span>
  `).join('')
}

export function initAdminDashboardUI ({ notify }) {
  const dashboardDialog = document.querySelector('#adminDashboardDialog')
  const detailDialog = document.querySelector('#adminOrderDetailDialog')
  const ordersTbody = document.querySelector('#adminOrdersTableBody')
  const clientsTbody = document.querySelector('#adminClientsTableBody')
  const refreshBtn = document.querySelector('#adminRefreshBtn')
  const exportCsvBtn = document.querySelector('#adminExportCsvBtn')
  const logoutBtn = document.querySelector('#adminLogoutBtn')
  const searchInput = document.querySelector('#adminSearchInput')
  const statusFilterSelect = document.querySelector('#adminStatusFilterSelect')
  const sortSelect = document.querySelector('#adminSortSelect')
  const navTabs = document.querySelectorAll('.adm-sidebar-tab')
  const viewSections = document.querySelectorAll('.adm-view-section')
  const clockEl = document.querySelector('#adminClock')

  let cachedOrders = []
  let activeTab = 'orders'
  let autoRefreshTimer = null

  // Canlı Saat Ticker'ı
  function startClock () {
    const updateClock = () => {
      if (!clockEl) return
      const now = new Date()
      clockEl.textContent = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (İST)'
    }
    updateClock()
    setInterval(updateClock, 1000)
  }
  startClock()

  async function openDashboard () {
    const session = getAdminSession()
    if (!session) {
      notify('Yetkisiz', 'Önce hesap menüsünden admin girişi yapmalısınız.')
      return
    }

    // Profil Bilgilerini Güncelle
    const userBadgeEl = document.querySelector('#adminUserBadge')
    const discTagEl = document.querySelector('#adminDiscordTag')
    if (userBadgeEl) userBadgeEl.textContent = session.username
    if (discTagEl) discTagEl.textContent = session.discordUsername ? `@${session.discordUsername}` : 'Founder'

    dashboardDialog.showModal()
    await loadDashboardData()

    // 15 saniyede bir otomatik canlı yenileme
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = setInterval(loadDashboardData, 15000)
  }

  async function loadDashboardData () {
    try {
      const data = await fetchAdminOrders()
      cachedOrders = data.orders || []
      renderStats(data.stats || {})
      renderOverview()
      renderOrders()
      renderClients()
    } catch (err) {
      notify('Hata', err.message || 'Veriler yüklenemedi.')
      if (err.message.includes('Oturum') || err.message.includes('Yetkisiz')) {
        clearInterval(autoRefreshTimer)
        dashboardDialog.close()
        clearAdminSession()
      }
    }
  }

  function renderStats (stats) {
    const totalOrders = stats.total_orders || 0
    const totalRev = stats.total_revenue || 0
    const avgVal = totalOrders > 0 ? Math.round(totalRev / totalOrders) : 0

    const elTotal = document.querySelector('#admStatTotalOrders')
    const elRev = document.querySelector('#admStatTotalRevenue')
    const elAvg = document.querySelector('#admStatAvgOrder')
    const elPending = document.querySelector('#admStatPending')
    const elValidated = document.querySelector('#admStatValidated')
    const elCompleted = document.querySelector('#admStatCompleted')

    if (elTotal) elTotal.textContent = totalOrders
    if (elRev) elRev.textContent = `${totalRev.toLocaleString('tr-TR')} TL`
    if (elAvg) elAvg.textContent = `${avgVal} TL`
    if (elPending) elPending.textContent = stats.pending_orders || 0
    if (elValidated) elValidated.textContent = stats.validated_orders || 0
    if (elCompleted) elCompleted.textContent = stats.completed_orders || 0
  }

  function renderOverview () {
    // Kategori Dağılımını Hesapla
    let countBots = 0
    let countUiUx = 0
    let countSlides = 0
    let totalItems = 0

    cachedOrders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach(it => {
          const sku = (it.sku || '').toLowerCase()
          const q = it.quantity || 1
          totalItems += q
          if (sku.includes('bot') || sku.includes('afk') || sku.includes('miner') || sku.includes('farmer')) countBots += q
          else if (sku.includes('ui') || sku.includes('ux') || sku.includes('tasarım')) countUiUx += q
          else if (sku.includes('sunum') || sku.includes('slayt') || sku.includes('slide')) countSlides += q
          else countBots += q
        })
      }
    })

    const pctBots = totalItems > 0 ? Math.round((countBots / totalItems) * 100) : 0
    const pctUiUx = totalItems > 0 ? Math.round((countUiUx / totalItems) * 100) : 0
    const pctSlides = totalItems > 0 ? Math.round((countSlides / totalItems) * 100) : 0

    const elBarBots = document.querySelector('#admBarBots')
    const elBarUiUx = document.querySelector('#admBarUiUx')
    const elBarSlides = document.querySelector('#admBarSlides')
    const elValBots = document.querySelector('#admValBots')
    const elValUiUx = document.querySelector('#admValUiUx')
    const elValSlides = document.querySelector('#admValSlides')

    if (elBarBots) elBarBots.style.width = `${pctBots}%`
    if (elBarUiUx) elBarUiUx.style.width = `${pctUiUx}%`
    if (elBarSlides) elBarSlides.style.width = `${pctSlides}%`

    if (elValBots) elValBots.textContent = `${countBots} Adet (%${pctBots})`
    if (elValUiUx) elValUiUx.textContent = `${countUiUx} Adet (%${pctUiUx})`
    if (elValSlides) elValSlides.textContent = `${countSlides} Adet (%${pctSlides})`

    // Son Aktiviteler Mini Tablosu
    const recentTbody = document.querySelector('#admRecentActivitiesBody')
    if (recentTbody) {
      const recent = cachedOrders.slice(0, 5)
      if (!recent.length) {
        recentTbody.innerHTML = '<tr><td colspan="4" class="adm-empty">Henüz aktivite bulunmuyor.</td></tr>'
      } else {
        recentTbody.innerHTML = recent.map(o => `
          <tr>
            <td><strong class="adm-code-sm" data-copy="${escapeHtml(o.order_code)}">${escapeHtml(o.order_code)}</strong></td>
            <td><span class="adm-user-tag">@${escapeHtml(o.discord_username)}</span></td>
            <td><b class="adm-price-sm">${o.total_tl} TL</b></td>
            <td>${formatStatusBadge(o.status)}</td>
          </tr>
        `).join('')
      }
    }
  }

  function renderOrders () {
    if (!ordersTbody) return
    const query = (searchInput?.value || '').toLowerCase().trim()
    const statusVal = statusFilterSelect?.value || 'all'
    const sortVal = sortSelect?.value || 'newest'

    let filtered = [...cachedOrders]

    // Durum Filtresi
    if (statusVal !== 'all') {
      if (statusVal === 'pending') {
        filtered = filtered.filter(o => ['pending_validation', 'processing'].includes(o.status))
      } else if (statusVal === 'active') {
        filtered = filtered.filter(o => ['validated', 'queued', 'in_progress'].includes(o.status))
      } else if (statusVal === 'closed') {
        filtered = filtered.filter(o => ['closed'].includes(o.status))
      } else if (statusVal === 'cancelled') {
        filtered = filtered.filter(o => ['cancelled'].includes(o.status))
      } else {
        filtered = filtered.filter(o => o.status === statusVal)
      }
    }

    // Arama Filtresi
    if (query) {
      filtered = filtered.filter(o =>
        (o.order_code || '').toLowerCase().includes(query) ||
        (o.discord_username || '').toLowerCase().includes(query) ||
        (o.discord_user_id || '').includes(query) ||
        JSON.stringify(o.items || '').toLowerCase().includes(query)
      )
    }

    // Sıralama
    if (sortVal === 'newest') {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    } else if (sortVal === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    } else if (sortVal === 'price_high') {
      filtered.sort((a, b) => (b.total_tl || 0) - (a.total_tl || 0))
    } else if (sortVal === 'price_low') {
      filtered.sort((a, b) => (a.total_tl || 0) - (b.total_tl || 0))
    }

    const countBadge = document.querySelector('#admOrdersCountBadge')
    if (countBadge) countBadge.textContent = `${filtered.length} Sipariş`

    if (!filtered.length) {
      ordersTbody.innerHTML = '<tr><td colspan="8" class="adm-empty">Arama kriterine uygun sipariş bulunamadı.</td></tr>'
      return
    }

    ordersTbody.innerHTML = filtered.map(order => `
      <tr class="adm-table-row">
        <td>
          <div class="adm-code-cell">
            <strong class="adm-code" title="Tıklayarak Kopyala" data-copy="${escapeHtml(order.order_code)}">${escapeHtml(order.order_code)}</strong>
            <button type="button" class="adm-btn-copy" data-copy="${escapeHtml(order.order_code)}" title="Kodu Kopyala">
              <svg class="adm-svg-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </td>
        <td>
          <div class="adm-user-cell">
            <div class="adm-avatar-circle">${escapeHtml((order.discord_username || 'M')[0].toUpperCase())}</div>
            <div class="adm-user-meta">
              <span class="adm-user-name">@${escapeHtml(order.discord_username)}</span>
              ${order.discord_user_id ? `<small class="adm-user-id" title="Discord ID">${escapeHtml(order.discord_user_id)}</small>` : '<small class="adm-user-id-waiting">ID Bekleniyor</small>'}
            </div>
          </div>
        </td>
        <td>
          <div class="adm-items-cell">
            ${formatItems(order.items)}
          </div>
        </td>
        <td>
          <b class="adm-price">${order.total_tl} TL</b>
        </td>
        <td>
          ${formatStatusBadge(order.status)}
        </td>
        <td>
          <div class="adm-time-cell">
            <span class="adm-rel-time">${formatRelativeTime(order.created_at)}</span>
            <small class="adm-abs-time">${formatDate(order.created_at)}</small>
          </div>
        </td>
        <td>
          <span class="adm-handled-tag">${escapeHtml(order.handled_by || 'MonarchBot')}</span>
        </td>
        <td>
          <div class="adm-actions-group">
            <select class="adm-status-select" data-code="${escapeHtml(order.order_code)}" title="Durumu Değiştir">
              <option value="" disabled selected>Durum Seç</option>
              <option value="validated" ${order.status === 'validated' ? 'selected' : ''}>Doğrulandı</option>
              <option value="queued" ${order.status === 'queued' ? 'selected' : ''}>Sırada</option>
              <option value="in_progress" ${order.status === 'in_progress' ? 'selected' : ''}>İşlemde</option>
              <option value="closed" ${order.status === 'closed' ? 'selected' : ''}>Tamamla</option>
              <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>İptal Et</option>
            </select>
            <button type="button" class="adm-btn-inspect" data-inspect-code="${escapeHtml(order.order_code)}" title="Detay İncele">
              <svg class="adm-svg-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>Detay</span>
            </button>
          </div>
        </td>
      </tr>
    `).join('')

    // Durum Değiştirme Dinleyicileri
    ordersTbody.querySelectorAll('.adm-status-select').forEach(select => {
      select.addEventListener('change', async () => {
        const code = select.dataset.code
        const newStatus = select.value
        if (!newStatus) return
        try {
          select.disabled = true
          await updateOrderStatus(code, newStatus)
          notify('Durum Güncellendi', `${code} siparişi güncellendi.`)
          await loadDashboardData()
        } catch (err) {
          notify('Hata', err.message || 'Durum güncellenemedi.')
        } finally {
          select.disabled = false
        }
      })
    })

    // Detay İncele Butonları
    ordersTbody.querySelectorAll('.adm-btn-inspect').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.inspectCode
        const order = cachedOrders.find(o => o.order_code === code)
        if (order) openOrderDetailModal(order)
      })
    })

    // Kopyalama Butonları
    ordersTbody.querySelectorAll('[data-copy]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const text = el.dataset.copy
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text)
          notify('Kopyalandı', `${text} panoya kopyalandı.`)
        }
      })
    })
  }

  function renderClients () {
    if (!clientsTbody) return
    const clientMap = new Map()

    cachedOrders.forEach(o => {
      const username = o.discord_username || 'Bilinmiyor'
      const existing = clientMap.get(username) || {
        username,
        discord_id: o.discord_user_id || null,
        order_count: 0,
        total_spent: 0,
        last_order_at: o.created_at,
        statuses: []
      }

      existing.order_count += 1
      existing.total_spent += (o.total_tl || 0)
      if (o.discord_user_id && !existing.discord_id) existing.discord_id = o.discord_user_id
      if (new Date(o.created_at) > new Date(existing.last_order_at)) existing.last_order_at = o.created_at
      existing.statuses.push(o.status)

      clientMap.set(username, existing)
    })

    const clientList = Array.from(clientMap.values()).sort((a, b) => b.total_spent - a.total_spent)

    if (!clientList.length) {
      clientsTbody.innerHTML = '<tr><td colspan="5" class="adm-empty">Müşteri kaydı bulunmuyor.</td></tr>'
      return
    }

    clientsTbody.innerHTML = clientList.map(c => `
      <tr>
        <td>
          <div class="adm-user-cell">
            <div class="adm-avatar-circle">${escapeHtml(c.username[0].toUpperCase())}</div>
            <div class="adm-user-meta">
              <strong class="adm-user-name">@${escapeHtml(c.username)}</strong>
              ${c.discord_id ? `<small class="adm-user-id">${escapeHtml(c.discord_id)}</small>` : '<small class="adm-user-id-waiting">ID Yok</small>'}
            </div>
          </div>
        </td>
        <td><b class="adm-count-pill">${c.order_count} Sipariş</b></td>
        <td><b class="adm-price">${c.total_spent.toLocaleString('tr-TR')} TL</b></td>
        <td><span class="adm-rel-time">${formatRelativeTime(c.last_order_at)}</span></td>
        <td>
          <button type="button" class="adm-btn-table-action" onclick="document.querySelector('#adminSearchInput').value='${escapeHtml(c.username)}'; document.querySelector('#tabOrdersBtn').click();">
            <svg class="adm-svg-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            <span>Siparişleri Gör</span>
          </button>
        </td>
      </tr>
    `).join('')
  }

  function openOrderDetailModal (order) {
    if (!detailDialog) return
    const modalCode = document.querySelector('#modalOrderCode')
    const modalUser = document.querySelector('#modalOrderUser')
    const modalUserId = document.querySelector('#modalOrderUserId')
    const modalPrice = document.querySelector('#modalOrderPrice')
    const modalStatus = document.querySelector('#modalOrderStatus')
    const modalDate = document.querySelector('#modalOrderDate')
    const modalItemsList = document.querySelector('#modalOrderItemsList')
    const modalTicketId = document.querySelector('#modalOrderTicketId')
    const modalHandledBy = document.querySelector('#modalOrderHandledBy')

    if (modalCode) modalCode.textContent = order.order_code
    if (modalUser) modalUser.textContent = `@${order.discord_username}`
    if (modalUserId) modalUserId.textContent = order.discord_user_id || 'ID Kaydı Yok'
    if (modalPrice) modalPrice.textContent = `${order.total_tl} TL`
    if (modalStatus) modalStatus.innerHTML = formatStatusBadge(order.status)
    if (modalDate) modalDate.textContent = formatDate(order.created_at)
    if (modalTicketId) modalTicketId.textContent = order.ticket_channel_id ? `#${order.ticket_channel_id}` : 'Ticket Henüz Açılmadı'
    if (modalHandledBy) modalHandledBy.textContent = order.handled_by || 'MonarchBot'

    if (modalItemsList) {
      if (Array.isArray(order.items) && order.items.length) {
        modalItemsList.innerHTML = order.items.map(it => `
          <div class="adm-modal-item-row">
            <span class="adm-modal-item-name">📦 ${escapeHtml(it.sku || 'Ürün')}</span>
            <span class="adm-modal-item-qty">${it.quantity} Adet</span>
            <b class="adm-modal-item-price">${(it.unit_price || 0) * (it.quantity || 1)} TL</b>
          </div>
        `).join('')
      } else {
        modalItemsList.innerHTML = '<div class="adm-muted">Ürün bilgisi yok.</div>'
      }
    }

    // Modal Hızlı Aksiyon Butonları
    const btnQuickDone = document.querySelector('#modalActionDone')
    const btnQuickCancel = document.querySelector('#modalActionCancel')

    if (btnQuickDone) {
      btnQuickDone.onclick = async () => {
        try {
          await updateOrderStatus(order.order_code, 'closed')
          notify('Tamamlandı', `${order.order_code} başarıyla kapatıldı.`)
          detailDialog.close()
          await loadDashboardData()
        } catch (e) {
          notify('Hata', e.message)
        }
      }
    }

    if (btnQuickCancel) {
      btnQuickCancel.onclick = async () => {
        try {
          await updateOrderStatus(order.order_code, 'cancelled')
          notify('İptal Edildi', `${order.order_code} iptal edildi.`)
          detailDialog.close()
          await loadDashboardData()
        } catch (e) {
          notify('Hata', e.message)
        }
      }
    }

    detailDialog.showModal()
  }

  // CSV Dışa Aktarma Fonksiyonu
  function exportCSV () {
    if (!cachedOrders.length) {
      notify('Hata', 'Dışa aktarılacak sipariş bulunamadı.')
      return
    }

    const headers = ['Talep Kodu', 'Discord Kullanıcısı', 'Discord ID', 'Tutar (TL)', 'Durum', 'Yetkili', 'Tarih', 'Ürünler']
    const rows = cachedOrders.map(o => [
      `"${o.order_code || ''}"`,
      `"${o.discord_username || ''}"`,
      `"${o.discord_user_id || ''}"`,
      o.total_tl || 0,
      `"${o.status || ''}"`,
      `"${o.handled_by || ''}"`,
      `"${o.created_at || ''}"`,
      `"${JSON.stringify(o.items || []).replace(/"/g, '""')}"`
    ])

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `MonarchStore_Siparisler_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notify('İndirildi', 'Sipariş listesi CSV formatında dışa aktarıldı.')
  }

  // Sidebar Sekme Değiştirme
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const targetView = tab.dataset.tab

      viewSections.forEach(sec => {
        sec.style.display = (sec.id === `admSection_${targetView}` ? 'block' : 'none')
      })
    })
  })

  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('spinning')
    await loadDashboardData()
    setTimeout(() => refreshBtn.classList.remove('spinning'), 600)
    notify('Canlı Veri', 'Tüm sipariş ve istatistikler güncellendi.')
  })

  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCSV)

  if (searchInput) searchInput.addEventListener('input', renderOrders)
  if (statusFilterSelect) statusFilterSelect.addEventListener('change', renderOrders)
  if (sortSelect) sortSelect.addEventListener('change', renderOrders)

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearInterval(autoRefreshTimer)
      clearAdminSession()
      dashboardDialog.close()
      notify('Çıkış Yapıldı', 'Admin oturumu sonlandırıldı.')
      const accBtn = document.querySelector('#accountButton')
      if (accBtn) accBtn.textContent = 'Giriş Yap / Kaydol'
    })
  }

  return { openDashboard, loadDashboardData }
}

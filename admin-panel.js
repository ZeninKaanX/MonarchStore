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

// SHA-256 Hash Yardımcısı
async function sha256 (plainText) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plainText)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getAdminSession () {
  const token = sessionStorage.getItem(SESSION_STORAGE_KEY)
  const exp = sessionStorage.getItem(EXPIRES_STORAGE_KEY)
  if (!token || !exp) return null
  if (new Date(exp).getTime() <= Date.now()) {
    clearAdminSession()
    return null
  }
  return {
    token,
    username: sessionStorage.getItem(USERNAME_STORAGE_KEY) || 'admin',
    expiresAt: exp
  }
}

export function setAdminSession (token, username, expiresAt) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, token)
  sessionStorage.setItem(USERNAME_STORAGE_KEY, username)
  sessionStorage.setItem(EXPIRES_STORAGE_KEY, expiresAt || new Date(Date.now() + 12 * 3600 * 1000).toISOString())
}

export function clearAdminSession () {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  sessionStorage.removeItem(USERNAME_STORAGE_KEY)
  sessionStorage.removeItem(EXPIRES_STORAGE_KEY)
}

export async function requestAdmin2FA (username, password) {
  const supabase = getSupabase()
  const passwordHash = await sha256(password)
  const { data, error } = await supabase.rpc('monarch_admin_request_2fa', {
    p_username: username,
    p_password_hash: passwordHash,
    p_ip_info: navigator.userAgent.substring(0, 100)
  })

  if (error) throw new Error(error.message || '2FA talebi oluşturulamadı.')
  if (!data?.success) throw new Error(data?.message || 'Kullanıcı adı veya şifre hatalı.')
  return data
}

export async function verifyAdmin2FA (challengeId, code) {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('monarch_admin_verify_2fa', {
    p_challenge_id: challengeId,
    p_code: code.trim()
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

function formatStatusBadge (status) {
  const map = {
    'pending_validation': { label: 'Doğrulama Bekliyor', color: 'badge-pending' },
    'processing': { label: 'İşleniyor', color: 'badge-processing' },
    'validated': { label: 'Doğrulandı (Ticket Açıldı)', color: 'badge-validated' },
    'queued': { label: 'Sırada', color: 'badge-queued' },
    'in_progress': { label: 'İşlemde', color: 'badge-progress' },
    'closed': { label: 'Tamamlandı / Kapatıldı', color: 'badge-closed' },
    'cancelled': { label: 'İptal Edildi', color: 'badge-cancelled' }
  }
  const item = map[status] || { label: status, color: 'badge-default' }
  return `<span class="admin-badge ${item.color}">${escapeHtml(item.label)}</span>`
}

function formatItems (items) {
  if (!Array.isArray(items) || !items.length) return '—'
  return items.map(item => `
    <span class="admin-item-pill">
      <b>${escapeHtml(item.sku || 'Ürün')}</b> × ${item.quantity}
    </span>
  `).join('')
}

export function initAdminUI ({ notify }) {
  const adminBtn = document.querySelector('#adminNavButton')
  const authDialog = document.querySelector('#adminAuthDialog')
  const dashboardDialog = document.querySelector('#adminDashboardDialog')
  const authForm = document.querySelector('#adminAuthForm')
  const step1 = document.querySelector('#adminStep1')
  const step2 = document.querySelector('#adminStep2')
  const usernameInput = document.querySelector('#adminUsername')
  const passwordInput = document.querySelector('#adminPassword')
  const codeInput = document.querySelector('#admin2FACode')
  const countdownEl = document.querySelector('#admin2FACountdown')
  const ordersTbody = document.querySelector('#adminOrdersTableBody')
  const refreshBtn = document.querySelector('#adminRefreshBtn')
  const logoutBtn = document.querySelector('#adminLogoutBtn')
  const filterTabs = document.querySelectorAll('.admin-filter-tab')
  const searchInput = document.querySelector('#adminSearchInput')
  const openAuthFromAccBtn = document.querySelector('#openAdminAuthFromAccount')

  let currentChallengeId = null
  let countdownTimer = null
  let cachedOrders = []
  let activeFilter = 'all'

  function updateNavButtonVisibility () {
    const session = getAdminSession()
    if (adminBtn) {
      if (session) {
        adminBtn.style.display = 'inline-flex'
        adminBtn.innerHTML = `🛡️ Admin (${escapeHtml(session.username)})`
      } else {
        adminBtn.style.display = 'none'
      }
    }
  }

  function startCountdown (seconds = 300) {
    clearInterval(countdownTimer)
    let remain = seconds
    const tick = () => {
      const min = Math.floor(remain / 60)
      const sec = remain % 60
      if (countdownEl) countdownEl.textContent = `${min}:${sec < 10 ? '0' : ''}${sec}`
      if (remain <= 0) {
        clearInterval(countdownTimer)
        if (countdownEl) countdownEl.textContent = 'Süre Doldu'
      }
      remain--
    }
    tick()
    countdownTimer = setInterval(tick, 1000)
  }

  function openAuthModal () {
    if (getAdminSession()) {
      openDashboard()
      return
    }
    step1.style.display = 'grid'
    step2.style.display = 'none'
    authForm.reset()
    authDialog.showModal()
  }

  async function openDashboard () {
    updateNavButtonVisibility()
    dashboardDialog.showModal()
    await loadDashboardData()
  }

  async function loadDashboardData () {
    try {
      if (ordersTbody) ordersTbody.innerHTML = '<tr><td colspan="7" class="admin-loading">Veriler yükleniyor…</td></tr>'
      const data = await fetchAdminOrders()
      cachedOrders = data.orders || []
      renderStats(data.stats || {})
      renderOrders()
    } catch (err) {
      notify('Hata', err.message || 'Veriler yüklenemedi.')
      if (err.message.includes('Oturum') || err.message.includes('Yetkisiz')) {
        dashboardDialog.close()
        clearAdminSession()
        updateNavButtonVisibility()
        openAuthModal()
      }
    }
  }

  function renderStats (stats) {
    const totalEl = document.querySelector('#adminStatTotalOrders')
    const revEl = document.querySelector('#adminStatTotalRevenue')
    const pendingEl = document.querySelector('#adminStatPending')
    const valEl = document.querySelector('#adminStatValidated')

    if (totalEl) totalEl.textContent = stats.total_orders || 0
    if (revEl) revEl.textContent = `${stats.total_revenue || 0} TL`
    if (pendingEl) pendingEl.textContent = stats.pending_orders || 0
    if (valEl) valEl.textContent = stats.validated_orders || 0
  }

  function renderOrders () {
    if (!ordersTbody) return
    const query = (searchInput?.value || '').toLowerCase().trim()
    let filtered = cachedOrders

    if (activeFilter === 'pending') {
      filtered = filtered.filter(o => ['pending_validation', 'processing'].includes(o.status))
    } else if (activeFilter === 'validated') {
      filtered = filtered.filter(o => ['validated', 'queued', 'in_progress'].includes(o.status))
    } else if (activeFilter === 'closed') {
      filtered = filtered.filter(o => ['closed', 'cancelled'].includes(o.status))
    }

    if (query) {
      filtered = filtered.filter(o =>
        (o.order_code || '').toLowerCase().includes(query) ||
        (o.discord_username || '').toLowerCase().includes(query) ||
        (o.discord_user_id || '').includes(query)
      )
    }

    if (!filtered.length) {
      ordersTbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Kayıt bulunamadı.</td></tr>'
      return
    }

    ordersTbody.innerHTML = filtered.map(order => `
      <tr>
        <td><strong class="admin-code">${escapeHtml(order.order_code)}</strong></td>
        <td>
          <div class="admin-user-cell">
            <span class="admin-user-tag">@${escapeHtml(order.discord_username)}</span>
            ${order.discord_user_id ? `<small class="admin-uid">${escapeHtml(order.discord_user_id)}</small>` : '<small class="admin-uid-none">ID Henüz Yok</small>'}
          </div>
        </td>
        <td><div class="admin-items-cell">${formatItems(order.items)}</div></td>
        <td><b class="admin-price">${order.total_tl} TL</b></td>
        <td>${formatStatusBadge(order.status)}</td>
        <td><small class="admin-date">${formatDate(order.created_at)}</small></td>
        <td>
          <div class="admin-actions">
            <select class="admin-status-select" data-code="${escapeHtml(order.order_code)}">
              <option value="" disabled selected>Durum Değiştir</option>
              <option value="validated">Doğrulandı</option>
              <option value="queued">Sırada</option>
              <option value="in_progress">İşlemde</option>
              <option value="closed">Tamamlandı/Kapat</option>
              <option value="cancelled">İptal Et</option>
            </select>
          </div>
        </td>
      </tr>
    `).join('')

    // Durum değiştirme dinleyicileri
    ordersTbody.querySelectorAll('.admin-status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const code = select.dataset.code
        const newStatus = select.value
        if (!newStatus) return
        try {
          select.disabled = true
          await updateOrderStatus(code, newStatus)
          notify('Başarılı', `${code} durumu güncellendi.`)
          await loadDashboardData()
        } catch (err) {
          notify('Hata', err.message || 'Durum güncellenemedi.')
        } finally {
          select.disabled = false
        }
      })
    })
  }

  // Event Listeners
  if (adminBtn) adminBtn.addEventListener('click', openDashboard)
  if (openAuthFromAccBtn) openAuthFromAccBtn.addEventListener('click', openAuthModal)
  if (refreshBtn) refreshBtn.addEventListener('click', loadDashboardData)

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearAdminSession()
      updateNavButtonVisibility()
      dashboardDialog.close()
      notify('Çıkış yapıldı', 'Admin oturumu sonlandırıldı.')
    })
  }

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      activeFilter = tab.dataset.filter
      renderOrders()
    })
  })

  if (searchInput) {
    searchInput.addEventListener('input', () => renderOrders())
  }

  // Auth Form Submit
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const submitBtn = authForm.querySelector('button[type="submit"]')

      // Adım 1: Kullanıcı Adı & Şifre -> 2FA Kodu Talep Et
      if (step1.style.display !== 'none') {
        const username = usernameInput.value.trim()
        const password = passwordInput.value
        if (!username || !password) return

        submitBtn.disabled = true
        submitBtn.textContent = '2FA İsteği Gönderiliyor…'
        try {
          const res = await requestAdmin2FA(username, password)
          currentChallengeId = res.challenge_id
          step1.style.display = 'none'
          step2.style.display = 'grid'
          startCountdown(300)
          notify('2FA Kodu Gönderildi', 'Discord #admin-2fa kanalına güvenlik kodu iletildi.')
          codeInput.focus()
        } catch (err) {
          notify('Giriş Başarısız', err.message || 'Kullanıcı adı veya şifre hatalı.')
        } finally {
          submitBtn.disabled = false
          submitBtn.textContent = 'Devam Et'
        }
        return
      }

      // Adım 2: 2FA Kodunu Doğrula
      if (step2.style.display !== 'none') {
        const code = codeInput.value.trim()
        if (!code || !currentChallengeId) return

        submitBtn.disabled = true
        submitBtn.textContent = 'Doğrulanıyor…'
        try {
          await verifyAdmin2FA(currentChallengeId, code)
          clearInterval(countdownTimer)
          authDialog.close()
          notify('Giriş Başarılı', 'Admin paneline hoş geldiniz.')
          updateNavButtonVisibility()
          openDashboard()
        } catch (err) {
          notify('Doğrulama Başarısız', err.message || 'Geçersiz veya süresi dolmuş kod.')
          codeInput.focus()
        } finally {
          submitBtn.disabled = false
          submitBtn.textContent = 'Doğrula ve Giriş Yap'
        }
      }
    })
  }

  // Gizli Kısayol: Ctrl+Alt+A veya Alt+Shift+M ile Admin Girişi
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && e.altKey && e.key.toLowerCase() === 'a') || (e.altKey && e.shiftKey && e.key.toLowerCase() === 'm')) {
      e.preventDefault()
      openAuthModal()
    }
  })

  // Başlangıç kontrolü
  updateNavButtonVisibility()
}

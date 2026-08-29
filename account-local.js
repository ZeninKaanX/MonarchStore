import { getAdminSession, setAdminSession, clearAdminSession, requestAdmin2FA, verifyAdmin2FA } from './admin-panel.js'

const ACCOUNTS_KEY = "monarch-store.local-accounts.v1";
const SESSION_KEY = "monarch-store.local-session.v1";

export function normalizeUsername(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function localFallbackHash(password) {
  let hash = 2166136261;
  for (let index = 0; index < password.length; index += 1) {
    hash ^= password.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(16)}`;
}

export async function hashPassword(password) {
  if (!globalThis.crypto?.subtle) {
    return localFallbackHash(password);
  }
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function readAccounts(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(ACCOUNTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAccounts(storage, accounts) {
  storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function saveSession(storage, username) {
  storage.setItem(SESSION_KEY, JSON.stringify({ username, signedInAt: Date.now() }));
}

export function getLocalSession(storage) {
  const adminSession = getAdminSession();
  if (adminSession) {
    return { username: adminSession.username, isAdmin: true };
  }
  try {
    const session = JSON.parse(storage.getItem(SESSION_KEY) ?? "null");
    return session && typeof session.username === "string" ? session : null;
  } catch {
    return null;
  }
}

export async function createLocalAccount(storage, usernameInput, password) {
  const username = normalizeUsername(usernameInput);
  if (username.length < 3 || username.length > 24) {
    throw new Error("Kullanıcı adı 3–24 karakter olmalı.");
  }
  if (password.length < 6) {
    throw new Error("Şifre en az 6 karakter olmalı.");
  }

  const accounts = readAccounts(storage);
  const normalized = username.toLocaleLowerCase("tr-TR");
  if (accounts.some(account => account.normalized === normalized)) {
    throw new Error("Bu kullanıcı adı bu cihazda zaten kayıtlı.");
  }

  accounts.push({
    username,
    normalized,
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  });
  saveAccounts(storage, accounts);
  saveSession(storage, username);
  return { username };
}

export async function signInLocalAccount(storage, usernameInput, password) {
  const username = normalizeUsername(usernameInput);
  const normalized = username.toLocaleLowerCase("tr-TR");
  const passwordHash = await hashPassword(password);
  const account = readAccounts(storage).find(
    candidate => candidate.normalized === normalized && candidate.passwordHash === passwordHash
  );

  if (!account) {
    throw new Error("Kullanıcı adı veya şifre hatalı.");
  }

  saveSession(storage, account.username);
  return { username: account.username };
}

export function signOutLocalAccount(storage) {
  clearAdminSession();
  storage.removeItem(SESSION_KEY);
}

export function bindLocalAccountUI({ button, dialog, closeButton, form, usernameInput, passwordInput, confirmInput, title, description, submitButton, switchButton, logoutButton, notify, onOpenAdminDashboard }) {
  const storage = window.localStorage;
  let mode = "login"; // Varsayılan olarak giriş yap modu
  let is2FAActive = false;
  let activeChallengeId = null;
  let countdownInterval = null;

  const updateHeader = () => {
    const session = getLocalSession(storage);
    if (session?.isAdmin) {
      button.textContent = `🛡️ Admin: ${session.username}`;
      button.classList.add("is-signed-in");
    } else if (session) {
      button.textContent = `Hesap: ${session.username}`;
      button.classList.add("is-signed-in");
    } else {
      button.textContent = "Giriş Yap / Kaydol";
      button.classList.remove("is-signed-in");
    }
  };

  const start2FACountdown = (seconds = 300) => {
    clearInterval(countdownInterval);
    let remain = seconds;
    const tick = () => {
      const min = Math.floor(remain / 60);
      const sec = remain % 60;
      const cdEl = document.querySelector("#account2FACountdown");
      if (cdEl) cdEl.textContent = `${min}:${sec < 10 ? '0' : ''}${sec}`;
      if (remain <= 0) {
        clearInterval(countdownInterval);
        if (cdEl) cdEl.textContent = "Süre Doldu";
      }
      remain--;
    };
    tick();
    countdownInterval = setInterval(tick, 1000);
  };

  const render = (nextMode = mode) => {
    mode = nextMode;
    is2FAActive = false;
    activeChallengeId = null;
    clearInterval(countdownInterval);

    const session = getLocalSession(storage);
    const signedIn = Boolean(session);
    form.style.display = signedIn ? "none" : "grid";
    logoutButton.style.display = signedIn ? "block" : "none";
    switchButton.style.display = signedIn ? "none" : "block";

    const standardFields = document.querySelector("#accountStandardFields");
    const twoFAFields = document.querySelector("#account2FAFields");
    const openAdminBtn = document.querySelector("#accountOpenAdminBtn");
    const confirmLabel = confirmInput ? confirmInput.closest("label") : null;
    const codeIn = document.querySelector("#account2FACodeInput");

    if (standardFields) standardFields.style.display = "grid";
    if (twoFAFields) twoFAFields.style.display = "none";
    if (openAdminBtn) openAdminBtn.style.display = (session?.isAdmin ? "block" : "none");

    if (usernameInput) usernameInput.disabled = false;
    if (passwordInput) passwordInput.disabled = false;
    if (codeIn) {
      codeIn.disabled = true;
      codeIn.required = false;
    }

    if (signedIn) {
      if (session.isAdmin) {
        title.textContent = `🛡️ Yetkili: ${session.username}`;
        description.textContent = "Monarch Store yönetim oturumunuz aktif. Yönetim panelini açabilir veya çıkış yapabilirsiniz.";
      } else {
        title.textContent = `Merhaba, ${session.username}`;
        description.textContent = "Bu tarayıcıda oturumunuz açık. Siparişlerinizi takip edebilir veya çıkış yapabilirsiniz.";
      }
      return;
    }

    const isRegister = mode === "register";
    title.textContent = isRegister ? "Yeni Hesap Oluştur" : "Hesabına Giriş Yap";
    description.textContent = isRegister 
      ? "Sipariş ve talepleriniz için hesabınızı oluşturun." 
      : "Kullanıcı adı ve şifrenizi girerek oturum açın.";

    if (confirmLabel) {
      confirmLabel.style.display = isRegister ? "grid" : "none";
    }
    if (confirmInput) {
      confirmInput.disabled = !isRegister;
      confirmInput.required = isRegister;
    }

    submitButton.textContent = isRegister ? "Hesabı Oluştur" : "Giriş Yap";
    switchButton.textContent = isRegister 
      ? "Zaten hesabın var mı? Giriş yap" 
      : "Hesabın yok mu? Kayıt ol";
  };

  const show2FAView = (challengeId) => {
    is2FAActive = true;
    activeChallengeId = challengeId;
    title.textContent = "🔐 2FA Güvenlik Doğrulaması";
    description.textContent = "Yetkili hesabı algılandı. Discord güvenlik kodunuzu girin.";

    const standardFields = document.querySelector("#accountStandardFields");
    const twoFAFields = document.querySelector("#account2FAFields");
    if (standardFields) standardFields.style.display = "none";
    if (twoFAFields) twoFAFields.style.display = "grid";

    if (usernameInput) usernameInput.disabled = true;
    if (passwordInput) passwordInput.disabled = true;

    const codeIn = document.querySelector("#account2FACodeInput");
    if (codeIn) {
      codeIn.disabled = false;
      codeIn.required = true;
      codeIn.value = "";
      setTimeout(() => codeIn.focus(), 30);
    }

    submitButton.textContent = "Doğrula ve Giriş Yap";
    switchButton.style.display = "none";
    start2FACountdown(300);
  };

  button.addEventListener("click", () => {
    render();
    dialog.showModal();
  });

  closeButton.addEventListener("click", () => {
    clearInterval(countdownInterval);
    dialog.close();
  });

  switchButton.addEventListener("click", () => render(mode === "register" ? "login" : "register"));
  
  logoutButton.addEventListener("click", () => {
    signOutLocalAccount(storage);
    updateHeader();
    dialog.close();
    notify("Çıkış Yapıldı", "Oturumunuz bu cihazdan kapatıldı.");
  });

  const openAdminBtn = document.querySelector("#accountOpenAdminBtn");
  if (openAdminBtn) {
    openAdminBtn.addEventListener("click", () => {
      dialog.close();
      if (onOpenAdminDashboard) onOpenAdminDashboard();
    });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    // 2FA Kodu Doğrulama Aşaması
    if (is2FAActive) {
      const codeIn = document.querySelector("#account2FACodeInput");
      const code = codeIn ? codeIn.value.trim() : "";
      if (!code || !activeChallengeId) return;

      submitButton.disabled = true;
      submitButton.textContent = "Doğrulanıyor…";
      try {
        await verifyAdmin2FA(activeChallengeId, code);
        clearInterval(countdownInterval);
        form.reset();
        updateHeader();
        dialog.close();
        notify("Giriş Başarılı", "Monarch Store yönetim paneline hoş geldiniz.");
        if (onOpenAdminDashboard) onOpenAdminDashboard();
      } catch (error) {
        notify("Doğrulama Başarısız", error?.message || "Geçersiz veya süresi dolmuş kod.");
        if (codeIn) codeIn.focus();
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Doğrula ve Giriş Yap";
      }
      return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    try {
      submitButton.disabled = true;
      submitButton.textContent = "Lütfen bekleyin…";

      if (mode === "register") {
        if (password !== confirmInput.value) throw new Error("Şifreler eşleşmiyor.");
        const account = await createLocalAccount(storage, username, password);
        form.reset();
        updateHeader();
        dialog.close();
        notify("Hesap Oluşturuldu", `${account.username} olarak oturum açtınız.`);
      } else {
        // Giriş Modu: Önce Admin & 2FA Kontrolü Yap
        try {
          const adminReq = await requestAdmin2FA(username, password);
          if (adminReq?.success && adminReq?.challenge_id) {
            submitButton.disabled = false;
            show2FAView(adminReq.challenge_id);
            notify("2FA Kodu Gönderildi", "Discord #admin-2fa kanalına güvenlik kodu iletildi.");
            return;
          }
        } catch {
          // Admin eşleşmesi yoksa normal kullanıcı olarak devam et
        }

        const account = await signInLocalAccount(storage, username, password);
        form.reset();
        updateHeader();
        dialog.close();
        notify("Giriş Yapıldı", `${account.username} olarak oturum açtınız.`);
      }
    } catch (error) {
      notify("İşlem Başarısız", error instanceof Error ? error.message : "Kullanıcı adı veya şifre hatalı.");
    } finally {
      submitButton.disabled = false;
      if (!is2FAActive) submitButton.textContent = mode === "register" ? "Hesabı Oluştur" : "Giriş Yap";
    }
  });

  updateHeader();
}

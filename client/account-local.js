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

function saveSession(storage, username, extra = {}) {
  storage.setItem(SESSION_KEY, JSON.stringify({ username, ...extra, signedInAt: Date.now() }));
}

export function getLocalSession(storage) {
  const adminSession = getAdminSession();
  if (adminSession) {
    return { username: adminSession.username, isAdmin: true, discordUsername: sessionStorage.getItem('monarch_admin_discord_user') || null };
  }
  try {
    const session = JSON.parse(storage.getItem(SESSION_KEY) ?? "null");
    return session && typeof session.username === "string" ? session : null;
  } catch {
    return null;
  }
}

export async function createLocalAccount(storage, usernameInput, password, discordUsername = null) {
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

  const cleanDiscord = discordUsername ? discordUsername.replace(/^@/, '').trim() : null;

  accounts.push({
    username,
    normalized,
    discordUsername: cleanDiscord,
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  });
  saveAccounts(storage, accounts);
  saveSession(storage, username, { discordUsername: cleanDiscord });
  return { username, discordUsername: cleanDiscord };
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

  saveSession(storage, account.username, { discordUsername: account.discordUsername });
  return { username: account.username, discordUsername: account.discordUsername };
}

export function signOutLocalAccount(storage) {
  clearAdminSession();
  sessionStorage.removeItem('monarch_admin_discord_user');
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
      const disc = session.discordUsername ? ` (@${session.discordUsername})` : '';
      button.textContent = `🛡️ Admin: ${session.username}${disc}`;
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
    const discordInput = document.querySelector("#accountDiscordUsername");
    const codeIn = document.querySelector("#account2FACodeInput");

    if (standardFields) standardFields.style.display = "grid";
    if (twoFAFields) twoFAFields.style.display = "none";
    if (openAdminBtn) openAdminBtn.style.display = (session?.isAdmin ? "block" : "none");

    if (usernameInput) {
      usernameInput.disabled = false;
      usernameInput.readOnly = false;
    }
    if (passwordInput) {
      passwordInput.disabled = false;
      passwordInput.readOnly = false;
    }
    if (discordInput) {
      discordInput.disabled = false;
      discordInput.readOnly = false;
    }
    if (codeIn) {
      codeIn.disabled = false;
      codeIn.readOnly = false;
      codeIn.value = "";
    }

    if (signedIn) {
      if (session.isAdmin) {
        const discText = session.discordUsername ? ` (@${session.discordUsername})` : '';
        title.textContent = `🛡️ Yetkili: ${session.username}${discText}`;
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
      : "Kullanıcı adı, şifreniz ve Discord adınızla giriş yapın.";

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

  const show2FAView = (challengeId, passedDiscordUser = "") => {
    is2FAActive = true;
    activeChallengeId = challengeId;
    title.textContent = "🔐 2FA Güvenlik Doğrulaması";
    description.textContent = "Yetkili hesabı algılandı. Discord #admin-2fa kanalına gelen kodu girin.";

    const standardFields = document.querySelector("#accountStandardFields");
    const twoFAFields = document.querySelector("#account2FAFields");
    if (standardFields) standardFields.style.display = "none";
    if (twoFAFields) twoFAFields.style.display = "grid";

    const disc2FAIn = document.querySelector("#account2FADiscordUser");
    if (disc2FAIn && passedDiscordUser) {
      disc2FAIn.value = passedDiscordUser;
    }

    const codeIn = document.querySelector("#account2FACodeInput");
    if (codeIn) {
      codeIn.disabled = false;
      codeIn.readOnly = false;
      codeIn.required = true;
      codeIn.value = "";
      setTimeout(() => {
        codeIn.focus();
        codeIn.select();
      }, 50);
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
      const discIn = document.querySelector("#account2FADiscordUser");
      const code = codeIn ? codeIn.value.trim() : "";
      const discordUser = discIn ? discIn.value.trim().replace(/^@/, '') : "";
      if (!code || !activeChallengeId) return;

      submitButton.disabled = true;
      submitButton.textContent = "Doğrulanıyor…";
      try {
        const res = await verifyAdmin2FA(activeChallengeId, code, discordUser);
        if (discordUser) {
          sessionStorage.setItem('monarch_admin_discord_user', discordUser);
        }
        clearInterval(countdownInterval);
        form.reset();
        updateHeader();
        dialog.close();
        notify("Giriş Başarılı", "Monarch Store yönetim paneline hoş geldiniz.");
        if (onOpenAdminDashboard) onOpenAdminDashboard();
      } catch (error) {
        notify("Doğrulama Başarısız", error?.message || "Geçersiz veya süresi dolmuş kod.");
        if (codeIn) {
          codeIn.disabled = false;
          codeIn.readOnly = false;
          codeIn.focus();
        }
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Doğrula ve Giriş Yap";
      }
      return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const discordInput = document.querySelector("#accountDiscordUsername");
    const discordUser = discordInput ? discordInput.value.trim().replace(/^@/, '') : "";

    try {
      submitButton.disabled = true;
      submitButton.textContent = "Lütfen bekleyin…";

      if (mode === "register") {
        if (password !== confirmInput.value) throw new Error("Şifreler eşleşmiyor.");
        const account = await createLocalAccount(storage, username, password, discordUser);
        form.reset();
        updateHeader();
        dialog.close();
        notify("Hesap Oluşturuldu", `${account.username} olarak oturum açtınız.`);
      } else {
        // Giriş Modu: Önce Admin & 2FA Kontrolü Yap
        try {
          const adminReq = await requestAdmin2FA(username, password, discordUser);
          if (adminReq?.success && adminReq?.challenge_id) {
            if (discordUser) {
              sessionStorage.setItem('monarch_admin_discord_user', discordUser);
            }
            submitButton.disabled = false;
            show2FAView(adminReq.challenge_id, discordUser);
            notify("2FA Kodu Gönderildi", `Discord #admin-2fa kanalına etiketli bildirim iletildi.`);
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

import { sha256, requestAdmin2FA, verifyAdmin2FA, clearAdminSession } from './admin-panel.js';

const STORAGE_KEY = "monarch_accounts_v1";
const SESSION_KEY = "monarch_session_v1";

function loadAccounts(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAccounts(storage, accounts) {
  storage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function getLocalSession(storage = window.localStorage) {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(storage, username, extra = {}) {
  storage.setItem(
    SESSION_KEY,
    JSON.stringify({
      username,
      createdAt: new Date().toISOString(),
      ...extra
    })
  );
}

export async function createLocalAccount(storage, username, password, discordUsername = "") {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 24) {
    throw new Error("Kullanıcı adı 3 ile 24 karakter arasında olmalıdır.");
  }
  if (password.length < 6) {
    throw new Error("Şifre en az 6 karakter olmalıdır.");
  }

  const accounts = loadAccounts(storage);
  const exists = accounts.some(acc => acc.normalized === normalized);
  if (exists) {
    throw new Error("Bu kullanıcı adı zaten alınmış.");
  }

  const passwordHash = await sha256(password);
  const newAccount = {
    username: username.trim(),
    normalized,
    passwordHash,
    discordUsername: discordUsername.trim(),
    createdAt: new Date().toISOString()
  };

  accounts.push(newAccount);
  saveAccounts(storage, accounts);
  saveSession(storage, newAccount.username, { discordUsername: newAccount.discordUsername });
  return { username: newAccount.username, discordUsername: newAccount.discordUsername };
}

export async function signInLocalAccount(storage, username, password) {
  const normalized = username.trim().toLowerCase();
  const passwordHash = await sha256(password);
  const accounts = loadAccounts(storage);
  const account = accounts.find(
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
  localStorage.removeItem('monarch_admin_discord_user');
  storage.removeItem(SESSION_KEY);
}

export function bindLocalAccountUI({ button, dialog, closeButton, form, usernameInput, passwordInput, confirmInput, title, description, submitButton, logoutButton, notify, onOpenAdminDashboard }) {
  const storage = window.localStorage;
  let mode = "login"; // Varsayılan olarak Giriş Yap modu
  let is2FAActive = false;
  let activeChallengeId = null;
  let countdownInterval = null;

  const tabLogin = document.querySelector("#accountTabLogin");
  const tabRegister = document.querySelector("#accountTabRegister");
  const togglePwdBtn = document.querySelector("#accountTogglePwd");

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

    const modalTabs = document.querySelector("#accountModalTabs");
    if (modalTabs) modalTabs.style.display = signedIn ? "none" : "flex";

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
      usernameInput.required = true;
    }
    if (passwordInput) {
      passwordInput.disabled = false;
      passwordInput.readOnly = false;
      passwordInput.required = true;
    }
    if (discordInput) {
      discordInput.disabled = false;
      discordInput.readOnly = false;
    }
    if (codeIn) {
      codeIn.disabled = false;
      codeIn.readOnly = false;
      codeIn.required = false;
      codeIn.value = "";
    }

    if (signedIn) {
      if (session.isAdmin) {
        const discText = session.discordUsername ? ` (@${session.discordUsername})` : '';
        title.textContent = `Yetkili: ${session.username}${discText}`;
        description.textContent = "Monarch Store yönetim oturumunuz aktif.";
      } else {
        title.textContent = `Merhaba, ${session.username}`;
        description.textContent = "Oturumunuz aktif. Siparişlerinizi takip edebilirsiniz.";
      }
      return;
    }

    const isRegister = mode === "register";
    if (tabLogin) tabLogin.classList.toggle("active", !isRegister);
    if (tabRegister) tabRegister.classList.toggle("active", isRegister);

    title.textContent = isRegister ? "Yeni Hesap Oluştur" : "Hesabına Giriş Yap";
    description.textContent = isRegister 
      ? "Sipariş ve talepleriniz için hesabınızı oluşturun." 
      : "Kullanıcı adı ve şifrenizle giriş yapın.";

    if (confirmLabel) {
      confirmLabel.style.display = isRegister ? "grid" : "none";
    }
    if (confirmInput) {
      confirmInput.disabled = !isRegister;
      confirmInput.required = isRegister;
    }

    submitButton.textContent = isRegister ? "Hesap Oluştur ➔" : "Giriş Yap ➔";
  };

  const show2FAView = (challengeId, passedDiscordUser = "") => {
    is2FAActive = true;
    activeChallengeId = challengeId;
    title.textContent = "2FA Güvenlik Doğrulaması";
    description.textContent = "Admin yetkisi algılandı. Discord #admin-2fa kanalına gelen 6 haneli kodu girin.";

    const modalTabs = document.querySelector("#accountModalTabs");
    if (modalTabs) modalTabs.style.display = "none";

    const standardFields = document.querySelector("#accountStandardFields");
    const twoFAFields = document.querySelector("#account2FAFields");
    if (standardFields) standardFields.style.display = "none";
    if (twoFAFields) twoFAFields.style.display = "grid";

    // Standard alanların required özelliğini kaldır (gizli element doğrulama hatasını engeller)
    if (usernameInput) usernameInput.required = false;
    if (passwordInput) passwordInput.required = false;
    if (confirmInput) confirmInput.required = false;

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

    submitButton.textContent = "Doğrula ve Giriş Yap 🔓";
    start2FACountdown(300);
  };

  if (tabLogin) tabLogin.addEventListener("click", () => render("login"));
  if (tabRegister) tabRegister.addEventListener("click", () => render("register"));

  if (togglePwdBtn) {
    togglePwdBtn.addEventListener("click", () => {
      if (!passwordInput) return;
      const isPwd = passwordInput.type === "password";
      passwordInput.type = isPwd ? "text" : "password";
      togglePwdBtn.textContent = isPwd ? "🙈" : "👁️";
    });
  }

  button.addEventListener("click", () => {
    const session = getLocalSession(storage);
    if (session?.isAdmin) {
      window.open('admin.html', '_blank');
      return;
    }
    render();
    dialog.showModal();
  });

  closeButton.addEventListener("click", () => {
    clearInterval(countdownInterval);
    dialog.close();
  });
  
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
      window.open('admin.html', '_blank');
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
        await verifyAdmin2FA(activeChallengeId, code, discordUser);
        if (discordUser) {
          sessionStorage.setItem('monarch_admin_discord_user', discordUser);
          localStorage.setItem('monarch_admin_discord_user', discordUser);
        }
        saveSession(storage, 'admin', { isAdmin: true, discordUsername: discordUser });
        clearInterval(countdownInterval);
        form.reset();
        updateHeader();
        dialog.close();
        notify("Giriş Başarılı", "Monarch Store yönetim paneli yeni sekmede açılıyor...");
        window.open('admin.html', '_blank');
      } catch (error) {
        notify("Doğrulama Başarısız", error?.message || "Geçersiz veya süresi dolmuş kod.");
        if (codeIn) {
          codeIn.disabled = false;
          codeIn.readOnly = false;
          codeIn.focus();
        }
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Doğrula ve Giriş Yap 🔓";
      }
      return;
    }

    const rawUsername = usernameInput ? usernameInput.value.trim() : "";
    const rawPassword = passwordInput ? passwordInput.value.trim() : "";
    const discordInput = document.querySelector("#accountDiscordUsername");
    const discordUser = discordInput ? discordInput.value.trim().replace(/^@/, '') : "";

    try {
      submitButton.disabled = true;
      submitButton.textContent = "Kontrol ediliyor…";

      if (mode === "register") {
        if (rawPassword !== (confirmInput ? confirmInput.value.trim() : "")) {
          throw new Error("Şifreler eşleşmiyor.");
        }
        const account = await createLocalAccount(storage, rawUsername, rawPassword, discordUser);
        form.reset();
        updateHeader();
        dialog.close();
        notify("Hesap Oluşturuldu", `${account.username} olarak oturum açtınız.`);
      } else {
        // Giriş Modu:
        // Eğer kullanıcı adı admin ise doğrudan Admin 2FA talebini dene
        if (rawUsername.toLowerCase() === 'admin') {
          try {
            const adminReq = await requestAdmin2FA('admin', rawPassword, discordUser);
            if (adminReq?.success && adminReq?.challenge_id) {
              if (discordUser) {
                sessionStorage.setItem('monarch_admin_discord_user', discordUser);
                localStorage.setItem('monarch_admin_discord_user', discordUser);
              }
              submitButton.disabled = false;
              show2FAView(adminReq.challenge_id, discordUser);
              notify("2FA Kodu Gönderildi", `Discord #admin-2fa kanalına güvenlik kodu iletildi.`);
              return;
            }
          } catch (adminErr) {
            throw new Error(adminErr.message || "Admin şifresi hatalı.");
          }
        }

        // Normal Kullanıcı Girişi
        try {
          const userAccount = await signInLocalAccount(storage, rawUsername, rawPassword);
          form.reset();
          updateHeader();
          dialog.close();
          notify("Giriş Yapıldı", `Hoş geldiniz, ${userAccount.username}`);
        } catch (normalErr) {
          throw normalErr;
        }
      }
    } catch (error) {
      notify("İşlem Başarısız", error?.message || "Giriş yapılamadı.");
    } finally {
      if (!is2FAActive) {
        submitButton.disabled = false;
        submitButton.textContent = mode === "register" ? "Hesabı Oluştur ➔" : "Giriş Yap ➔";
      }
    }
  });

  updateHeader();
}

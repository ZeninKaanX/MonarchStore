import { sha256, requestAdmin2FA, verifyAdmin2FA, clearAdminSession } from './admin-panel.js';

const STORAGE_KEY = "monarch_accounts_v1";
const SESSION_KEY = "monarch_session_v1";
const OTP_STORAGE_KEY = "monarch_email_otp_v1";

export const DEFAULT_AVATAR_URL = 'images/default-avatar.jpg';

export const DEFAULT_AVATARS = [
  { id: 'default', name: 'L / Anime Profil', url: 'images/default-avatar.jpg' },
  { id: 'lena', name: 'Lena Komutanı', url: 'images/lena-officer-avatar.jpg' },
  { id: 'mascot', name: 'Monarch Maskot', url: 'images/mascot.webp' },
  { id: 'hero', name: 'Saha Operatörü', url: 'images/hero-whitehair.webp' }
];

export function loadAccounts(storage = window.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAccounts(storage, accounts) {
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

export function saveSession(storage, username, extra = {}) {
  storage.setItem(
    SESSION_KEY,
    JSON.stringify({
      username,
      createdAt: new Date().toISOString(),
      ...extra
    })
  );
}

export function getAccountByUsername(storage, username) {
  const normalized = (username || '').trim().toLowerCase();
  const accounts = loadAccounts(storage);
  return accounts.find(acc => acc.normalized === normalized) || null;
}

export async function createLocalAccount(storage, username, password, discordUsername = "", email = "") {
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
    throw new Error("Bu kullanıcı adı zaten alınmış. Lütfen 'Giriş Yap' sekmesinden giriş yapın.");
  }

  const passwordHash = await sha256(password);
  const newAccount = {
    username: username.trim(),
    normalized,
    passwordHash,
    discordUsername: discordUsername.trim().replace(/^@/, ''),
    email: email.trim().toLowerCase(),
    emailVerified: false,
    avatarUrl: DEFAULT_AVATARS[0].url,
    createdAt: new Date().toISOString()
  };

  accounts.push(newAccount);
  saveAccounts(storage, accounts);
  saveSession(storage, newAccount.username, {
    discordUsername: newAccount.discordUsername,
    email: newAccount.email,
    emailVerified: newAccount.emailVerified,
    avatarUrl: newAccount.avatarUrl
  });
  return newAccount;
}

export async function signInLocalAccount(storage, username, password) {
  const normalized = username.trim().toLowerCase();
  const passwordHash = await sha256(password);
  const accounts = loadAccounts(storage);
  const account = accounts.find(
    candidate => candidate.normalized === normalized && candidate.passwordHash === passwordHash
  );

  if (!account) {
    const exists = accounts.some(candidate => candidate.normalized === normalized);
    if (!exists) {
      throw new Error("not_registered");
    }
    throw new Error("Şifre hatalı. Lütfen kontrol edin.");
  }

  if (!account.avatarUrl) {
    account.avatarUrl = DEFAULT_AVATARS[0].url;
    saveAccounts(storage, accounts);
  }

  saveSession(storage, account.username, {
    discordUsername: account.discordUsername || '',
    email: account.email || '',
    emailVerified: Boolean(account.emailVerified),
    avatarUrl: account.avatarUrl || DEFAULT_AVATARS[0].url
  });
  return account;
}

export function signOutLocalAccount(storage) {
  clearAdminSession();
  sessionStorage.removeItem('monarch_admin_discord_user');
  localStorage.removeItem('monarch_admin_discord_user');
  storage.removeItem(SESSION_KEY);
}

// Profil Güncelleme & Şifre Değiştirme
export async function updateLocalAccountProfile(storage, username, { avatarUrl, discordUsername, email, currentPassword, newPassword }) {
  const normalized = (username || '').trim().toLowerCase();
  const accounts = loadAccounts(storage);
  const account = accounts.find(acc => acc.normalized === normalized);
  if (!account) throw new Error("Kullanıcı hesabı bulunamadı.");

  if (avatarUrl) {
    account.avatarUrl = avatarUrl;
  }
  if (typeof discordUsername === 'string') {
    account.discordUsername = discordUsername.trim().replace(/^@/, '');
  }
  if (email && email.toLowerCase() !== account.email) {
    account.email = email.trim().toLowerCase();
    account.emailVerified = false;
  }

  if (newPassword) {
    if (!currentPassword) {
      throw new Error("Şifrenizi değiştirmek için lütfen mevcut şifrenizi girin.");
    }
    const currentHash = await sha256(currentPassword);
    if (account.passwordHash !== currentHash) {
      throw new Error("Mevcut şifreniz hatalı.");
    }
    if (newPassword.length < 6) {
      throw new Error("Yeni şifre en az 6 karakter olmalıdır.");
    }
    account.passwordHash = await sha256(newPassword);
  }

  saveAccounts(storage, accounts);
  saveSession(storage, account.username, {
    discordUsername: account.discordUsername,
    email: account.email,
    emailVerified: account.emailVerified,
    avatarUrl: account.avatarUrl
  });

  return account;
}

// E-Posta Doğrulama Kodu Üretme (OTP)
export function sendEmailVerificationCode(storage, email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error("Lütfen geçerli bir e-posta adresi girin.");
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  const otpData = {
    email: cleanEmail,
    code,
    expiresAt,
    createdAt: Date.now()
  };

  storage.setItem(OTP_STORAGE_KEY, JSON.stringify(otpData));
  return { code, expiresAt, email: cleanEmail };
}

// E-Posta Kodunu Doğrulama
export function verifyEmailCode(storage, email, inputCode, username = "") {
  const raw = storage.getItem(OTP_STORAGE_KEY);
  if (!raw) throw new Error("Doğrulama kodu bulunamadı. Lütfen yeni bir kod isteyin.");

  const otpData = JSON.parse(raw);
  const cleanEmail = (email || '').trim().toLowerCase();

  if (otpData.email !== cleanEmail) {
    throw new Error("Doğrulama kodu bu e-posta adresi için üretilmedi.");
  }
  if (Date.now() > otpData.expiresAt) {
    throw new Error("Doğrulama kodunun süresi dolmuş (5 dakika). Lütfen yeni kod isteyin.");
  }
  if (otpData.code !== inputCode.trim()) {
    throw new Error("Doğrulama kodu hatalı.");
  }

  if (username) {
    const normalized = username.trim().toLowerCase();
    const accounts = loadAccounts(storage);
    const account = accounts.find(acc => acc.normalized === normalized);
    if (account) {
      account.email = cleanEmail;
      account.emailVerified = true;
      saveAccounts(storage, accounts);
      saveSession(storage, account.username, {
        discordUsername: account.discordUsername,
        email: account.email,
        emailVerified: true,
        avatarUrl: account.avatarUrl
      });
    }
  }

  storage.removeItem(OTP_STORAGE_KEY);
  return true;
}

// E-Posta Kodu ile Şifre Sıfırlama
export async function resetPasswordWithEmail(storage, email, inputCode, newPassword) {
  if (newPassword.length < 6) {
    throw new Error("Yeni şifre en az 6 karakter olmalıdır.");
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const accounts = loadAccounts(storage);
  const account = accounts.find(acc => (acc.email || '').toLowerCase() === cleanEmail);
  if (!account) {
    throw new Error("Bu e-posta adresine kayıtlı hesap bulunamadı.");
  }

  verifyEmailCode(storage, cleanEmail, inputCode, account.username);

  account.passwordHash = await sha256(newPassword);
  saveAccounts(storage, accounts);

  saveSession(storage, account.username, {
    discordUsername: account.discordUsername,
    email: account.email,
    emailVerified: account.emailVerified,
    avatarUrl: account.avatarUrl
  });

  return account;
}

export function bindLocalAccountUI({ 
  button, 
  dialog, 
  closeButton, 
  form, 
  usernameInput, 
  passwordInput, 
  confirmInput, 
  title, 
  description, 
  submitButton, 
  logoutButton, 
  notify, 
  onOpenAdminDashboard 
}) {
  const storage = window.localStorage;
  let mode = "login";
  let is2FAActive = false;
  let activeChallengeId = null;
  let countdownInterval = null;

  const tabLogin = document.querySelector("#accountTabLogin");
  const tabRegister = document.querySelector("#accountTabRegister");
  const tabForgot = document.querySelector("#accountTabForgot");
  const togglePwdBtn = document.querySelector("#accountTogglePwd");

  const updateHeader = () => {
    const session = getLocalSession(storage);
    if (session?.isAdmin) {
      const disc = session.discordUsername ? ` (@${session.discordUsername})` : '';
      button.textContent = `Admin: ${session.username}${disc}`;
      button.classList.add("is-signed-in");
    } else if (session) {
      button.textContent = `Hesap: ${session.username}`;
      button.classList.add("is-signed-in");
    } else {
      button.textContent = "Giriş Yap / Kaydol";
      button.classList.remove("is-signed-in");
    }
  };

  const startCountdown = (elementSelector, seconds = 300, onExpire) => {
    clearInterval(countdownInterval);
    let remain = seconds;
    const el = document.querySelector(elementSelector);
    const tick = () => {
      const min = Math.floor(remain / 60);
      const sec = remain % 60;
      if (el) el.textContent = `${min}:${sec < 10 ? '0' : ''}${sec}`;
      if (remain <= 0) {
        clearInterval(countdownInterval);
        if (el) el.textContent = "Süre Doldu";
        if (onExpire) onExpire();
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

    const modalTabs = document.querySelector("#accountModalTabs");
    const standardFields = document.querySelector("#accountStandardFields");
    const twoFAFields = document.querySelector("#account2FAFields");
    const forgotFields = document.querySelector("#accountForgotFields");
    const profilePanel = document.querySelector("#accountProfilePanel");
    const openAdminBtn = document.querySelector("#accountOpenAdminBtn");
    const confirmLabel = confirmInput ? confirmInput.closest("label") : null;

    if (signedIn) {
      form.style.display = "none";
      if (modalTabs) modalTabs.style.display = "none";
      if (profilePanel) {
        profilePanel.style.display = "block";
        populateProfilePanel(session);
      }
      if (logoutButton) logoutButton.style.display = "block";
      if (openAdminBtn) openAdminBtn.style.display = (session.isAdmin ? "block" : "none");

      const acc = getAccountByUsername(storage, session.username);
      const avatarImg = document.querySelector("#accountHeroAvatarImg");
      if (avatarImg && (acc?.avatarUrl || session.avatarUrl)) {
        avatarImg.src = acc?.avatarUrl || session.avatarUrl;
      }

      if (title) title.textContent = session.isAdmin ? `Yönetici: ${session.username}` : `Hesabım: ${session.username}`;
      if (description) description.textContent = session.isAdmin 
        ? "Monarch Store yönetim oturumunuz aktif." 
        : "Profilinizi özelleştirebilir, şifrenizi değiştirebilir veya destek taleplerinizi görebilirsiniz.";
      return;
    }

    if (profilePanel) profilePanel.style.display = "none";
    form.style.display = "grid";
    if (modalTabs) modalTabs.style.display = "flex";
    if (logoutButton) logoutButton.style.display = "none";
    if (openAdminBtn) openAdminBtn.style.display = "none";

    if (tabLogin) tabLogin.classList.toggle("active", mode === "login");
    if (tabRegister) tabRegister.classList.toggle("active", mode === "register");
    if (tabForgot) tabForgot.classList.toggle("active", mode === "forgot");

    if (mode === "forgot") {
      if (standardFields) standardFields.style.display = "none";
      if (twoFAFields) twoFAFields.style.display = "none";
      if (forgotFields) forgotFields.style.display = "grid";
      if (title) title.textContent = "Şifremi Unuttum";
      if (description) description.textContent = "Kayıtlı e-posta adresinizi yazarak 6 haneli sıfırlama kodu alın.";
      submitButton.textContent = "Şifreyi Sıfırla";
      return;
    }

    if (standardFields) standardFields.style.display = "grid";
    if (twoFAFields) twoFAFields.style.display = "none";
    if (forgotFields) forgotFields.style.display = "none";

    const isRegister = mode === "register";
    if (title) title.textContent = isRegister ? "Yeni Hesap Oluştur" : "Hesabına Giriş Yap";
    if (description) description.textContent = isRegister 
      ? "Sipariş ve talepleriniz için hesabınızı oluşturun." 
      : "Kullanıcı adı ve şifrenizle giriş yapın.";

    if (confirmLabel) confirmLabel.style.display = isRegister ? "grid" : "none";
    if (confirmInput) {
      confirmInput.disabled = !isRegister;
      confirmInput.required = isRegister;
      if (!isRegister) confirmInput.value = "";
    }

    submitButton.textContent = isRegister ? "Hesap Oluştur" : "Giriş Yap";
  };

  const populateProfilePanel = (session) => {
    const acc = getAccountByUsername(storage, session.username) || {};
    const currentAvatar = acc.avatarUrl || session.avatarUrl || DEFAULT_AVATARS[0].url;
    const isVerified = Boolean(acc.emailVerified || session.emailVerified);
    const regDate = acc.createdAt ? new Date(acc.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '29 Ağu 2026';
    const roleName = session.isAdmin ? 'Yönetici' : 'Müşteri';

    // Sidebar & Banner Elements
    const sidebarAvatar = document.querySelector("#profileSidebarAvatar");
    const bannerAvatar = document.querySelector("#profileBannerAvatar");
    const sidebarUsername = document.querySelector("#profileSidebarUsername");
    const bannerUsername = document.querySelector("#profileBannerUsername");
    const sidebarRole = document.querySelector("#profileSidebarRole");
    const bannerEmail = document.querySelector("#profileBannerEmail");
    const heroAvatar = document.querySelector("#accountHeroAvatarImg");

    if (sidebarAvatar) sidebarAvatar.src = currentAvatar;
    if (bannerAvatar) bannerAvatar.src = currentAvatar;
    if (heroAvatar) heroAvatar.src = currentAvatar;
    if (sidebarUsername) sidebarUsername.textContent = session.username;
    if (bannerUsername) bannerUsername.textContent = session.username;
    if (sidebarRole) sidebarRole.textContent = roleName;
    if (bannerEmail) bannerEmail.textContent = acc.email || session.email || 'E-posta tanımlanmamış';

    // Grid Info Cards
    const gridEmail = document.querySelector("#profileGridEmail");
    const gridDiscord = document.querySelector("#profileGridDiscord");
    const gridRegDate = document.querySelector("#profileGridRegDate");
    const grid2FA = document.querySelector("#profileGrid2FA");

    if (gridEmail) gridEmail.textContent = acc.email || session.email || 'Tanımlanmamış';
    if (gridDiscord) gridDiscord.textContent = acc.discordUsername || session.discordUsername ? `@${acc.discordUsername || session.discordUsername}` : 'Belirtilmedi';
    if (gridRegDate) gridRegDate.textContent = regDate;
    if (grid2FA) grid2FA.textContent = session.isAdmin ? '2FA Aktif (Discord)' : (isVerified ? 'Aktif (E-Posta OTP)' : 'Doğrulama Bekliyor');

    // Form inputs
    const discIn = document.querySelector("#profileDiscordInput");
    const emailIn = document.querySelector("#profileEmailInput");
    const emailBadge = document.querySelector("#profileEmailBadge");
    const emailVerifyBtn = document.querySelector("#profileSendEmailCodeBtn");
    const userDisplay = document.querySelector("#profileUsernameDisplay");

    if (userDisplay) userDisplay.textContent = session.username;
    if (discIn) discIn.value = acc.discordUsername || session.discordUsername || '';
    if (emailIn) emailIn.value = acc.email || session.email || '';

    if (emailBadge) {
      emailBadge.textContent = isVerified ? "✓ Doğrulandı" : "Doğrulanmamış";
      emailBadge.style.color = isVerified ? "#22c55e" : "#f59e0b";
      emailBadge.style.borderColor = isVerified ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)";
    }
    if (emailVerifyBtn) {
      emailVerifyBtn.style.display = isVerified ? "none" : "inline-block";
    }

    document.querySelectorAll(".avatar-select-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.url === currentAvatar);
    });
  };

  const show2FAView = (challengeId, passedDiscordUser = "") => {
    is2FAActive = true;
    activeChallengeId = challengeId;
    if (title) title.textContent = "2FA Güvenlik Doğrulaması";
    if (description) description.textContent = "Admin yetkisi algılandı. Discord #admin-2fa kanalına gelen 6 haneli kodu girin.";

    const modalTabs = document.querySelector("#accountModalTabs");
    if (modalTabs) modalTabs.style.display = "none";

    const standardFields = document.querySelector("#accountStandardFields");
    const twoFAFields = document.querySelector("#account2FAFields");
    const forgotFields = document.querySelector("#accountForgotFields");
    if (standardFields) standardFields.style.display = "none";
    if (forgotFields) forgotFields.style.display = "none";
    if (twoFAFields) twoFAFields.style.display = "grid";

    const disc2FAIn = document.querySelector("#account2FADiscordUser");
    if (disc2FAIn && passedDiscordUser) disc2FAIn.value = passedDiscordUser;

    const codeIn = document.querySelector("#account2FACodeInput");
    if (codeIn) {
      codeIn.value = "";
      setTimeout(() => codeIn.focus(), 50);
    }

    submitButton.textContent = "Doğrula ve Giriş Yap";
    startCountdown("#account2FACountdown", 300);
  };

  if (tabLogin) tabLogin.addEventListener("click", () => render("login"));
  if (tabRegister) tabRegister.addEventListener("click", () => render("register"));
  if (tabForgot) tabForgot.addEventListener("click", () => render("forgot"));

  if (togglePwdBtn) {
    togglePwdBtn.addEventListener("click", () => {
      if (!passwordInput) return;
      const isPwd = passwordInput.type === "password";
      passwordInput.type = isPwd ? "text" : "password";
      togglePwdBtn.textContent = isPwd ? "GİZLE" : "GÖSTER";
    });
  }

  // Profil Avatar Seçimi
  document.querySelectorAll(".avatar-select-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const session = getLocalSession(storage);
      if (!session) return;
      const avatarUrl = btn.dataset.url;
      try {
        await updateLocalAccountProfile(storage, session.username, { avatarUrl });
        document.querySelectorAll(".avatar-select-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const avatarImg = document.querySelector("#accountHeroAvatarImg");
        if (avatarImg) avatarImg.src = avatarUrl;
        notify("Avatar Güncellendi", `${btn.dataset.name} profil resminiz olarak ayarlandı.`);
      } catch (err) {
        notify("Hata", err.message);
      }
    });
  });

  // Profil Kaydetme
  const profileSaveBtn = document.querySelector("#profileSaveBtn");
  if (profileSaveBtn) {
    profileSaveBtn.addEventListener("click", async () => {
      const session = getLocalSession(storage);
      if (!session) return;
      const discIn = document.querySelector("#profileDiscordInput");
      const emailIn = document.querySelector("#profileEmailInput");
      const curPwdIn = document.querySelector("#profileCurrentPwdInput");
      const newPwdIn = document.querySelector("#profileNewPwdInput");

      try {
        profileSaveBtn.disabled = true;
        profileSaveBtn.textContent = "Kaydediliyor…";
        await updateLocalAccountProfile(storage, session.username, {
          discordUsername: discIn ? discIn.value.trim() : undefined,
          email: emailIn ? emailIn.value.trim() : undefined,
          currentPassword: curPwdIn ? curPwdIn.value : undefined,
          newPassword: newPwdIn && newPwdIn.value ? newPwdIn.value : undefined
        });

        if (curPwdIn) curPwdIn.value = "";
        if (newPwdIn) newPwdIn.value = "";
        populateProfilePanel(getLocalSession(storage));
        updateHeader();
        notify("Profil Güncellendi", "Profil bilgileriniz ve ayarlarınız başarıyla kaydedildi.");
      } catch (err) {
        notify("Profil Güncellenemedi", err.message);
      } finally {
        profileSaveBtn.disabled = false;
        profileSaveBtn.textContent = "Değişiklikleri Kaydet";
      }
    });
  }

  // Profil E-Posta Kod Gönder
  const profileSendCodeBtn = document.querySelector("#profileSendEmailCodeBtn");
  if (profileSendCodeBtn) {
    profileSendCodeBtn.addEventListener("click", () => {
      const emailIn = document.querySelector("#profileEmailInput");
      const email = emailIn ? emailIn.value.trim() : "";
      try {
        const { code } = sendEmailVerificationCode(storage, email);
        const codePrompt = document.querySelector("#profileEmailCodePrompt");
        if (codePrompt) codePrompt.style.display = "block";
        startCountdown("#profileEmailCountdown", 300);
        notify("Doğrulama Kodu Üretildi", `6 Haneli Güvenlik Kodunuz: ${code} (5 dakika geçerlidir).`);
      } catch (err) {
        notify("Kod Gönderilemedi", err.message);
      }
    });
  }

  // Profil E-Posta Kodu Onayla
  const profileVerifyCodeBtn = document.querySelector("#profileVerifyEmailCodeBtn");
  if (profileVerifyCodeBtn) {
    profileVerifyCodeBtn.addEventListener("click", () => {
      const session = getLocalSession(storage);
      const emailIn = document.querySelector("#profileEmailInput");
      const codeIn = document.querySelector("#profileEmailOtpInput");
      const email = emailIn ? emailIn.value.trim() : "";
      const code = codeIn ? codeIn.value.trim() : "";

      try {
        verifyEmailCode(storage, email, code, session ? session.username : "");
        const codePrompt = document.querySelector("#profileEmailCodePrompt");
        if (codePrompt) codePrompt.style.display = "none";
        populateProfilePanel(getLocalSession(storage));
        notify("E-Posta Doğrulandı", "E-posta adresiniz başarıyla doğrulandı.");
      } catch (err) {
        notify("Doğrulama Başarısız", err.message);
      }
    });
  }

  // Şifremi Unuttum Kod Gönder
  const forgotSendCodeBtn = document.querySelector("#forgotSendCodeBtn");
  if (forgotSendCodeBtn) {
    forgotSendCodeBtn.addEventListener("click", () => {
      const emailIn = document.querySelector("#forgotEmailInput");
      const email = emailIn ? emailIn.value.trim() : "";
      try {
        const { code } = sendEmailVerificationCode(storage, email);
        startCountdown("#forgotCountdown", 300);
        notify("Sıfırlama Kodu Üretildi", `6 Haneli Sıfırlama Kodunuz: ${code} (5 dakika geçerlidir).`);
      } catch (err) {
        notify("Kod Üretilemedi", err.message);
      }
    });
  }

  // Destek Taleplerimi Aç Kısayolu
  document.querySelectorAll("#profileOpenSupportBtn, .btn-open-support").forEach(btn => {
    btn.addEventListener("click", () => {
      dialog.close();
      const supportDialog = document.querySelector("#supportDialog");
      if (supportDialog) {
        supportDialog.showModal();
        const tabTickets = document.querySelector("#supportTabMyTickets");
        if (tabTickets) tabTickets.click();
      }
    });
  });

  button.addEventListener("click", () => {
    const session = getLocalSession(storage);
    if (session?.isAdmin) {
      window.open('admin.html', '_blank');
      return;
    }
    render(session ? "profile" : "login");
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
        submitButton.textContent = "Doğrula ve Giriş Yap";
      }
      return;
    }

    if (mode === "forgot") {
      const forgotEmailIn = document.querySelector("#forgotEmailInput");
      const forgotCodeIn = document.querySelector("#forgotCodeInput");
      const forgotNewPwdIn = document.querySelector("#forgotNewPasswordInput");

      const email = forgotEmailIn ? forgotEmailIn.value.trim() : "";
      const code = forgotCodeIn ? forgotCodeIn.value.trim() : "";
      const newPwd = forgotNewPwdIn ? forgotNewPwdIn.value : "";

      try {
        submitButton.disabled = true;
        submitButton.textContent = "Sıfırlanıyor…";
        await resetPasswordWithEmail(storage, email, code, newPwd);
        form.reset();
        updateHeader();
        render("profile");
        notify("Şifre Sıfırlandı", "Şifreniz başarıyla güncellendi ve oturumunuz açıldı.");
      } catch (err) {
        notify("İşlem Başarısız", err.message);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Şifreyi Sıfırla";
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
        const confirmVal = confirmInput ? confirmInput.value.trim() : "";
        if (rawPassword !== confirmVal) {
          throw new Error("Şifreler eşleşmiyor. Lütfen iki alana da aynı şifreyi yazın.");
        }
        const account = await createLocalAccount(storage, rawUsername, rawPassword, discordUser);
        form.reset();
        updateHeader();
        dialog.close();
        notify("Hesap Oluşturuldu", `${account.username} olarak oturum açıldı.`);
      } else {
        if (rawUsername.toLowerCase() === 'admin' || rawUsername.toLowerCase() === 'founder') {
          try {
            const adminReq = await requestAdmin2FA(rawUsername.toLowerCase(), rawPassword, discordUser);
            if (adminReq?.success && adminReq?.challenge_id) {
              if (discordUser) {
                sessionStorage.setItem('monarch_admin_discord_user', discordUser);
                localStorage.setItem('monarch_admin_discord_user', discordUser);
              }
              submitButton.disabled = false;
              show2FAView(adminReq.challenge_id, discordUser);
              notify("2FA Kodu Gönderildi", "Discord #admin-2fa kanalına güvenlik kodu iletildi.");
              return;
            }
          } catch (adminErr) {
            throw new Error(adminErr.message || "Admin şifresi hatalı.");
          }
        }

        try {
          const userAccount = await signInLocalAccount(storage, rawUsername, rawPassword);
          form.reset();
          updateHeader();
          dialog.close();
          notify("Giriş Yapıldı", `Hoş geldiniz, ${userAccount.username}`);
        } catch (normalErr) {
          if (normalErr.message === "not_registered") {
            render("register");
            if (usernameInput) usernameInput.value = rawUsername;
            if (passwordInput) passwordInput.value = rawPassword;
            if (confirmInput) {
              confirmInput.value = rawPassword;
              confirmInput.focus();
            }
            notify("Kayıt Bulunamadı", "Bu kullanıcı kayıtlı değil. 'Kaydol' sekmesine geçildi, lütfen 'Hesap Oluştur' butonuna basın.");
            return;
          }
          throw normalErr;
        }
      }
    } catch (error) {
      notify("İşlem Başarısız", error?.message || "Giris yapılamadı.");
    } finally {
      if (!is2FAActive && mode !== "forgot") {
        submitButton.disabled = false;
        submitButton.textContent = mode === "register" ? "Hesap Oluştur" : "Giriş Yap";
      }
    }
  });

  updateHeader();
}

const ACCOUNTS_KEY = "monarch-store.local-accounts.v1";
const SESSION_KEY = "monarch-store.local-session.v1";

function normalizeUsername(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

async function hashPassword(password) {
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

function getLocalSession(storage) {
  try {
    const session = JSON.parse(storage.getItem(SESSION_KEY) ?? "null");
    return session && typeof session.username === "string" ? session : null;
  } catch {
    return null;
  }
}

async function createLocalAccount(storage, usernameInput, password) {
  const username = normalizeUsername(usernameInput);
  if (username.length < 3 || username.length > 24) throw new Error("Kullanıcı adı 3–24 karakter olmalı.");
  if (password.length < 6) throw new Error("Şifre en az 6 karakter olmalı.");
  const accounts = readAccounts(storage);
  const normalized = username.toLocaleLowerCase("tr-TR");
  if (accounts.some(account => account.normalized === normalized)) throw new Error("Bu kullanıcı adı bu cihazda zaten kayıtlı.");
  accounts.push({ username, normalized, passwordHash: await hashPassword(password), createdAt: Date.now() });
  saveAccounts(storage, accounts);
  saveSession(storage, username);
  return { username };
}

async function signInLocalAccount(storage, usernameInput, password) {
  const username = normalizeUsername(usernameInput);
  const normalized = username.toLocaleLowerCase("tr-TR");
  const passwordHash = await hashPassword(password);
  const account = readAccounts(storage).find(candidate => candidate.normalized === normalized && candidate.passwordHash === passwordHash);
  if (!account) throw new Error("Kullanıcı adı veya şifre bu cihazda bulunamadı.");
  saveSession(storage, account.username);
  return { username: account.username };
}

function signOutLocalAccount(storage) {
  storage.removeItem(SESSION_KEY);
}

function bindLocalAccountUI({ button, dialog, closeButton, form, usernameInput, passwordInput, confirmInput, title, description, submitButton, switchButton, logoutButton, notify }) {
  const storage = window.localStorage;
  let mode = "register";
  const updateHeader = () => {
    const session = getLocalSession(storage);
    button.textContent = session ? `Hesap: ${session.username}` : "Hesap oluştur";
    button.classList.toggle("is-signed-in", Boolean(session));
  };
  const render = (nextMode = mode) => {
    mode = nextMode;
    const session = getLocalSession(storage);
    const signedIn = Boolean(session);
    form.hidden = signedIn;
    logoutButton.hidden = !signedIn;
    switchButton.hidden = signedIn;
    if (signedIn) {
      title.textContent = `Merhaba, ${session.username}`;
      description.textContent = "Bu cihazda yerel hesabın açık. İstersen buradan çıkış yapabilirsin.";
      return;
    }
    const isRegister = mode === "register";
    title.textContent = isRegister ? "Hesap oluştur" : "Yerel hesabına gir";
    description.textContent = "Bu hesap yalnızca bu tarayıcıda saklanır; başka cihazlarda görünmez.";
    confirmInput.closest("label").hidden = !isRegister;
    confirmInput.required = isRegister;
    submitButton.textContent = isRegister ? "Hesabı oluştur" : "Giriş yap";
    switchButton.textContent = isRegister ? "Zaten hesabın var mı? Giriş yap" : "Hesabın yok mu? Oluştur";
  };
  button.addEventListener("click", () => { render(); dialog.showModal(); });
  closeButton.addEventListener("click", () => dialog.close());
  switchButton.addEventListener("click", () => render(mode === "register" ? "login" : "register"));
  logoutButton.addEventListener("click", () => {
    signOutLocalAccount(storage);
    updateHeader();
    dialog.close();
    notify("Çıkış yapıldı", "Yerel hesabın bu tarayıcıdan çıkarıldı.");
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const username = usernameInput.value;
    const password = passwordInput.value;
    try {
      let account;
      if (mode === "register") {
        if (password !== confirmInput.value) throw new Error("Şifreler eşleşmiyor.");
        account = await createLocalAccount(storage, username, password);
      } else {
        account = await signInLocalAccount(storage, username, password);
      }
      form.reset();
      updateHeader();
      dialog.close();
      notify(mode === "register" ? "Hesap oluşturuldu" : "Giriş yapıldı", `${account.username} olarak bu cihazda oturum açtın.`);
    } catch (error) {
      notify("İşlem tamamlanamadı", error instanceof Error ? error.message : "Lütfen tekrar dene.");
    }
  });
  updateHeader();
}

window.bindLocalAccountUI = bindLocalAccountUI;

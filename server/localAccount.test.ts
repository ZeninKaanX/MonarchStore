import { describe, expect, it } from "vitest";
import {
  createLocalAccount,
  getLocalSession,
  hashPassword,
  signInLocalAccount,
  signOutLocalAccount,
} from "../account-local.js";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("yerel hesap akışı", () => {
  it("hesap oluşturur, oturum açar ve çıkış yapar", async () => {
    const storage = new MemoryStorage();
    await expect(createLocalAccount(storage, "Kaan", "gizli123")).resolves.toEqual({ username: "Kaan" });
    expect(getLocalSession(storage)).toMatchObject({ username: "Kaan" });

    signOutLocalAccount(storage);
    expect(getLocalSession(storage)).toBeNull();

    await expect(signInLocalAccount(storage, "kaan", "gizli123")).resolves.toEqual({ username: "Kaan" });
    await expect(signInLocalAccount(storage, "kaan", "yanlis123")).rejects.toThrow("Kullanıcı adı veya şifre");
  });

  it("Web Crypto olmayan HTTP bağlamında yerel uyumluluk özetine döner", async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });

    await expect(hashPassword("deneme123")).resolves.toMatch(/^local-/);

    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  });
});

import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  DISCORD_CALLBACK_PATH,
  DISCORD_LOGIN_PATH,
  registerDiscordOAuthRoutes,
} from "./discordOAuth";

const servers: Server[] = [];

async function startTestServer() {
  const app = express();
  app.set("trust proxy", true);
  registerDiscordOAuthRoutes(app);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe("Discord OAuth routes", () => {
  it("starts an authorization-code flow with a CSRF state cookie", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}${DISCORD_LOGIN_PATH}`, {
      redirect: "manual",
      headers: {
        "x-forwarded-host": "store.example.test",
        "x-forwarded-proto": "https",
      },
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") || "");
    expect(location.origin).toBe("https://discord.com");
    expect(location.pathname).toBe("/oauth2/authorize");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("scope")).toBe("identify email");
    expect(location.searchParams.get("redirect_uri")).toBe(
      `https://store.example.test${DISCORD_CALLBACK_PATH}`
    );
    expect(location.searchParams.get("state")).toHaveLength(43);
    expect(response.headers.get("set-cookie")).toContain("discord_oauth_state=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("rejects callback requests without the matching CSRF state", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}${DISCORD_CALLBACK_PATH}?code=sample&state=wrong`, {
      redirect: "manual",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Discord OAuth state." });
  });
});

import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/v10/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/v10/users/@me";
const DISCORD_STATE_COOKIE = "discord_oauth_state";

export const DISCORD_LOGIN_PATH = "/api/auth/discord";
export const DISCORD_CALLBACK_PATH = "/api/auth/discord/callback";
export const DISCORD_LOGOUT_PATH = "/api/auth/discord/logout";
export const DISCORD_ME_PATH = "/api/auth/discord/me";

type DiscordTokenResponse = {
  access_token?: string;
};

type DiscordUserResponse = {
  id?: string;
  username?: string;
  global_name?: string | null;
  email?: string | null;
};

function getFirstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value?.split(",")[0]?.trim();
}

function getRequestOrigin(req: Request) {
  const forwardedProto = getFirstHeaderValue(req.headers["x-forwarded-proto"]);
  const forwardedHost = getFirstHeaderValue(req.headers["x-forwarded-host"]);
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get("host");

  if (!host || !/^[a-zA-Z0-9.:[\]-]+$/.test(host)) {
    throw new Error("A valid request host is required for Discord OAuth.");
  }

  if (protocol !== "https" && protocol !== "http") {
    throw new Error("A valid request protocol is required for Discord OAuth.");
  }

  return `${protocol}://${host}`;
}

export function buildDiscordAuthorizationUrl(redirectUri: string, state: string) {
  if (!ENV.discordClientId) {
    throw new Error("DISCORD_CLIENT_ID is not configured.");
  }

  const url = new URL(DISCORD_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: ENV.discordClientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify email",
    state,
    prompt: "consent",
  }).toString();
  return url.toString();
}

function getStateCookieOptions(req: Request) {
  const sessionOptions = getSessionCookieOptions(req);
  return {
    ...sessionOptions,
    sameSite: "lax" as const,
    maxAge: 10 * 60 * 1000,
  };
}

async function exchangeCode(code: string, redirectUri: string) {
  if (!ENV.discordClientId || !ENV.discordClientSecret) {
    throw new Error("Discord OAuth credentials are not configured.");
  }

  const credentials = Buffer.from(
    `${ENV.discordClientId}:${ENV.discordClientSecret}`
  ).toString("base64");
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord token exchange failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as DiscordTokenResponse;
  if (!payload.access_token) {
    throw new Error("Discord did not return an access token.");
  }
  return payload.access_token;
}

async function getDiscordUser(accessToken: string) {
  const response = await fetch(DISCORD_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Discord user request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as DiscordUserResponse;
  if (!payload.id) {
    throw new Error("Discord did not return a user identifier.");
  }
  return payload;
}

function clearStateCookie(req: Request, res: Response) {
  const { maxAge: _maxAge, ...options } = getStateCookieOptions(req);
  res.clearCookie(DISCORD_STATE_COOKIE, options);
}

export function registerDiscordOAuthRoutes(app: Express) {
  app.get(DISCORD_LOGIN_PATH, (req: Request, res: Response) => {
    try {
      const state = randomBytes(32).toString("base64url");
      const redirectUri = `${getRequestOrigin(req)}${DISCORD_CALLBACK_PATH}`;
      res.cookie(DISCORD_STATE_COOKIE, state, getStateCookieOptions(req));
      res.redirect(302, buildDiscordAuthorizationUrl(redirectUri, state));
    } catch (error) {
      console.error("[Discord OAuth] Could not start login", error);
      res.status(500).json({ error: "Discord login could not be started." });
    }
  });

  app.get(DISCORD_CALLBACK_PATH, async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const expectedState = parseCookieHeader(req.headers.cookie ?? "")[DISCORD_STATE_COOKIE];

    if (!code || !state || !expectedState || state !== expectedState) {
      clearStateCookie(req, res);
      res.status(403).json({ error: "Invalid Discord OAuth state." });
      return;
    }

    clearStateCookie(req, res);

    try {
      const redirectUri = `${getRequestOrigin(req)}${DISCORD_CALLBACK_PATH}`;
      const accessToken = await exchangeCode(code, redirectUri);
      const discordUser = await getDiscordUser(accessToken);
      const displayName = discordUser.global_name?.trim() || discordUser.username || "Discord kullanıcısı";
      const openId = `discord:${discordUser.id}`;

      await db.upsertUser({
        openId,
        name: displayName,
        email: discordUser.email ?? null,
        loginMethod: "discord",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: displayName,
        expiresInMs: ONE_YEAR_MS,
      });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/?discord=connected");
    } catch (error) {
      console.error("[Discord OAuth] Callback failed", error);
      res.redirect(302, "/?discord=error");
    }
  });

  app.get(DISCORD_ME_PATH, async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.loginMethod !== "discord") {
        res.json({ authenticated: false });
        return;
      }
      res.json({
        authenticated: true,
        name: user.name || "Discord kullanıcısı",
      });
    } catch {
      res.json({ authenticated: false });
    }
  });

  app.get(DISCORD_LOGOUT_PATH, (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.redirect(302, "/");
  });
}

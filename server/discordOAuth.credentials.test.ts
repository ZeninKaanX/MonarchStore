import { describe, expect, it } from "vitest";

describe("Discord OAuth kimlik bilgileri", () => {
  it("client-credentials isteğini yetkilendirir", async () => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    expect(clientId).toMatch(/^\d{16,20}$/);
    expect(clientSecret).toBeTruthy();

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "applications.commands.update",
      }),
    });

    expect(response.ok).toBe(true);

    const payload = (await response.json()) as { access_token?: string; token_type?: string };
    expect(payload.token_type).toBe("Bearer");
    expect(payload.access_token).toBeTruthy();
  });
});

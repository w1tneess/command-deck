import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EMAIL, setup } from "./testdb.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;
beforeEach(async () => {
  t = await setup({
    auth: "none",
    googleClientId: "mock-google-client-id",
    googleClientSecret: "mock-google-client-secret",
    googleRedirectUri: "http://localhost:8787/api/auth/google/callback",
    allowedGoogleEmails: EMAIL,
  });
});
afterEach(() => t.dispose());

/** "session=...; Path=/" -> "session=..." */
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const sessionCookieOf = (res: Response) =>
  (res.headers.getSetCookie?.() ?? (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []))
    .find((c) => c.startsWith("session="))
    ?.split(";")[0] ?? cookieOf(res);
const state = (headers: Record<string, string> = {}) => t.inject({ url: "/api/state", headers });
const withCookie = (cookie: string) => ({ cookie });
const MIN = 60_000, DAY = 86_400_000;

describe("session cookie", () => {
  it("is required, and a tampered cookie is rejected", async () => {
    expect((await state()).status).toBe(401);
    const cookie = await t.mintCookie();
    expect((await state(withCookie(cookie))).status).toBe(200);
    expect((await state(withCookie(cookie.slice(0, -3) + "AAA"))).status).toBe(401);
    expect((await state(withCookie("session=garbage"))).status).toBe(401);
  });

  it("expires when its lifetime is up", async () => {
    const day = await t.mintCookie(86_400);
    const quarter = await t.mintCookie(90 * 86_400);
    t.setNow(t.now() + DAY - MIN);
    expect((await state(withCookie(day))).status).toBe(200);
    t.setNow(t.now() + 2 * MIN);
    expect((await state(withCookie(day))).status).toBe(401);
    expect((await state(withCookie(quarter))).status).toBe(200);
    t.setNow(t.now() + 90 * DAY);
    expect((await state(withCookie(quarter))).status).toBe(401);
  });

  it("sign out all devices invalidates every existing cookie", async () => {
    const a = await t.mintCookie(), b = await t.mintCookie();
    expect((await t.inject({ method: "POST", url: "/api/logout-all", headers: withCookie(a) })).status).toBe(200);
    expect((await state(withCookie(a))).status).toBe(401);
    expect((await state(withCookie(b))).status).toBe(401);
    expect((await state(withCookie(await t.mintCookie(90 * 86_400, 2)))).status).toBe(200); // a fresh sign-in carries the new version
  });

  it("logout clears the cookie, and sign-out-all needs a session", async () => {
    const res = await t.inject({ method: "POST", url: "/api/logout" });
    expect(res.headers.get("set-cookie")).toMatch(/session=;|Max-Age=0|Expires=/i);
    expect((await t.inject({ method: "POST", url: "/api/logout-all" })).status).toBe(401);
  });

  it("blocks cookie-authenticated writes from another origin", async () => {
    const cookie = await t.mintCookie();
    const write = (origin?: string) =>
      t.inject({ method: "POST", url: "/api/targets", payload: { title: "x" }, headers: { cookie, ...(origin ? { origin } : {}) } });
    expect((await write("https://evil.example")).status).toBe(403);
    expect((await write("null")).status).toBe(403); // sandboxed pages send the literal "null"
    expect((await write("http://localhost")).status).toBe(201);
    expect((await write()).status).toBe(201);
  });

  it("no bearer token and no PIN open the API any more", async () => {
    expect((await state({ authorization: "Bearer test-token" })).status).toBe(401);
    const pin = await t.inject({ method: "POST", url: "/api/login", payload: { pin: "123456", remember: true } });
    expect(pin.status).toBe(401);
    expect(pin.headers.get("set-cookie")).toBeNull();
  });

  it("with no session secret configured the API refuses everything", async () => {
    const bare = await setup({ auth: "none", secret: null });
    try {
      expect((await bare.inject("/api/state")).status).toBe(500);
    } finally {
      await bare.dispose();
    }
  });
});

describe("Google OAuth restricted login", () => {
  it("GET /api/auth/google fails closed if secrets are missing", async () => {
    const noSecret = await setup({ auth: "none", secret: null });
    const noCreds = await setup({ auth: "none", googleClientId: null });
    try {
      expect((await noSecret.inject("/api/auth/google")).status).toBe(500);
      expect((await noCreds.inject("/api/auth/google")).status).toBe(500);
    } finally {
      await noSecret.dispose();
      await noCreds.dispose();
    }
  });

  it("GET /api/auth/google sets oauth_state cookie and redirects to Google with required params", async () => {
    const res = await t.inject("/api/auth/google");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location");
    expect(loc).toBeTruthy();
    const url = new URL(loc!);
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("mock-google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8787/api/auth/google/callback");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    const stateVal = url.searchParams.get("state");
    expect(stateVal).toBeTruthy();

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/oauth_state=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=600/);
  });

  it("GET /api/auth/google/callback rejects state mismatch with 400", async () => {
    const initRes = await t.inject("/api/auth/google");
    const oauthCookie = cookieOf(initRes);
    const res = await t.inject({
      url: "/api/auth/google/callback?code=mock-code&state=wrong-state",
      headers: withCookie(oauthCookie),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid OAuth State");
  });

  it("GET /api/auth/google/callback rejects missing state cookie with 400", async () => {
    const res = await t.inject("/api/auth/google/callback?code=mock-code&state=some-state");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid OAuth State");
  });

  it("GET /api/auth/google/callback redirects when error query param is present", async () => {
    const res = await t.inject("/api/auth/google/callback?error=access_denied");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?error=access_denied");
  });

  it("GET /api/auth/google/callback rejects unverified email with 403", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "mock-access-token" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (urlStr.includes("googleapis.com/oauth2/v3/userinfo")) {
        return new Response(JSON.stringify({ email: "advaita974@gmail.com", email_verified: false }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("Not found", { status: 404 });
    };

    const inst = await setup({
      auth: "none",
      googleClientId: "mock-google-client-id",
      googleClientSecret: "mock-google-client-secret",
      fetchFn: mockFetch as any,
    });
    try {
      const initRes = await inst.inject("/api/auth/google");
      const oauthCookie = cookieOf(initRes);
      const stateVal = new URL(initRes.headers.get("location")!).searchParams.get("state")!;

      const res = await inst.inject({
        url: `/api/auth/google/callback?code=mock-code&state=${stateVal}`,
        headers: withCookie(oauthCookie),
      });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("Google account email is not verified");
    } finally {
      await inst.dispose();
    }
  });

  it("GET /api/auth/google/callback rejects non-whitelisted email with 403 Forbidden HTML", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "mock-access-token" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (urlStr.includes("googleapis.com/oauth2/v3/userinfo")) {
        return new Response(JSON.stringify({ email: "<b>stranger</b>@gmail.com", email_verified: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("Not found", { status: 404 });
    };

    const inst = await setup({
      auth: "none",
      googleClientId: "mock-google-client-id",
      googleClientSecret: "mock-google-client-secret",
      allowedGoogleEmails: "advaita974@gmail.com",
      fetchFn: mockFetch as any,
    });
    try {
      const initRes = await inst.inject("/api/auth/google");
      const oauthCookie = cookieOf(initRes);
      const stateVal = new URL(initRes.headers.get("location")!).searchParams.get("state")!;

      const res = await inst.inject({
        url: `/api/auth/google/callback?code=mock-code&state=${stateVal}`,
        headers: withCookie(oauthCookie),
      });
      expect(res.status).toBe(403);
      const html = await res.text();
      expect(html).toContain("<h3>Access Denied</h3>");
      expect(html).toContain("<p>This account is not authorized to access Command Deck.</p>");
      expect(html).not.toContain("<b>stranger");
      expect(html).toContain("&#60;b&#62;stranger&#60;/b&#62;@gmail.com");
      const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
      expect(cookies.some((c) => c.startsWith("session="))).toBe(false);
    } finally {
      await inst.dispose();
    }
  });

  it("GET /api/auth/google/callback accepts whitelisted email, sets session cookie, and redirects to /", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "mock-access-token" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (urlStr.includes("googleapis.com/oauth2/v3/userinfo")) {
        return new Response(JSON.stringify({ email: "advaita974@gmail.com", email_verified: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("Not found", { status: 404 });
    };

    const inst = await setup({
      auth: "none",
      googleClientId: "mock-google-client-id",
      googleClientSecret: "mock-google-client-secret",
      allowedGoogleEmails: "advaita974@gmail.com",
      fetchFn: mockFetch as any,
    });
    try {
      const initRes = await inst.inject("/api/auth/google");
      const oauthCookie = cookieOf(initRes);
      const stateVal = new URL(initRes.headers.get("location")!).searchParams.get("state")!;

      const res = await inst.inject({
        url: `/api/auth/google/callback?code=mock-code&state=${stateVal}`,
        headers: withCookie(oauthCookie),
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
      const sessionCookie = sessionCookieOf(res);
      expect(sessionCookie).toMatch(/^session=/);
      expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
      expect(res.headers.get("set-cookie")).toMatch(/SameSite=Strict/i);

      // Verify that requests using the issued session cookie can access /api/state
      const stateRes = await inst.inject({
        url: "/api/state",
        headers: withCookie(sessionCookie),
      });
      expect(stateRes.status).toBe(200);
    } finally {
      await inst.dispose();
    }
  });
});


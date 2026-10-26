import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PIN, setup } from "./testdb.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;
beforeEach(async () => {
  t = await setup({
    auth: "none",
    googleClientId: "mock-google-client-id",
    googleClientSecret: "mock-google-client-secret",
    googleRedirectUri: "http://localhost:8787/api/auth/google/callback",
    allowedGoogleEmails: "advaita974@gmail.com",
  });
});
afterEach(() => t.dispose());

const login = (pin = PIN, remember = true, ip = "1.1.1.1") =>
  t.inject({ method: "POST", url: "/api/login", payload: { pin, remember }, headers: { "cf-connecting-ip": ip } });
/** "session=...; Path=/" -> "session=..." */
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const sessionCookieOf = (res: Response) =>
  (res.headers.getSetCookie?.() ?? (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []))
    .find((c) => c.startsWith("session="))
    ?.split(";")[0] ?? cookieOf(res);
const state = (headers: Record<string, string> = {}) => t.inject({ url: "/api/state", headers });
const withCookie = (cookie: string) => ({ cookie });
const MIN = 60_000, DAY = 86_400_000;

describe("login", () => {
  it("accepts the right PIN and sets a hardened cookie", async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const raw = res.headers.get("set-cookie")!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\//);
    expect(raw).toMatch(/Max-Age=7776000/); // 90 days with "remember this device"
    expect((await state(withCookie(cookieOf(res)))).status).toBe(200);
  });

  it("uses a session cookie when the device isn't remembered", async () => {
    const res = await login(PIN, false);
    expect(res.headers.get("set-cookie")).not.toMatch(/Max-Age/i);
  });

  it("rejects a wrong PIN and says how many tries are left", async () => {
    const res = await login("000000");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ attemptsLeft: 4 });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects non-string and malformed PINs", async () => {
    // A different address each time, so the lockout (tested separately) doesn't interfere.
    for (const [i, pin] of [123456, null, "", "12345", "1234567", "abcdef"].entries()) {
      expect((await login(pin as any, true, `10.0.0.${i}`)).status).toBe(401);
    }
  });

  it("fails closed when the PIN or session secret isn't configured", async () => {
    const noPin = await setup({ auth: "none", pin: null });
    const noSecret = await setup({ auth: "none", secret: null });
    try {
      expect((await noPin.inject({ method: "POST", url: "/api/login", payload: { pin: PIN } })).status).toBe(500);
      expect((await noSecret.inject({ method: "POST", url: "/api/login", payload: { pin: PIN } })).status).toBe(500);
    } finally {
      await noPin.dispose();
      await noSecret.dispose();
    }
  });
});

describe("lockout", () => {
  it("locks a device after 5 wrong tries, even for the right PIN, then releases after 15 minutes", async () => {
    for (let i = 0; i < 5; i++) expect((await login("000000")).status).toBe(401);
    const locked = await login(PIN);
    expect(locked.status).toBe(429);
    expect((await locked.json()) as any).toMatchObject({ retryAfter: 900 });
    expect(locked.headers.get("retry-after")).toBe("900");
    t.setNow(t.now() + 14 * MIN);
    expect((await login(PIN)).status).toBe(429);
    t.setNow(t.now() + 2 * MIN);
    expect((await login(PIN)).status).toBe(200);
  });

  it("does not lock other devices", async () => {
    for (let i = 0; i < 5; i++) await login("000000", true, "9.9.9.9");
    expect((await login(PIN, true, "9.9.9.9")).status).toBe(429);
    expect((await login(PIN, true, "2.2.2.2")).status).toBe(200);
  });

  it("a successful login resets that device's count", async () => {
    for (let i = 0; i < 4; i++) await login("000000");
    expect((await login(PIN)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login("000000")).status).toBe(401);
  });

  it("lets at most 5 wrong tries through even when they arrive at the same moment", async () => {
    const codes = (await Promise.all(Array.from({ length: 12 }, () => login("000000", true, "7.7.7.7")))).map((r) => r.status);
    expect(codes.filter((c) => c === 401)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(7);
    expect((await login(PIN, true, "7.7.7.7")).status).toBe(429); // refused tries don't extend the lock
    t.setNow(t.now() + 16 * MIN);
    expect((await login(PIN, true, "7.7.7.7")).status).toBe(200);
  });

  it("caps total wrong tries across all devices at 20 per hour", async () => {
    for (const ip of ["a", "b", "c", "d"]) for (let i = 0; i < 5; i++) await login("000000", true, ip);
    expect((await login(PIN, true, "fresh")).status).toBe(429);
    t.setNow(t.now() + 61 * MIN);
    expect((await login(PIN, true, "fresh")).status).toBe(200);
  });
});

describe("session cookie", () => {
  it("is required, and a tampered cookie is rejected", async () => {
    expect((await state()).status).toBe(401);
    const cookie = cookieOf(await login());
    expect((await state(withCookie(cookie.slice(0, -3) + "AAA"))).status).toBe(401);
    expect((await state(withCookie("session=garbage"))).status).toBe(401);
  });

  it("expires: 24 hours without remember, 90 days with it", async () => {
    const short = cookieOf(await login(PIN, false));
    const long = cookieOf(await login(PIN, true));
    t.setNow(t.now() + DAY - MIN);
    expect((await state(withCookie(short))).status).toBe(200);
    t.setNow(t.now() + 2 * MIN);
    expect((await state(withCookie(short))).status).toBe(401);
    expect((await state(withCookie(long))).status).toBe(200);
    t.setNow(t.now() + 90 * DAY);
    expect((await state(withCookie(long))).status).toBe(401);
  });

  it("sign out all devices invalidates every existing cookie", async () => {
    const a = cookieOf(await login());
    const b = cookieOf(await login(PIN, true, "3.3.3.3"));
    expect((await t.inject({ method: "POST", url: "/api/logout-all", headers: withCookie(a) })).status).toBe(200);
    expect((await state(withCookie(a))).status).toBe(401);
    expect((await state(withCookie(b))).status).toBe(401);
    expect((await state(withCookie(cookieOf(await login())))).status).toBe(200);
  });

  it("logout clears the cookie, and sign-out-all needs a session", async () => {
    const res = await t.inject({ method: "POST", url: "/api/logout" });
    expect(res.headers.get("set-cookie")).toMatch(/session=;|Max-Age=0|Expires=/i);
    expect((await t.inject({ method: "POST", url: "/api/logout-all" })).status).toBe(401);
  });

  it("blocks cookie-authenticated writes from another origin", async () => {
    const cookie = cookieOf(await login());
    const write = (origin?: string) =>
      t.inject({ method: "POST", url: "/api/targets", payload: { title: "x" }, headers: { cookie, ...(origin ? { origin } : {}) } });
    expect((await write("https://evil.example")).status).toBe(403);
    expect((await write("null")).status).toBe(403); // sandboxed pages send the literal "null"
    expect((await write("http://localhost")).status).toBe(201);
    expect((await write()).status).toBe(201);
  });
});

describe("recovery token", () => {
  it("still works as a bearer, and a wrong one is rejected", async () => {
    expect((await state({ authorization: "Bearer test-token" })).status).toBe(200);
    expect((await state({ authorization: "Bearer nope" })).status).toBe(401);
  });

  it("with nothing configured the API refuses everything", async () => {
    const bare = await setup({ auth: "none", token: null, secret: null });
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
        return new Response(JSON.stringify({ email: "stranger@gmail.com", email_verified: true }), { status: 200, headers: { "Content-Type": "application/json" } });
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


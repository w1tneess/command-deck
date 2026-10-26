import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EMAIL, PASSWORD, setup } from "./testdb.ts";

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

const post = (url: string, payload: unknown, ip = "1.1.1.1") =>
  t.inject({ method: "POST", url, payload, headers: { "cf-connecting-ip": ip } });
const requestCode = (email = EMAIL, ip = "1.1.1.1") => post("/api/auth/email/request", { email }, ip);
const codeIn = (i = -1) => t.mails.at(i)!.text.match(/\b(\d{6})\b/)![1];
const setPassword = (code: string, password = PASSWORD, remember = true, ip = "1.1.1.1", email = EMAIL) =>
  post("/api/auth/email/set-password", { email, code, password, remember }, ip);
const login = (password = PASSWORD, remember = true, ip = "1.1.1.1", email = EMAIL) =>
  post("/api/auth/email/login", { email, password, remember }, ip);
/** Verify the address and set the password, the first-time flow. */
const register = async () => { await requestCode(); return setPassword(codeIn()); };
/** "session=...; Path=/" -> "session=..." */
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const sessionCookieOf = (res: Response) =>
  (res.headers.getSetCookie?.() ?? (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []))
    .find((c) => c.startsWith("session="))
    ?.split(";")[0] ?? cookieOf(res);
const state = (headers: Record<string, string> = {}) => t.inject({ url: "/api/state", headers });
const withCookie = (cookie: string) => ({ cookie });
const MIN = 60_000, DAY = 86_400_000;

describe("email code", () => {
  it("emails a six-digit code to an allowed address and never says whether the address is allowed", async () => {
    const ok = await requestCode();
    expect(ok.status).toBe(200);
    expect(t.mails).toHaveLength(1);
    expect(t.mails[0]).toMatchObject({ to: EMAIL });
    expect(t.mails[0].text).toMatch(/\b\d{6}\b/);
    const stranger = await requestCode("stranger@example.com");
    expect(stranger.status).toBe(200);
    expect(await stranger.json()).toEqual(await ok.json()); // same answer
    expect(t.mails).toHaveLength(1); // but nothing was sent
  });

  it("stores only a hash of the code", async () => {
    await requestCode();
    const row = await t.db.prepare("SELECT code_hash FROM email_codes").first<{ code_hash: string }>();
    expect(row!.code_hash).not.toContain(codeIn());
    expect(row!.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sends at most one email a minute to the same address", async () => {
    await requestCode();
    await requestCode();
    expect(t.mails).toHaveLength(1);
    t.setNow(t.now() + 61_000);
    await requestCode();
    expect(t.mails).toHaveLength(2);
  });

  it("rejects something that isn't an email address", async () => {
    expect((await requestCode("not-an-email")).status).toBe(400);
    expect((await post("/api/auth/email/request", { email: 42 })).status).toBe(400);
  });
});

describe("setting a password", () => {
  it("needs the emailed code, then signs in with a hardened cookie", async () => {
    await requestCode();
    const res = await setPassword(codeIn());
    expect(res.status).toBe(200);
    const raw = res.headers.get("set-cookie")!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Max-Age=7776000/); // 90 days with "remember this device"
    expect((await state(withCookie(cookieOf(res)))).status).toBe(200);
  });

  it("stores a salted PBKDF2 hash, never the password, and the code works once", async () => {
    await requestCode();
    const code = codeIn();
    expect((await setPassword(code)).status).toBe(200);
    const row = await t.db.prepare("SELECT pw_hash, salt, iterations FROM credentials").first<{ pw_hash: string; salt: string; iterations: number }>();
    expect(row!.pw_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(row!.iterations).toBe(100_000);
    expect(JSON.stringify(row)).not.toContain(PASSWORD);
    expect((await setPassword(code, "another-long-password")).status).toBe(401); // already used
  });

  it("rejects a wrong code, and five wrong guesses kill the code", async () => {
    await requestCode();
    const good = codeIn();
    const bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await setPassword(bad, PASSWORD, true, `10.0.0.${i}`)).status).toBe(401);
    expect((await setPassword(good, PASSWORD, true, "10.0.0.9")).status).toBe(401);
  });

  it("rejects an expired code", async () => {
    await requestCode();
    t.setNow(t.now() + 11 * MIN);
    expect((await setPassword(codeIn())).status).toBe(401);
  });

  it("rejects an address that isn't allowed", async () => {
    await requestCode();
    expect((await setPassword(codeIn(), PASSWORD, true, "1.1.1.1", "stranger@example.com")).status).toBe(401);
  });

  it("insists on a long password", async () => {
    await requestCode();
    expect((await setPassword(codeIn(), "short")).status).toBe(400);
    expect((await setPassword(codeIn(), "x".repeat(201))).status).toBe(400);
  });

  it("uses a browser-session cookie when the device isn't remembered", async () => {
    await requestCode();
    expect((await setPassword(codeIn(), PASSWORD, false)).headers.get("set-cookie")).not.toMatch(/Max-Age/i);
  });

  it("a new password signs out every other device", async () => {
    const first = cookieOf(await register());
    expect((await state(withCookie(first))).status).toBe(200);
    t.setNow(t.now() + 2 * MIN);
    await requestCode();
    const second = cookieOf(await setPassword(codeIn(), "a-brand-new-password"));
    expect((await state(withCookie(first))).status).toBe(401);
    expect((await state(withCookie(second))).status).toBe(200);
  });
});

describe("email sign-in", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    await register();
    const ok = await login();
    expect(ok.status).toBe(200);
    expect((await state(withCookie(cookieOf(ok)))).status).toBe(200);
    const bad = await login("wrong-password-here");
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toBeNull();
    expect(await bad.json()).toMatchObject({ error: "Wrong email or password.", attemptsLeft: 4 });
  });

  it("gives the same answer for an unknown or disallowed address as for a wrong password", async () => {
    await register();
    const wrong = (await (await login("wrong-password-here", true, "2.2.2.2")).json()) as any;
    const unknown = (await (await login(PASSWORD, true, "3.3.3.3", "stranger@example.com")).json()) as any;
    expect(unknown.error).toBe(wrong.error);
  });

  it("rejects malformed input", async () => {
    await register();
    for (const [i, password] of [123456, null, "", {}].entries()) {
      expect((await login(password as any, true, `10.1.0.${i}`)).status).toBe(401);
    }
  });

  it("uses a browser-session cookie when the device isn't remembered", async () => {
    await register();
    expect((await login(PASSWORD, false)).headers.get("set-cookie")).not.toMatch(/Max-Age/i);
  });

  it("fails closed when the session secret isn't configured", async () => {
    const noSecret = await setup({ auth: "none", secret: null });
    try {
      for (const url of ["/api/auth/email/request", "/api/auth/email/set-password", "/api/auth/email/login"]) {
        expect((await noSecret.inject({ method: "POST", url, payload: { email: EMAIL } })).status).toBe(500);
      }
    } finally {
      await noSecret.dispose();
    }
  });

  it("the old PIN login is gone", async () => {
    expect((await post("/api/login", { pin: "123456" })).status).toBe(401);
  });
});

describe("lockout", () => {
  it("locks a device after 5 wrong tries, even for the right password, then releases after 15 minutes", async () => {
    await register();
    for (let i = 0; i < 5; i++) expect((await login("wrong-password-here")).status).toBe(401);
    const locked = await login();
    expect(locked.status).toBe(429);
    expect((await locked.json()) as any).toMatchObject({ retryAfter: 900 });
    expect(locked.headers.get("retry-after")).toBe("900");
    t.setNow(t.now() + 14 * MIN);
    expect((await login()).status).toBe(429);
    t.setNow(t.now() + 2 * MIN);
    expect((await login()).status).toBe(200);
  });

  it("does not lock other devices", async () => {
    await register();
    for (let i = 0; i < 5; i++) await login("wrong-password-here", true, "9.9.9.9");
    expect((await login(PASSWORD, true, "9.9.9.9")).status).toBe(429);
    expect((await login(PASSWORD, true, "2.2.2.2")).status).toBe(200);
  });

  it("a successful sign-in resets that device's count", async () => {
    await register(); // clears this device's tries
    for (let i = 0; i < 3; i++) await login("wrong-password-here");
    expect((await login()).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login("wrong-password-here")).status).toBe(401);
  });

  it("lets at most 5 wrong tries through even when they arrive at the same moment", async () => {
    await register();
    const codes = (await Promise.all(Array.from({ length: 12 }, () => login("wrong-password-here", true, "7.7.7.7")))).map((r) => r.status);
    expect(codes.filter((c) => c === 401)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(7);
    expect((await login(PASSWORD, true, "7.7.7.7")).status).toBe(429); // refused tries don't extend the lock
    t.setNow(t.now() + 16 * MIN);
    expect((await login(PASSWORD, true, "7.7.7.7")).status).toBe(200);
  });

  it("caps total tries across all devices at 20 per hour", async () => {
    await register();
    for (const ip of ["a", "b", "c", "d"]) for (let i = 0; i < 5; i++) await login("wrong-password-here", true, ip);
    expect((await login(PASSWORD, true, "fresh")).status).toBe(429);
    t.setNow(t.now() + 61 * MIN);
    expect((await login(PASSWORD, true, "fresh")).status).toBe(200);
  });

  it("also limits how often one device can ask for codes", async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await requestCode(EMAIL, "5.5.5.5")).status);
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes[5]).toBe(429);
  });
});

describe("session cookie", () => {
  it("is required, and a tampered cookie is rejected", async () => {
    expect((await state()).status).toBe(401);
    await register();
    const cookie = cookieOf(await login());
    expect((await state(withCookie(cookie.slice(0, -3) + "AAA"))).status).toBe(401);
    expect((await state(withCookie("session=garbage"))).status).toBe(401);
  });

  it("expires: 24 hours without remember, 90 days with it", async () => {
    await register();
    const short = cookieOf(await login(PASSWORD, false));
    const long = cookieOf(await login(PASSWORD, true));
    t.setNow(t.now() + DAY - MIN);
    expect((await state(withCookie(short))).status).toBe(200);
    t.setNow(t.now() + 2 * MIN);
    expect((await state(withCookie(short))).status).toBe(401);
    expect((await state(withCookie(long))).status).toBe(200);
    t.setNow(t.now() + 90 * DAY);
    expect((await state(withCookie(long))).status).toBe(401);
  });

  it("sign out all devices invalidates every existing cookie", async () => {
    await register();
    const a = cookieOf(await login());
    const b = cookieOf(await login(PASSWORD, true, "3.3.3.3"));
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
    await register();
    const cookie = cookieOf(await login());
    const write = (origin?: string) =>
      t.inject({ method: "POST", url: "/api/targets", payload: { title: "x" }, headers: { cookie, ...(origin ? { origin } : {}) } });
    expect((await write("https://evil.example")).status).toBe(403);
    expect((await write("null")).status).toBe(403); // sandboxed pages send the literal "null"
    expect((await write("http://localhost")).status).toBe(201);
    expect((await write()).status).toBe(201);
  });

  it("no bearer token opens the API any more", async () => {
    expect((await state({ authorization: "Bearer test-token" })).status).toBe(401);
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


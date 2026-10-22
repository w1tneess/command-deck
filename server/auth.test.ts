import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PIN, setup } from "./testdb.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;
beforeEach(async () => { t = await setup({ auth: "none" }); });
afterEach(() => t.dispose());

const login = (pin = PIN, remember = true, ip = "1.1.1.1") =>
  t.inject({ method: "POST", url: "/api/login", payload: { pin, remember }, headers: { "cf-connecting-ip": ip } });
/** "session=...; Path=/" -> "session=..." */
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
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

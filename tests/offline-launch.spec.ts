import { expect, test } from "@playwright/test";
import { createClient, processLock, type Session } from "@supabase/supabase-js";
import { deleteSignedIn } from "../src/auth/appleTokens";
import {
  SESSION_WAIT_MS,
  fetchWithDeadline,
  liveSession,
  restoreSession,
  run,
  signOutHere,
  watchSession,
} from "../src/auth/supabaseSession";
import { AuthError } from "../src/auth/types";

// Opening the app on a weak connection (src/auth/supabaseSession.ts), run in
// Node against the real supabase-js with a stand-in server, storage and
// clock. Opened offline more than an hour after the last use, Supabase spends
// about 30 seconds failing to renew the session and then reports none,
// although it keeps it saved: the app used to hold its splash all that time
// and then open signed out. The on-device test mode has no Supabase, so the
// browser tests can't reach this (tests/offline-progress.spec.ts covers the
// rest of an offline launch in the app).

/** SESSION_KEY in src/auth/sessionStorage.ts, which needs a device to load. */
const KEY = "aao.session";
const HOUR = 60 * 60 * 1000;
/** How long the launch waits for Supabase before going by the saved session. */
const CAP = SESSION_WAIT_MS;

// supabase-js reads the time from Date.now; each test can move it on.
const realNow = Date.now;
const realFetch = globalThis.fetch;
// supabase-js warns of each renewal that fails offline, as these tests intend.
const realWarn = console.warn;
let shift = 0;
test.beforeEach(() => {
  shift = 0;
  Date.now = () => realNow() + shift;
  console.warn = () => {};
});
test.afterEach(() => {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A session as the stand-in server hands it out, good for an hour from `issued`. */
function session(id: string, issued = Date.now()) {
  return {
    access_token: `access-${id}-${issued}`,
    refresh_token: `refresh-${id}-${issued}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.round((issued + HOUR) / 1000),
    user: {
      id,
      email: `${id}@example.com`,
      aud: "authenticated",
      app_metadata: { provider: "email" },
      user_metadata: {},
    },
  };
}

type Network = "online" | "offline" | "down" | "hangs";

/**
 * One phone, as the app sets its client up, opened with the session it
 * saved `ago` earlier. `answer` is the stand-in server; the network can be
 * online, offline (requests fail at once), down (offline in real time: the
 * clock isn't moved on, so supabase-js goes on retrying a renewal for about
 * 25 seconds, as on a phone) or hang (requests never answer until they're
 * cancelled).
 */
function phone(ago: number, answer: (path: string) => Response, deadlineMs = 15_000) {
  const saved = new Map<string, string>();
  saved.set(KEY, JSON.stringify(session("member", Date.now() - ago)));
  const asked: string[] = [];
  const net = { mode: "online" as Network };
  // Supabase's requests go through the app's deadline (fetchWithDeadline),
  // which calls the global fetch: this is the network under it.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/auth/v1", "") + url.search;
    asked.push(path);
    if (net.mode === "offline") {
      // supabase-js retries a failed renewal for up to 30 s; the clock jumps
      // past that, as if every retry had failed too.
      shift += 30_000;
      throw new TypeError("Network request failed");
    }
    if (net.mode === "down") throw new TypeError("Network request failed");
    if (net.mode === "hangs")
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => {
          shift += 30_000;
          reject(init.signal?.reason ?? new Error("Aborted"));
        }),
      );
    return answer(path);
  }) as typeof fetch;
  const client = createClient("https://aao.invalid", "publishable-key", {
    auth: {
      storage: {
        getItem: async (key: string) => saved.get(key) ?? null,
        setItem: async (key: string, value: string) => void saved.set(key, value),
        removeItem: async (key: string) => void saved.delete(key),
      },
      storageKey: KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      lock: processLock,
    },
    global: { fetch: fetchWithDeadline(deadlineMs) },
  });
  const readSaved = async () => {
    const raw = saved.get(KEY);
    return raw ? JSON.parse(raw) : null;
  };
  /** The app's forgetSession, for this phone's storage. */
  const forget = async () => void saved.delete(KEY);
  /** What the app is told about sign-ins (supabaseBackend's subscribe), in order. */
  const told: (string | null)[] = [];
  const events: string[] = [];
  client.auth.onAuthStateChange((event) => void events.push(event));
  watchSession(client.auth, readSaved, (s: Session | null) => void told.push(s?.user.id ?? null));
  return { client, saved, asked, net, readSaved, forget, told, events };
}

/**
 * The renewal supabase-js is retrying gives up at its next try, as it would
 * after its 30 seconds, and it has finished starting.
 */
async function renewalGivesUp(device: ReturnType<typeof phone>) {
  device.net.mode = "offline";
  await device.client.auth.initialize();
}

/** Waits for supabase-js to have reported how it started, and the app to have heard. */
async function started(device: ReturnType<typeof phone>) {
  await expect.poll(() => device.events.includes("INITIAL_SESSION"), { timeout: 5000 }).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 50));
}

const server = (path: string) => {
  if (path.startsWith("/token?grant_type=refresh_token")) return json(session("member"));
  if (path.startsWith("/rest/v1/")) return json([]);
  throw new Error(`The stand-in server wasn't expecting ${path}`);
};

test.afterEach(async () => {
  // Let supabase-js's own timers of the test settle before the next.
  await new Promise((resolve) => setTimeout(resolve, 20));
});

test.describe("an offline launch", () => {
  test("two hours after the last use, it opens signed in at once and keeps the session", async () => {
    const device = phone(2 * HOUR, server);
    device.net.mode = "offline";
    const begun = performance.now();

    const restored = await restoreSession(device.client.auth, device.readSaved, CAP);
    expect(performance.now() - begun).toBeLessThan(CAP + 500);
    expect(restored?.user.id).toBe("member");

    // Supabase reports no session as it starts, having failed to renew it;
    // that isn't a sign-out, so the app isn't told one, and it stays saved.
    await started(device);
    expect(device.told).not.toContain(null);
    expect(device.saved.has(KEY)).toBe(true);
    device.client.auth.stopAutoRefresh();
  });

  test("on a connection that hangs, it still opens signed in within the cap", async () => {
    // The renewal's request runs out after 3 s, well after the cap.
    const device = phone(2 * HOUR, server, 3000);
    device.net.mode = "hangs";
    const begun = performance.now();

    const restored = await restoreSession(device.client.auth, device.readSaved, CAP);
    const took = performance.now() - begun;
    expect(took).toBeGreaterThanOrEqual(CAP - 50);
    expect(took).toBeLessThan(CAP + 500);
    expect(restored?.user.id).toBe("member");

    // The renewal gave up at the deadline rather than waiting for good,
    // and the session is still there for when the connection returns.
    await started(device);
    expect(device.told).not.toContain(null);
    expect(device.saved.has(KEY)).toBe(true);
    device.client.auth.stopAutoRefresh();
  });

  test("back online, the session is renewed in the background for the same account", async () => {
    const device = phone(2 * HOUR, server);
    device.net.mode = "offline";
    await restoreSession(device.client.auth, device.readSaved, CAP);
    await started(device);
    const before = JSON.parse(device.saved.get(KEY)!).access_token;

    // The connection returns; Supabase tries again (every 30 seconds while
    // the app is open, or when anything asks for the session).
    device.net.mode = "online";
    shift += 2 * 60_000;
    const { data } = await device.client.auth.getSession();
    expect(data.session?.user.id).toBe("member");
    await expect.poll(() => device.told.at(-1)).toBe("member");
    expect(device.told).not.toContain(null);
    expect(JSON.parse(device.saved.get(KEY)!).access_token).not.toBe(before);
    device.client.auth.stopAutoRefresh();
  });
});

test("when the server refuses the saved session, the app opens signed out", async () => {
  const device = phone(2 * HOUR, (path) => {
    if (path.startsWith("/token?grant_type=refresh_token"))
      return json(
        { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" },
        400,
      );
    throw new Error(`The stand-in server wasn't expecting ${path}`);
  });

  const restored = await restoreSession(device.client.auth, device.readSaved, CAP);
  expect(restored).toBeNull();
  await started(device);
  expect(device.told.at(-1)).toBeNull();
  expect(device.saved.has(KEY)).toBe(false);
  device.client.auth.stopAutoRefresh();
});

test("a session still in date opens at once, online or not", async () => {
  const device = phone(10 * 60_000, server);
  device.net.mode = "offline";
  const begun = performance.now();
  const restored = await restoreSession(device.client.auth, device.readSaved, CAP);
  expect(performance.now() - begun).toBeLessThan(500);
  expect(restored?.user.id).toBe("member");
  device.client.auth.stopAutoRefresh();
});

test.describe("account data", () => {
  test("isn't asked for while the session can't be renewed, so it never reads as empty", async () => {
    const device = phone(2 * HOUR, server);
    device.net.mode = "offline";
    await restoreSession(device.client.auth, device.readSaved, CAP);
    await started(device);
    device.asked.length = 0;

    // Offline, with the access token expired: no request goes out with the
    // public key in its place; the app hears "offline" and tries later.
    const failure = await liveSession(device.client.auth, device.readSaved, "member").catch((error) => error);
    expect(failure).toBeInstanceOf(AuthError);
    expect((failure as AuthError).code).toBe("network");
    expect(device.asked.filter((path) => path.startsWith("/rest/"))).toEqual([]);
    device.client.auth.stopAutoRefresh();
  });

  test("is only sent with the account's own session", async () => {
    const device = phone(10 * 60_000, server);
    await expect(liveSession(device.client.auth, device.readSaved, "member")).resolves.toMatchObject({
      user: { id: "member" },
    });
    const failure = await liveSession(device.client.auth, device.readSaved, "someone-else").catch((error) => error);
    expect((failure as AuthError).code).toBe("invalid_credentials");
    device.client.auth.stopAutoRefresh();
  });

  test("a save on a connection that hangs fails at the deadline, as offline", async () => {
    const device = phone(10 * 60_000, server, 300);
    await liveSession(device.client.auth, device.readSaved, "member");
    device.net.mode = "hangs";
    const begun = performance.now();
    // (Supabase tries a read three more times, 1, 2 and 4 s apart, so a
    // read that hangs fails after about a minute rather than 15 s.)
    const failure = await run(() =>
      device.client.from("watch_progress").upsert({ user_id: "member", sermon_id: "x" }),
    ).catch((error) => error);
    expect(performance.now() - begun).toBeLessThan(2000);
    expect(failure).toBeInstanceOf(AuthError);
    expect((failure as AuthError).code).toBe("network");
    device.client.auth.stopAutoRefresh();
  });

  test("a refusal keeps the server's status, for the failure report", async () => {
    const device = phone(10 * 60_000, (path) => {
      if (path.startsWith("/rest/v1/"))
        return json({ code: "42501", message: "new row violates row-level security policy" }, 403);
      return server(path);
    });
    const failure = await run(() =>
      device.client.from("watch_progress").upsert({ user_id: "member", sermon_id: "x" }),
    ).catch((error) => error);
    expect(failure).toBeInstanceOf(AuthError);
    expect((failure as AuthError).status).toBe(403);
    device.client.auth.stopAutoRefresh();
  });

  test("deleting the account offline says so, and asks nothing of the server", async () => {
    const device = phone(2 * HOUR, server);
    device.net.mode = "offline";
    await restoreSession(device.client.auth, device.readSaved, CAP);
    await started(device);
    device.asked.length = 0;

    // "You seem to be offline", not "Something went wrong".
    const failure = await deleteSignedIn(device.client, null, device.readSaved).catch((error) => error);
    expect(failure).toBeInstanceOf(AuthError);
    expect((failure as AuthError).code).toBe("network");
    expect(device.asked.filter((path) => !path.startsWith("/token"))).toEqual([]);
    expect(device.saved.has(KEY)).toBe(true);
    device.client.auth.stopAutoRefresh();
  });
});

test.describe("while supabase-js is still retrying the launch's renewal", () => {
  test("account data fails as offline in moments, not half a minute later", async () => {
    const device = phone(2 * HOUR, server);
    device.net.mode = "down";
    await restoreSession(device.client.auth, device.readSaved, CAP);
    device.asked.length = 0;

    const begun = performance.now();
    const failure = await liveSession(device.client.auth, device.readSaved, "member").catch((error) => error);
    expect(performance.now() - begun).toBeLessThan(CAP + 500);
    expect(failure).toBeInstanceOf(AuthError);
    expect((failure as AuthError).code).toBe("network");
    expect(device.asked.filter((path) => path.startsWith("/rest/"))).toEqual([]);
    await renewalGivesUp(device);
    device.client.auth.stopAutoRefresh();
  });

  test("signing out takes moments, and the session stays gone once the connection returns", async () => {
    const device = phone(2 * HOUR, server);
    device.net.mode = "down";
    const restored = await restoreSession(device.client.auth, device.readSaved, CAP);
    expect(restored?.user.id).toBe("member");

    const begun = performance.now();
    await signOutHere(device.client.auth, device.forget, device.readSaved);
    expect(performance.now() - begun).toBeLessThan(CAP + 500);
    expect(device.saved.has(KEY)).toBe(false);

    // The connection returns, and the renewal that was being retried
    // succeeds: it isn't kept, and Supabase reports the sign-out.
    device.net.mode = "online";
    await device.client.auth.initialize();
    await expect.poll(() => device.events).toContain("SIGNED_OUT");
    await expect.poll(() => device.told.at(-1)).toBeNull();
    expect(device.told).not.toContain("member");
    expect(device.saved.has(KEY)).toBe(false);
    const { data } = await device.client.auth.getSession();
    expect(data.session).toBeNull();
    device.client.auth.stopAutoRefresh();
  });
});

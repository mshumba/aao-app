import { expect, test } from "@playwright/test";
import { AuthApiError, createClient, processLock } from "@supabase/supabase-js";
import { codeExchange, signOutHere } from "../src/auth/supabaseSession";
import { AuthError } from "../src/auth/types";

// Signing out and finishing links with the Supabase account service
// (src/auth/supabaseSession.ts), run in Node against the real supabase-js
// with a stand-in server, storage and clock. The on-device test mode has no
// Supabase, so the browser tests can't reach these.

/** SESSION_KEY in src/auth/sessionStorage.ts, which needs a device to load. */
const KEY = "aao.session";
const HOUR = 60 * 60 * 1000;

// supabase-js reads the time from Date.now; each test can move it on.
const realNow = Date.now;
let shift = 0;
test.beforeEach(() => {
  shift = 0;
  Date.now = () => realNow() + shift;
});
test.afterEach(() => {
  Date.now = realNow;
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** A session the stand-in server hands out, good for an hour. */
function session(id: string, provider = "email") {
  return {
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id,
      email: `${id}@example.com`,
      aud: "authenticated",
      app_metadata: { provider },
      user_metadata: {},
    },
  };
}

type Sent = { path: string; body: Record<string, unknown> };
type Device = Awaited<ReturnType<typeof device>>;

/**
 * One device: a Supabase client set up as the app's is on iPhone, the
 * storage it saves to, and a stand-in server that answers with `answer`.
 * Resolves once the client has started, as the app has by the time anyone
 * taps anything.
 */
async function device(answer: (sent: Sent) => Response) {
  const saved = new Map<string, string>();
  const sent: Sent[] = [];
  const events: string[] = [];
  const network = { online: true };
  const client = createClient("https://aao.invalid", "publishable-key", {
    auth: {
      storage: {
        getItem: async (key: string) => saved.get(key) ?? null,
        setItem: async (key: string, value: string) => void saved.set(key, value),
        removeItem: async (key: string) => void saved.delete(key),
      },
      storageKey: KEY,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      lock: processLock,
    },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const request = {
          path: url.pathname.replace("/auth/v1", "") + url.search,
          body: init?.body ? JSON.parse(String(init.body)) : {},
        };
        sent.push(request);
        if (!network.online) {
          // supabase-js retries a failed refresh for up to 30 s; the clock
          // jumps past that, as if every retry had failed too.
          shift += 30_000;
          throw new TypeError("Network request failed");
        }
        return answer(request);
      },
    },
  });
  await new Promise<void>((started) =>
    client.auth.onAuthStateChange((event) => {
      events.push(event);
      if (event === "INITIAL_SESSION") started();
    }),
  );
  return {
    auth: client.auth,
    saved,
    network,
    /** What the server was asked, by path. */
    asked: (prefix: string) => sent.filter((request) => request.path.startsWith(prefix)),
    signedOut: () => events.filter((event) => event === "SIGNED_OUT").length,
    /** The app's forgetSession, for this device's storage. */
    forget: async () => void saved.delete(KEY),
    /** The app's readSavedSession, for this device's storage. */
    readSaved: async () => {
      const raw = saved.get(KEY);
      return raw ? JSON.parse(raw) : null;
    },
  };
}

test.describe("signing out", () => {
  const server = ({ path }: Sent) => {
    if (path.startsWith("/token?grant_type=password")) return json(session("member"));
    if (path.startsWith("/token?grant_type=refresh_token")) return json(session("member"));
    if (path.startsWith("/logout")) return new Response(null, { status: 204 });
    throw new Error(`The stand-in server wasn't expecting ${path}`);
  };

  async function signedIn() {
    const phone = await device(server);
    await phone.auth.signInWithPassword({ email: "member@example.com", password: "a-long-password" });
    return phone;
  }

  test("offline with an expired access token, it still signs this device out", async () => {
    const phone = await signedIn();
    // Hours later, offline: signing out has to refresh the token first, and can't.
    shift += 2 * HOUR;
    phone.network.online = false;

    await signOutHere(phone.auth, phone.forget, phone.readSaved);
    expect(phone.saved.has(KEY)).toBe(false);
    expect(phone.signedOut()).toBe(1);

    // Back online, nothing signs the account in again.
    phone.network.online = true;
    const { data } = await phone.auth.getSession();
    expect(data.session).toBeNull();
    expect(phone.asked("/token")).toHaveLength(2); // the sign-in, and the offline refresh
  });

  test("offline with a current access token, it signs out once", async () => {
    const phone = await signedIn();
    phone.network.online = false;

    await signOutHere(phone.auth, phone.forget, phone.readSaved);
    expect(phone.saved.has(KEY)).toBe(false);
    expect(phone.signedOut()).toBe(1);
  });

  test("online with an expired access token, it refreshes it and tells the server", async () => {
    const phone = await signedIn();
    shift += 2 * HOUR;

    await signOutHere(phone.auth, phone.forget, phone.readSaved);
    expect(phone.asked("/token?grant_type=refresh_token")).toHaveLength(1);
    expect(phone.asked("/logout?scope=local")).toHaveLength(1);
    expect(phone.saved.has(KEY)).toBe(false);
    expect(phone.signedOut()).toBe(1);
  });

  test("when the session can't be cleared, it says so rather than reporting success", async () => {
    const phone = await signedIn();
    shift += 2 * HOUR;
    phone.network.online = false;

    const failure = await signOutHere(phone.auth, async () => {}, phone.readSaved).catch((error) => error);
    expect(failure).toBeInstanceOf(AuthError);
    expect((failure as AuthError).code).toBe("network");
    expect(phone.saved.has(KEY)).toBe(true);
    expect(phone.signedOut()).toBe(0);
  });
});

test.describe("a link back to the app", () => {
  // The link was asked for by link-owner; Apple signs in apple-member.
  const server = ({ path }: Sent) => {
    if (path.startsWith("/recover") || path.startsWith("/otp")) return json({});
    if (path.startsWith("/token?grant_type=id_token"))
      return json(session("apple-member", "apple"));
    if (path.startsWith("/token?grant_type=pkce")) return json(session("link-owner"));
    throw new Error(`The stand-in server wasn't expecting ${path}`);
  };
  const redirectTo = "aao://auth/callback";

  async function signInWithApple(phone: Device) {
    await phone.auth.signInWithIdToken({ provider: "apple", token: "apple-id-token", nonce: "nonce" });
  }

  async function currentUser(phone: Device) {
    const { data } = await phone.auth.getSession();
    return data.session?.user.id;
  }

  for (const before of ["as a guest", "after signing in with Apple"]) {
    test(`a reset link asked for as a guest and opened ${before} goes on to a new password`, async () => {
      const phone = await device(server);
      const codes = codeExchange(phone.auth, null);
      await phone.auth.resetPasswordForEmail("link-owner@example.com", { redirectTo });
      if (before !== "as a guest") {
        await signInWithApple(phone);
        expect(await currentUser(phone)).toBe("apple-member");
      }

      expect(await codes.exchange("reset-code")).toEqual({ status: "signedIn", recovery: true });
      const exchanged = phone.asked("/token?grant_type=pkce");
      expect(exchanged).toHaveLength(1);
      expect(exchanged[0].body.auth_code).toBe("reset-code");
      expect(await currentUser(phone)).toBe("link-owner");
    });
  }

  test("a sign-in link signs its account in once, however often the callback opens", async () => {
    const phone = await device(server);
    const codes = codeExchange(phone.auth, null);
    await phone.auth.signInWithOtp({
      email: "link-owner@example.com",
      options: { emailRedirectTo: redirectTo },
    });
    await signInWithApple(phone);

    const results = await Promise.all([codes.exchange("sign-in-code"), codes.exchange("sign-in-code")]);
    results.push(await codes.exchange("sign-in-code"));
    for (const result of results) expect(result).toEqual({ status: "signedIn", recovery: false });
    expect(phone.asked("/token?grant_type=pkce")).toHaveLength(1);
    expect(await currentUser(phone)).toBe("link-owner");
  });

  test("on the web, the code the page loaded with isn't exchanged again", async () => {
    const browser = await device(server);
    const codes = codeExchange(browser.auth, "reset-code");
    await browser.auth.resetPasswordForEmail("link-owner@example.com", { redirectTo });
    // What supabase-js does with the address as the page loads (detectSessionInUrl).
    await browser.auth.exchangeCodeForSession("reset-code");

    expect(await codes.exchange("reset-code")).toEqual({ status: "signedIn", recovery: true });
    expect(browser.asked("/token?grant_type=pkce")).toHaveLength(1);
    expect(await currentUser(browser)).toBe("link-owner");
  });

  test("on the web, a link that failed as the page loaded says so, even while signed in", async () => {
    let exchanges = 0;
    // supabase-js in a browser, its exchange on load refused as already used.
    const auth = {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      initialize: async () => ({
        error: new AuthApiError("Flow state not found", 404, "flow_state_not_found"),
      }),
      getSession: async () => ({ data: { session: session("apple-member") }, error: null }),
      exchangeCodeForSession: async () => {
        exchanges++;
        return { data: {}, error: null };
      },
    };
    const codes = codeExchange(auth as unknown as Parameters<typeof codeExchange>[0], "used-code");

    const failure = await codes.exchange("used-code").catch((error) => error);
    expect((failure as AuthError).code).toBe("expired_code");
    expect(exchanges).toBe(0);
  });
});

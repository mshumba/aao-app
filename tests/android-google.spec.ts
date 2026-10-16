import { expect, test } from "@playwright/test";
import { AuthError } from "../src/auth/types";

const nodeRequire = require as unknown as {
  (id: string): unknown;
  cache: Record<string, unknown>;
};

// Drives src/auth/config.ts and src/auth/supabaseBackend.ts across Android,
// iPhone, Expo Go and the web without a device, by standing in for the
// React Native and Expo native modules at require time.

type FakeScenario = {
  os: "android" | "ios" | "web";
  iosClientId?: string;
  webClientId?: string;
  hasNativeModule?: boolean;
  playServices?: boolean | "throw-unavailable" | "throw-other";
  signInResult?:
    | { type: "success"; idToken: string | null }
    | { type: "cancelled" }
    | "throw-cancelled"
    | "throw-error";
  tokenRejected?: boolean;
};

function runScenario(scenario: FakeScenario) {
  const configured: Record<string, unknown>[] = [];
  const playServicesCalls: Record<string, unknown>[] = [];
  let signInCalls = 0;
  let signOutCalls = 0;
  let oauthCalls = 0;
  const idTokens: { provider: string; token: string; nonce?: string }[] = [];

  const statusCodes = {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
    PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
    SIGN_IN_REQUIRED: "SIGN_IN_REQUIRED",
  };

  const googleModule = {
    statusCodes,
    GoogleSignin: {
      configure(options: Record<string, unknown>) {
        configured.push(options);
      },
      async hasPlayServices(options: Record<string, unknown>) {
        playServicesCalls.push(options);
        if (scenario.playServices === "throw-unavailable") {
          const err = new Error("Play services not available") as Error & { code: string };
          err.code = statusCodes.PLAY_SERVICES_NOT_AVAILABLE;
          throw err;
        }
        if (scenario.playServices === "throw-other") {
          throw new Error("Play check crashed");
        }
        return scenario.playServices ?? true;
      },
      async signIn() {
        signInCalls++;
        const mode = scenario.signInResult ?? { type: "success", idToken: "google-id-token" };
        if (mode === "throw-cancelled") {
          const err = new Error("Cancelled") as Error & { code: string };
          err.code = statusCodes.SIGN_IN_CANCELLED;
          throw err;
        }
        if (mode === "throw-error") {
          throw new Error("DEVELOPER_ERROR");
        }
        if (mode.type === "cancelled") {
          return { type: "cancelled" as const, data: null };
        }
        return {
          type: "success" as const,
          data: { idToken: mode.idToken },
        };
      },
      async signOut() {
        signOutCalls++;
        return null;
      },
    },
  };

  const stubs: Record<string, unknown> = {
    "react-native": {
      Platform: { OS: scenario.os },
      AppState: { addEventListener: () => ({ remove: () => {} }) },
      TurboModuleRegistry: {
        get: (name: string) =>
          name === "RNGoogleSignin" && (scenario.hasNativeModule ?? true) ? {} : null,
      },
    },
    "expo-constants": {
      default: { executionEnvironment: "bare" },
      ExecutionEnvironment: { StoreClient: "storeClient" },
    },
    "expo-apple-authentication": {},
    "expo-crypto": {},
    "expo-linking": {
      createURL: (path: string) => `aao://${path}`,
      parse: () => ({ queryParams: { code: "oauth-code" } }),
    },
    "expo-web-browser": {
      openAuthSessionAsync: async () => ({
        type: "success",
        url: "aao://auth/callback?code=oauth-code",
      }),
    },
    "expo-secure-store": {},
    "@react-native-async-storage/async-storage": { default: {} },
    "@react-native-google-signin/google-signin": googleModule,
    "@supabase/supabase-js": {
      AuthError: class FakeSupabaseAuthError extends Error {
        code?: string;
        status?: number;
      },
      processLock: {},
      createClient: () => ({
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          startAutoRefresh: () => {},
          stopAutoRefresh: () => {},
          signInWithOAuth: async () => {
            oauthCalls++;
            return { data: { url: "https://example.supabase.co/auth/v1/authorize" }, error: null };
          },
          exchangeCodeForSession: async () => ({ data: {}, error: null }),
          signInWithIdToken: async (args: { provider: string; token: string; nonce?: string }) => {
            idTokens.push(args);
            if (scenario.tokenRejected) {
              return { data: null, error: new Error("Invalid token audience") };
            }
            return { data: {}, error: null };
          },
        },
      }),
    },
  };

  const prevEnv = {
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = scenario.iosClientId ?? "";
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = scenario.webClientId ?? "";
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

  const moduleLoader = nodeRequire("module") as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request in stubs) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    for (const key of Object.keys(nodeRequire.cache)) {
      if (key.includes("/src/auth/config") || key.includes("/src/auth/supabaseBackend")) {
        delete nodeRequire.cache[key];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSupabaseBackend } = require("../src/auth/supabaseBackend") as typeof import("../src/auth/supabaseBackend");
    const backend = createSupabaseBackend();
    return {
      backend,
      configured,
      playServicesCalls,
      counts: () => ({ signInCalls, signOutCalls, oauthCalls }),
      idTokens,
    };
  } finally {
    moduleLoader._load = originalLoad;
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = prevEnv.ios;
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = prevEnv.web;
    process.env.EXPO_PUBLIC_SUPABASE_URL = prevEnv.url;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevEnv.key;
  }
}

test("Android uses Google's native sheet with webClientId only and checks Play Services", async () => {
  const h = runScenario({
    os: "android",
    iosClientId: "ios-client-id",
    webClientId: "web-client-id",
    hasNativeModule: true,
  });

  const first = await h.backend.signInWithGoogle();
  const second = await h.backend.signInWithGoogle();

  expect(first).toEqual({ status: "signedIn" });
  expect(second).toEqual({ status: "signedIn" });
  // Configured once, with webClientId and no iosClientId on Android.
  expect(h.configured).toEqual([{ webClientId: "web-client-id" }]);
  expect(h.playServicesCalls).toEqual([
    { showPlayServicesUpdateDialog: true },
    { showPlayServicesUpdateDialog: true },
  ]);
  expect(h.counts()).toEqual({ signInCalls: 2, signOutCalls: 2, oauthCalls: 0 });
  expect(h.idTokens).toEqual([
    { provider: "google", token: "google-id-token", nonce: undefined },
    { provider: "google", token: "google-id-token", nonce: undefined },
  ]);
});

test("iOS keeps iosClientId and webClientId configuration", async () => {
  const h = runScenario({
    os: "ios",
    iosClientId: "ios-client-id",
    webClientId: "web-client-id",
    hasNativeModule: true,
  });

  const result = await h.backend.signInWithGoogle();

  expect(result).toEqual({ status: "signedIn" });
  expect(h.configured).toEqual([
    { iosClientId: "ios-client-id", webClientId: "web-client-id" },
  ]);
  expect(h.counts()).toEqual({ signInCalls: 1, signOutCalls: 1, oauthCalls: 0 });
});

test("falls back to the web OAuth flow when RNGoogleSignin or the required client ID is missing", async () => {
  // Android without webClientId (even if iosClientId is set).
  const noWebId = runScenario({
    os: "android",
    iosClientId: "ios-client-id",
    webClientId: "",
    hasNativeModule: true,
  });
  expect(await noWebId.backend.signInWithGoogle()).toEqual({ status: "signedIn" });
  expect(noWebId.counts()).toEqual({ signInCalls: 0, signOutCalls: 0, oauthCalls: 1 });

  // Android in Expo Go / older build without the native module.
  const noModule = runScenario({
    os: "android",
    webClientId: "web-client-id",
    hasNativeModule: false,
  });
  expect(await noModule.backend.signInWithGoogle()).toEqual({ status: "signedIn" });
  expect(noModule.counts()).toEqual({ signInCalls: 0, signOutCalls: 0, oauthCalls: 1 });

  // iOS without iosClientId.
  const noIosId = runScenario({
    os: "ios",
    iosClientId: "",
    webClientId: "web-client-id",
    hasNativeModule: true,
  });
  expect(await noIosId.backend.signInWithGoogle()).toEqual({ status: "signedIn" });
  expect(noIosId.counts()).toEqual({ signInCalls: 0, signOutCalls: 0, oauthCalls: 1 });
});

test("Play Services not available reports provider_unavailable before calling signIn()", async () => {
  for (const playServices of [false, "throw-unavailable"] as const) {
    const h = runScenario({
      os: "android",
      webClientId: "web-client-id",
      playServices,
    });
    let caught: unknown;
    try {
      await h.backend.signInWithGoogle();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as AuthError).code).toBe("provider_unavailable");
    expect(h.counts().signInCalls).toBe(0);
  }
});

test("cancelling the native Google sheet returns cancelled", async () => {
  for (const signInResult of [{ type: "cancelled" as const }, "throw-cancelled" as const]) {
    const h = runScenario({
      os: "android",
      webClientId: "web-client-id",
      signInResult,
    });
    expect(await h.backend.signInWithGoogle()).toEqual({ status: "cancelled" });
    expect(h.counts().signOutCalls).toBe(0);
  }
});

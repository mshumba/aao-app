import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/**
 * Account service settings from EXPO_PUBLIC_* variables (see .env.example).
 * They are public by design: the Supabase anon/publishable key only allows
 * what the database's row level security policies allow.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "";
const requested = process.env.EXPO_PUBLIC_AUTH_MODE?.trim();

/**
 * "supabase" when a project is configured. "local" is a stand-in account
 * service that never leaves the device, for development and the automated
 * tests; release builds only use it when EXPO_PUBLIC_AUTH_MODE=local asks for
 * it explicitly. Otherwise accounts are "unavailable" and the app says so.
 */
export const authMode: "supabase" | "local" | "unavailable" =
  requested === "local"
    ? "local"
    : url && key
      ? "supabase"
      : __DEV__
        ? "local"
        : "unavailable";

export const supabaseConfig = { url, key };

// Typed explicitly: without the generated expo-env.d.ts (as in CI),
// process.env values are untyped.
const methodList: string =
  process.env.EXPO_PUBLIC_AUTH_METHODS ?? "apple,google,email";
const methods = methodList.split(",").map((x: string) => x.trim().toLowerCase());

// Expo Go signs in with Apple as its own app (host.exp.Exponent), which the
// Supabase Apple provider doesn't list, so Apple would only fail there.
// Development, TestFlight and App Store builds are com.mshumba.aao.
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Sign-in methods shown. Each needs its provider enabled in Supabase; leave
 * one out until it is. "apple" is native Sign in with Apple on iOS (not in
 * Expo Go); Apple on the web and Android goes through Supabase's web flow,
 * which needs a Services ID, so it is opt-in with "apple-web".
 */
export const enabledMethods =
  authMode === "local"
    ? // The stand-in simulates every method on every platform.
      { apple: true, google: true, email: true }
    : {
        apple:
          Platform.OS === "ios"
            ? methods.includes("apple") && !inExpoGo
            : methods.includes("apple-web"),
        google: methods.includes("google"),
        email: methods.includes("email"),
      };

/** Public web address used in share links and email redirects. */
export const webUrl = (
  process.env.EXPO_PUBLIC_WEB_URL?.trim() || "https://aao-app.expo.app"
).replace(/\/+$/, "");

export const isNativeApple = Platform.OS === "ios";

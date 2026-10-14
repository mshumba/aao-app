import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Small JSON helpers over AsyncStorage (localStorage on web). Storage can be
 * unavailable (private browsing, a full disk), so reads fall back to the
 * default and writes never throw: the app keeps working for the session.
 */
export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function writeJSON(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisted; the in-memory state still applies for this session.
  }
}

export async function removeKey(key: string) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Nothing to clean up.
  }
}

/** Every key the app owns starts with this, so sign-out can clear them. */
export const keys = {
  onboarding: "aao.onboarding.v1",
  pendingIntent: "aao.pendingIntent.v1",
  /** Apple's name for a new account, until the profile has it. */
  pendingName: "aao.pendingName.v1",
  sharedPasses: "aao.sharedPasses.v1",
  guestWatch: "aao.guestWatch.v1",
  localSession: "aao.local.session.v1",
  localData: (userId: string) => `aao.local.data.v1.${userId}`,
  // The sermon library's on-device copy (catalogue/records.ts).
  catalogue: "aao.catalogue.v1",
};

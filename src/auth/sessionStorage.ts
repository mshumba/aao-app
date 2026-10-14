import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Where Supabase keeps the session on iPhone and Android: the Keychain /
 * Keystore through expo-secure-store. Sessions can outgrow what one secure
 * item comfortably holds, so values are split into chunks.
 */
export const SESSION_KEY = "aao.session";
const CHUNK = 1800;
// The Keychain survives deleting the app; AsyncStorage doesn't. Its absence
// on launch means a fresh install, so an old session is cleared, not reused.
const INSTALL_MARK = "aao.install.v1";

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function remove(key: string) {
  const count = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
  await Promise.all(
    Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i))),
  );
  await SecureStore.deleteItemAsync(countKey(key));
}

let installCheck: Promise<void> | null = null;
function checkInstall() {
  installCheck ??= (async () => {
    try {
      if (await AsyncStorage.getItem(INSTALL_MARK)) return;
      await Promise.all([
        remove(SESSION_KEY),
        remove(`${SESSION_KEY}-code-verifier`),
        remove(`${SESSION_KEY}-user`),
      ]);
      await AsyncStorage.setItem(INSTALL_MARK, "1");
    } catch {
      // Storage unavailable: carry on; the session simply won't persist.
    }
  })();
  return installCheck;
}

export const secureSessionStorage = {
  async getItem(key: string) {
    await checkInstall();
    const count = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    return parts.some((part) => part == null) ? null : parts.join("");
  },
  async setItem(key: string, value: string) {
    await checkInstall();
    await remove(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
    await Promise.all(
      parts.map((part, i) => SecureStore.setItemAsync(chunkKey(key, i), part)),
    );
    await SecureStore.setItemAsync(countKey(key), String(parts.length));
  },
  async removeItem(key: string) {
    await checkInstall();
    await remove(key);
  },
};

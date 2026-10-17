import type { ConfigContext, ExpoConfig } from "expo/config";
import { withEntitlementsPlist } from "expo/config-plugins";

/**
 * app.json holds the app's configuration; this adds what depends on how the
 * iPhone app is signed.
 *
 * Sign in with Apple needs the paid Apple Developer Program. A free
 * "Personal Team" can't sign its entitlement, so a local device build made
 * before joining runs with AAO_PERSONAL_TEAM=1 to leave it out. The Apple
 * button then reports that option isn't available; other sign-in methods work.
 */
const personalTeam = process.env.AAO_PERSONAL_TEAM === "1";

export default ({ config }: ConfigContext): ExpoConfig => {
  // app.json always sets name and slug.
  const app = {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: !personalTeam },
  } as ExpoConfig;
  if (!personalTeam) return app;
  // expo-apple-authentication adds the entitlement whenever it's installed,
  // listed in plugins or not. A mod added here runs after every plugin's.
  return withEntitlementsPlist(app, (mod) => {
    delete mod.modResults["com.apple.developer.applesignin"];
    return mod;
  });
};

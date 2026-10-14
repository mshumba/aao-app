// iOS 27 refuses to launch an app built with its SDK unless the app adopts the
// scene-based life cycle. Expo SDK 57 ships ExpoAppSceneDelegate for this, but
// its prebuild template (57.0.28) still creates the window in the app delegate.
// This plugin switches the generated project over. Remove it once Expo's
// template uses the scene delegate itself.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const WINDOW_SETUP =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\([\s\S]*?\)\s*#endif\n/;

function withSceneManifest(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (mod) => {
    let source = mod.modResults.contents;
    if (source.includes("ExpoReactNativeFactoryProvider")) return mod;
    const declaration = "class AppDelegate: ExpoAppDelegate {";
    if (mod.modResults.language !== "swift" || !source.includes(declaration) || !WINDOW_SETUP.test(source))
      throw new Error(
        "with-ios-scene-lifecycle: the generated AppDelegate has changed shape. Check whether Expo's template now adopts the scene life cycle, and remove or update this plugin.",
      );
    source = source
      .replace(declaration, "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {")
      .replace(WINDOW_SETUP, "    // ExpoAppSceneDelegate creates the window and starts React Native in it.\n");
    mod.modResults.contents = source;
    return mod;
  });
}

module.exports = function withIosSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};

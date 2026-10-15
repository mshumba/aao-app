import { Tabs } from "expo-router";
import { TabBar } from "../../tabBar";
import { c } from "../../theme";

/** Home · Paths · Search · Account, as in the approved concept. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Tabs are peers, so switching never slides.
        animation: "none",
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="paths" options={{ title: "Paths" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
      {/* No longer a tab: old /topics links land on Search (browse by topic). */}
      <Tabs.Screen name="topics" options={{ title: "Topics", href: null }} />
    </Tabs>
  );
}

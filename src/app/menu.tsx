import { Href, router, useLocalSearchParams, useNavigation } from "expo-router";
import { ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { useDemo } from "../state/demo";
import { Header, Icon, Page, T, c, s } from "../ui";
type MenuItem = {
  title: string;
  description?: string;
  icon: ComponentProps<typeof Icon>["name"];
  route: Href;
};
const sections: { title: string; items: MenuItem[] }[] = [
  {
    title: "EXPLORE",
    items: [
      {
        title: "Browse sermons",
        description: "Featured and latest messages",
        icon: "grid-outline",
        route: "/",
      },
      {
        title: "Browse by topic",
        description: "Spiritual growth, prayer, faith and more",
        icon: "leaf-outline",
        route: "/library",
      },
      {
        title: "Search",
        description: "Find a title, topic or gathering",
        icon: "search-outline",
        route: "/search",
      },
    ],
  },
  {
    title: "YOUR SPACE",
    items: [
      {
        title: "Account (demo)",
        description: "Try the account flow; watching stays open",
        icon: "person-outline",
        route: "/account",
      },
    ],
  },
  {
    title: "ABOUT THE PROTOTYPE",
    items: [
      {
        title: "About this prototype",
        icon: "information-circle-outline",
        route: "/about",
      },
      {
        title: "Privacy (draft)",
        icon: "shield-checkmark-outline",
        route: "/privacy",
      },
      { title: "Preview app states", icon: "flask-outline", route: "/states" },
    ],
  },
];
export default function Menu() {
  const { signedIn, setSignedIn } = useDemo();
  const { origin } = useLocalSearchParams<{ origin?: string }>();
  const navigation = useNavigation();
  function navigate(route: Href) {
    if (route === origin && router.canGoBack()) {
      router.back();
      return;
    }
    // Menu destinations are static routes in this root stack. Pop to an
    // existing screen without rewriting its params (and resetting search).
    const state = navigation.getState();
    const name = String(route).slice(1) || "index";
    const index =
      state?.routes.findLastIndex(
        (entry) => entry.name === name || entry.name === `${name}/index`,
      ) ?? -1;
    if (state && index >= 0 && index < state.index) {
      router.dismiss(state.index - index);
    } else {
      router.replace(route);
    }
  }
  return (
    <Page>
      <Header title="The Viewing Room" close />
      <T style={[s.title, { marginTop: 10, marginBottom: 12 }]}>
        Find what{"\n"}builds you.
      </T>
      <T style={[s.body, { marginBottom: 28 }]}>
        {signedIn
          ? "Demo Viewer · signed in (demo)"
          : "Browse freely. No account needed."}
      </T>
      {sections.map((section) => (
        <View key={section.title} style={{ marginBottom: 30, gap: 12 }}>
          <T style={s.collection}>{section.title}</T>
          <View style={{ gap: 10 }}>
            {section.items.map((item) => (
              <Pressable
                key={String(item.route)}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                onPress={() => navigate(item.route)}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 16,
                    minHeight: 64,
                    padding: 16,
                    borderRadius: 16,
                    backgroundColor: c.surface,
                  },
                  pressed && s.pressed,
                ]}
              >
                <Icon name={item.icon} color={c.mint} />
                <View style={{ flex: 1, gap: 4 }}>
                  <T style={{ fontFamily: "Manrope_600SemiBold" }}>
                    {item.title}
                  </T>
                  {item.description && (
                    <T style={s.small}>{item.description}</T>
                  )}
                </View>
                <Icon name="chevron-forward" size={18} color={c.muted} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {signedIn && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setSignedIn(false)}
          style={{ minHeight: 56, justifyContent: "center" }}
        >
          <T style={{ color: c.mint }}>Sign out of demo</T>
        </Pressable>
      )}
      <T style={s.small}>AAO · Prototype 0.1.0</T>
    </Page>
  );
}

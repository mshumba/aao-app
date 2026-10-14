import { Href } from "expo-router";
import { Fragment } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { DemoPanel } from "../../demoAccount";
import { useGo } from "../../navigation";
import { useDemo } from "../../state/demo";
import { font, radius, space, type } from "../../theme";
import {
  Button,
  Heading,
  Icon,
  IconName,
  Page,
  PageTitle,
  T,
  Tap,
  c,
  s,
} from "../../ui";

const about: { title: string; icon: IconName; route: Href; hint?: string }[] = [
  {
    title: "About this preview",
    icon: "information-circle-outline",
    route: "/about",
  },
  {
    title: "Privacy (draft)",
    icon: "shield-checkmark-outline",
    route: "/privacy",
  },
  {
    title: "Sample screens",
    icon: "flask-outline",
    route: "/states",
    hint: "Loading, offline and error examples",
  },
];

export default function AccountTab() {
  const { signedIn, setSignedIn } = useDemo();
  const go = useGo();

  return (
    <Page>
      <PageTitle title="Account" />

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.avatar}>
            <Icon
              name={signedIn ? "person" : "person-outline"}
              color={c.mint}
              size={24}
            />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Heading level={2} style={styles.cardTitle}>
              {signedIn ? "Demo Viewer" : "Sign in or create an account"}
            </Heading>
            <T style={s.meta}>
              {signedIn
                ? "Signed in to the demo"
                : "Demo · accounts aren’t live yet"}
            </T>
          </View>
        </View>
        {signedIn ? (
          <Button
            label="Sign out of demo"
            variant="secondary"
            onPress={() => {
              setSignedIn(false);
              AccessibilityInfo.announceForAccessibility(
                "Signed out of the demo.",
              );
            }}
          />
        ) : (
          <View style={styles.actions}>
            <Button
              label="Sign in"
              onPress={() => go.push("/account/sign-in")}
            />
            <Button
              label="Create account"
              variant="secondary"
              onPress={() => go.push("/account/sign-up")}
            />
          </View>
        )}
      </View>

      <View style={{ marginTop: space.lg }}>
        <DemoPanel
          text={
            signedIn
              ? "This demo sign-in wasn’t checked against anything and nothing about it is saved. You never need an account to browse, search or watch."
              : "Accounts aren’t live yet. Nothing you type is sent or saved, so please use sample details, not a real password. You never need an account to browse, search or watch."
          }
        />
      </View>

      <View style={styles.group}>
        <Heading level={2} style={styles.groupTitle}>
          About
        </Heading>
        <View style={styles.list}>
          {about.map((item, index) => (
            <Fragment key={String(item.route)}>
              {index > 0 && <View style={styles.divider} />}
              <Tap
                accessibilityRole="button"
                accessibilityLabel={item.title}
                accessibilityHint={item.hint}
                onPress={() => go.push(item.route)}
                feedback="highlight"
                style={[
                  styles.row,
                  index === 0 && styles.first,
                  index === about.length - 1 && styles.last,
                ]}
              >
                <Icon name={item.icon} color={c.mint} size={22} />
                <T style={styles.rowTitle}>{item.title}</T>
                <Icon name="chevron-forward" size={18} color={c.muted} />
              </Tap>
            </Fragment>
          ))}
        </View>
      </View>

      <T style={[s.meta, { marginTop: space.xxl }]}>Preview 0.1.0</T>
    </Page>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.md,
    padding: space.lg,
    gap: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontFamily: font.bold, fontSize: 17, lineHeight: 23 },
  actions: { gap: space.md },
  group: { marginTop: 32, gap: space.sm },
  groupTitle: { ...type.kicker, color: c.muted, paddingHorizontal: space.lg },
  // No overflow clipping, so web focus rings on rows stay visible; the first
  // and last rows carry the corner radius instead.
  list: { borderRadius: radius.lg, backgroundColor: c.surface },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  rowTitle: { flex: 1, ...type.label, fontSize: 16, lineHeight: 22 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.divider,
    marginStart: 52,
  },
});

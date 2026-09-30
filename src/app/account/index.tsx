import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useDemo } from "../../state/demo";
import { Button, c, Header, Page, T } from "../../ui";

function closeAccount() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

export default function AccountScreen() {
  const { signedIn, setSignedIn } = useDemo();

  return (
    <Page>
      <Header title="Account (demo)" close />
      <View style={styles.content}>
        <View style={styles.badge}>
          <T style={styles.badgeText}>DEMO — no account service</T>
        </View>
        <View style={styles.icon}>
          <Ionicons
            name={signedIn ? "person-circle-outline" : "person-outline"}
            size={38}
            color={c.mint}
          />
        </View>
        <T accessibilityRole="header" style={styles.title}>
          {signedIn ? "Hello, Demo Viewer." : "A place to return to."}
        </T>
        <T style={styles.body}>
          {signedIn
            ? "You’re signed in (demo). This temporary state disappears when you sign out or reload the app."
            : "Preview a simple account flow. Nothing you enter is sent or saved, and no real account is created."}
        </T>
        <View style={styles.actions}>
          {signedIn ? (
            <>
              <Button
                label="Return to sermons"
                onPress={closeAccount}
                icon="arrow-forward"
              />
              <Button
                label="Sign out (demo)"
                secondary
                onPress={() => setSignedIn(false)}
              />
            </>
          ) : (
            <>
              <Button
                label="Sign in (demo)"
                onPress={() => router.replace("/account/sign-in")}
                icon="arrow-forward"
              />
              <Button
                label="Create account (demo)"
                secondary
                onPress={() => router.replace("/account/sign-up")}
              />
              <Button
                label="Continue as guest"
                secondary
                onPress={closeAccount}
              />
            </>
          )}
        </View>
        <View style={styles.note}>
          <Ionicons name="play-circle-outline" color={c.muted} size={22} />
          <T style={styles.noteText}>
            Browsing, searching and watching are always open to guests.
          </T>
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36, gap: 20 },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  badgeText: { color: c.mint, fontSize: 12, fontFamily: "Manrope_700Bold" },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: c.surface,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  title: {
    fontSize: 34,
    lineHeight: 42,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: -1,
  },
  body: { color: c.muted, fontSize: 16, lineHeight: 25 },
  actions: { gap: 12, marginTop: 12 },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 22,
    marginTop: 12,
  },
  noteText: { flex: 1, color: c.muted, fontSize: 13, lineHeight: 21 },
});

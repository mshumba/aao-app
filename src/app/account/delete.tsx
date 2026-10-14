import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import type { AuthUser } from "../../auth/types";
import { FormAlert, useAuthTask } from "../../auth/ui";
import { exitTo, useGo } from "../../navigation";
import { radius, space, type } from "../../theme";
import { useToast } from "../../toast";
import {
  Button,
  Header,
  Heading,
  Icon,
  IconName,
  Notice,
  Page,
  PageTitle,
  StatePanel,
  T,
  c,
  s,
} from "../../ui";

const deleted: { icon: IconName; text: string }[] = [
  { icon: "person-outline", text: "Your name and sign-in details" },
  { icon: "albums-outline", text: "Your topics" },
  { icon: "bookmark-outline", text: "Your saved sermons" },
];

/**
 * Account deletion, in the app as App Review requires. One deliberate
 * confirmation, then it happens at once; there's nothing to undo.
 */
export default function DeleteAccount() {
  const account = useAccount();
  const go = useGo();
  const toast = useToast();
  const task = useAuthTask();
  // Deleting signs the viewer out before this screen closes; holding on to
  // who it was keeps the confirmation up meanwhile, rather than flashing
  // "not signed in".
  const [leaving, setLeaving] = useState<AuthUser | null>(null);
  const user = account.user ?? leaving;
  const busy = task.busy === "delete";

  if (!account.ready)
    return (
      <Page>
        <Header back />
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading your account" />
        </View>
      </Page>
    );

  if (!user)
    return (
      <Page>
        <Header back />
        <StatePanel
          level={1}
          icon="person-outline"
          title="You’re not signed in"
          body={
            account.mode === "unavailable"
              ? "There’s no account on this device to delete."
              : "Sign in to the account you want to delete."
          }
          label={account.mode === "unavailable" ? undefined : "Sign in"}
          action={
            account.mode === "unavailable"
              ? undefined
              : () => go.push({ pathname: "/join", params: { mode: "sign-in" } })
          }
        />
      </Page>
    );

  async function confirm() {
    if (task.busy || !account.user) return;
    setLeaving(account.user);
    const done = await task.run("delete", async () => {
      await account.deleteAccount();
      return true;
    });
    if (!done) {
      setLeaving(null);
      return;
    }
    exitTo("/");
    toast("Your account was deleted");
  }

  return (
    <Page>
      <Header back />
      <PageTitle
        title="Delete your account?"
        lead={
          user.email
            ? `This deletes the account for ${user.email} straight away. It can’t be undone.`
            : "This deletes your account straight away. It can’t be undone."
        }
      />

      <View style={styles.card}>
        <Heading level={2} style={styles.cardTitle}>
          What’s deleted
        </Heading>
        <View style={{ gap: space.md }} role="list">
          {deleted.map((item) => (
            <View key={item.text} style={styles.item} role="listitem">
              <Icon name={item.icon} color={c.error} size={20} />
              <T style={styles.itemText}>{item.text}</T>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.notes}>
        <T style={s.body}>
          You can keep browsing without an account, or create a new one later.
          Topics you chose on this device stay on it.
        </T>
        {user.provider === "apple" && (
          <Notice icon="logo-apple">
            If you signed in with Apple, you can also stop using Apple ID with
            AAO in Settings › your name › Sign in with Apple.
          </Notice>
        )}
      </View>

      <View style={styles.actions}>
        <FormAlert message={task.error} />
        {/* Destructive, so never the app's navy: the error red, white text. */}
        <Button
          testID="confirm-delete"
          label="Delete account"
          icon="trash-outline"
          variant="danger"
          busy={busy}
          onPress={confirm}
        />
        <Button
          label="Keep my account"
          variant="secondary"
          disabled={busy}
          onPress={go.back}
        />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  card: {
    marginTop: space.lg,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardTitle: { ...type.kicker, color: c.muted },
  item: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  itemText: { ...type.body, flex: 1, color: c.text },
  notes: { marginTop: space.xl, gap: space.lg },
  actions: { marginTop: space.xxl, gap: space.md },
});

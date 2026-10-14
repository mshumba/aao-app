import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { AuthField, FormAlert, useAuthTask } from "../../auth/ui";
import { useGo } from "../../navigation";
import { space } from "../../theme";
import { useToast } from "../../toast";
import { Button, Header, Page, PageTitle, StatePanel, c } from "../../ui";

export default function NameScreen() {
  const account = useAccount();
  const go = useGo();

  // The profile arrives a moment after the session; wait for it so the
  // field starts with the saved name.
  if (!account.ready || (account.user && !account.profile))
    return (
      <Page>
        <Header back />
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading your name" />
        </View>
      </Page>
    );

  if (!account.user)
    return (
      <Page>
        <Header back />
        <StatePanel
          level={1}
          icon="person-outline"
          title="You’re not signed in"
          body={
            account.mode === "unavailable"
              ? "Accounts are coming soon. You can browse and watch without one."
              : "Your name is kept with your account. Sign in to add it."
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

  return <NameForm initial={account.displayName ?? ""} />;
}

function NameForm({ initial }: { initial: string }) {
  const account = useAccount();
  const go = useGo();
  const toast = useToast();
  const task = useAuthTask();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<TextInput>(null);

  async function save() {
    const clean = name.trim();
    if (!clean) {
      const message = "Enter your first name.";
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
      input.current?.focus();
      return;
    }
    const done = await task.run("save", async () => {
      await account.updateProfile({ displayName: clean });
      return true;
    });
    if (!done) return;
    toast("Name updated");
    go.back();
  }

  return (
    <Page keyboard>
      <Header back />
      <PageTitle
        title="Your name"
        lead="Used to greet you in the app. Only you can see it."
      />
      <View style={styles.form}>
        <AuthField
          id="name-input"
          kind="name"
          label="First name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (error) setError(null);
          }}
          inputRef={input}
          error={error}
          editable={!task.busy}
          returnKey="done"
          onSubmit={save}
          // Straight to typing when there's no name yet; an existing one is
          // shown first, so the keyboard doesn't cover the page unasked.
          autoFocus={!initial}
        />
        <FormAlert message={task.error} />
        <Button
          testID="save-name"
          label="Save name"
          busy={task.busy === "save"}
          onPress={save}
        />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  form: { marginTop: space.xl, gap: space.lg },
});

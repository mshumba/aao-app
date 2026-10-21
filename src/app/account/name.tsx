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
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    // A second failure shows this state again; nothing else to report.
    await account.reloadProfile();
    setRetrying(false);
  }

  // Without the saved name the field can't start from it, and a name typed
  // blind could replace one that's there.
  if (account.user && account.profileError && !retrying)
    return (
      <Page header={<Header back />}>
        <StatePanel
          level={1}
          tone="error"
          icon="cloud-offline-outline"
          title="Your name didn’t load"
          body="Check your connection and try again."
          label="Try again"
          action={retry}
        />
      </Page>
    );

  // The profile arrives a moment after the session; wait for it so the
  // field starts with the saved name.
  if (!account.ready || (account.user && !account.profile))
    return (
      <Page header={<Header back />}>
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading your name" />
        </View>
      </Page>
    );

  if (!account.user)
    return (
      <Page header={<Header back />}>
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
    <Page keyboard header={<Header back />}>
      <PageTitle
        kicker="Account"
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

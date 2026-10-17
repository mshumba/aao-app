import { Stack, router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import {
  AuthField,
  FlowButton,
  FlowScreen,
  FlowTitle,
  FormAlert,
  useAuthTask,
} from "../../auth/ui";
import { space } from "../../theme";
import { T, TextButton, c, s } from "../../ui";

// The account can land a moment after the sign-in screens close.
const ACCOUNT_GRACE_MS = 1500;
// Past this, a profile that still hasn't loaded gets a way past this step.
const SLOW_PROFILE_MS = 4000;

/**
 * Onboarding step 3: a first name to greet them by. Skipped when Apple or
 * Google already gave one, or when nobody is signed in. The account exists
 * by now, so there's no going back to the sign-up step.
 */
export default function OnboardingName() {
  const account = useAccount();
  const task = useAuthTask();
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { ready, user, profile, displayName, profileError } = account;
  // The profile has loaded once it's set; only then is a missing name real.
  // A profile that failed to load isn't asked about: it may well have a
  // name, which an answer here would replace. It's tried again meanwhile.
  // Once the question is showing it stays, even when saving fills in the
  // profile's name before the request has finished.
  const [asking, setAsking] = useState(false);
  if (!asking && ready && user && profile && !displayName) setAsking(true);
  const [slow, setSlow] = useState(false);
  const waiting = !asking && !!user && !profile;
  // Still loading after a while, or it failed: Skip leads on, and the name
  // can be added later in Account.
  const stuck = waiting && (slow || profileError);
  const left = useRef(false);
  const input = useRef<TextInput>(null);
  const trimmed = name.trim();

  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    router.replace("/onboarding/done");
  }, []);

  useEffect(() => {
    if (!ready || asking) return;
    if (user) {
      if (profile && displayName) leave();
      return;
    }
    const timer = setTimeout(leave, ACCOUNT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [ready, asking, user, profile, displayName, leave]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), SLOW_PROFILE_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  async function submit() {
    if (!trimmed) {
      const message = "Enter your first name, or tap Skip.";
      setFieldError(message);
      AccessibilityInfo.announceForAccessibility(message);
      input.current?.focus();
      return;
    }
    setFieldError(null);
    const saved = await task.run("name", async () => {
      await account.updateProfile({ displayName: trimmed });
      return true;
    });
    if (saved) leave();
  }

  const busy = task.busy !== null;

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <FlowScreen
        leading="none"
        step={[3, 3]}
        trailing={
          asking || stuck ? (
            <TextButton label="Skip" testID="name-skip" align="end" onPress={leave} />
          ) : undefined
        }
        footer={
          asking ? (
            <FlowButton
              label="Continue"
              testID="name-continue"
              busy={busy}
              disabled={!trimmed}
              onPress={submit}
            />
          ) : undefined
        }
      >
        {asking ? (
          <>
            <FlowTitle
              title="What should we call you?"
              italic="call you"
              lead="We’ll use your first name to greet you. You can change it in Account."
            />
            <AuthField
              id="name-input"
              kind="name"
              label="First name"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (fieldError) setFieldError(null);
              }}
              inputRef={input}
              error={fieldError}
              editable={!busy}
              returnKey="done"
              onSubmit={submit}
              autoFocus
            />
            <FormAlert message={task.error} />
          </>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={c.accent} accessibilityLabel="Loading your account" />
            {stuck && (
              <T style={[s.meta, styles.stuck]} accessibilityLiveRegion="polite">
                Your account is taking a while to load. You can skip this and add
                your name later in Account.
              </T>
            )}
          </View>
        )}
      </FlowScreen>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    minHeight: 160,
  },
  stuck: { textAlign: "center", maxWidth: 320 },
});

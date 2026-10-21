import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, TextInput } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { useFinishFlow } from "../../auth/gate";
import {
  AccountsUnavailable,
  MIN_PASSWORD,
  PASSWORD_FIX,
  flagField,
  useFormTask,
} from "../../auth/screens/shared";
import {
  AuthField,
  FlowButton,
  FlowScreen,
  FlowTitle,
  FormAlert,
  afterAuthParam,
  useAfterAuth,
} from "../../auth/ui";
import { useGo } from "../../navigation";
import { useToast } from "../../toast";
import { StatePanel } from "../../ui";

/**
 * After a reset code: the code has signed the viewer in, and this sets the
 * password they'll use next time. Swipe-to-dismiss is off; Close keeps them
 * signed in with the old password unchanged.
 */
export default function NewPasswordStep() {
  const account = useAccount();
  if (account.mode === "unavailable") return <AccountsUnavailable />;
  return <NewPasswordForm />;
}

function NewPasswordForm() {
  const params = useLocalSearchParams<{ next?: string }>();
  const account = useAccount();
  const go = useGo();
  const toast = useToast();
  const finish = useFinishFlow();
  const next = afterAuthParam(params.next);
  const after = useAfterAuth(next);
  const task = useFormTask();
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const busy = task.busy !== null;

  // The code signs in just before this screen opens, and the session can
  // take a moment to arrive; only after that is a missing one an expiry.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 3000);
    return () => clearTimeout(timer);
  }, []);
  const expired =
    (waited && !account.user) ||
    (!!task.error && task.code === "invalid_credentials");

  // Problems with the password itself show beside the field.
  const serverFieldError =
    task.error && (task.code === "weak_password" || task.code === "same_password")
      ? task.error
      : null;

  async function save() {
    if (password.length < MIN_PASSWORD) {
      setFieldError(PASSWORD_FIX);
      flagField(inputRef, PASSWORD_FIX);
      return;
    }
    let saved = false;
    await task.run("save", async () => {
      await account.updatePassword(password);
      saved = true;
    });
    if (!saved) return;
    if (next === "onboarding") {
      await after({ status: "signedIn" });
      return;
    }
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await finish();
    toast("Password updated");
  }

  // The code already signed them in, so closing finishes signing in.
  function close() {
    if (busy) return;
    if (account.user) after({ status: "signedIn" });
    else go.back();
  }

  if (expired)
    return (
      <FlowScreen leading="close">
        <StatePanel
          level={1}
          icon="time-outline"
          title="This code has expired"
          body="Codes only work for a short time. Ask for a new one to choose your password."
          label="Start again"
          action={() => router.replace({ pathname: "/auth/reset", params: { next } })}
        />
      </FlowScreen>
    );

  return (
    <FlowScreen
      leading="close"
      onLeading={close}
      footer={
        <FlowButton
          label="Save password"
          testID="new-password-save"
          busy={task.busy === "save"}
          onPress={save}
        />
      }
    >
      <FlowTitle title="Choose a new password" italic="new password" />
      <AuthField
        id="new-password-input"
        kind="new-password"
        label="New password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          setFieldError(null);
          task.setError(null);
        }}
        inputRef={inputRef}
        error={fieldError ?? serverFieldError}
        hint="Use at least 8 characters."
        editable={!busy}
        returnKey="done"
        onSubmit={save}
        autoFocus
      />
      <FormAlert message={serverFieldError ? null : task.error} />
    </FlowScreen>
  );
}

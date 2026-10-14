import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { TextInput } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { emailPattern } from "../../auth/messages";
import {
  AccountsUnavailable,
  EMAIL_FIX,
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
import { firstParam, useGo } from "../../navigation";
import { TextButton } from "../../ui";

/**
 * Email sign-in or sign-up with a one-time code: one field, no password.
 * The service creates the account on first sign-in, so both modes are the
 * same request; only the wording differs.
 */
export default function EmailStep() {
  const account = useAccount();
  if (account.mode === "unavailable") return <AccountsUnavailable />;
  return <EmailForm />;
}

function EmailForm() {
  const params = useLocalSearchParams<{ mode?: string; next?: string; email?: string }>();
  const account = useAccount();
  const go = useGo();
  const task = useFormTask();
  const mode = firstParam(params.mode) === "sign-in" ? "sign-in" : "sign-up";
  const next = afterAuthParam(params.next);
  const after = useAfterAuth(next);
  const [email, setEmail] = useState(() => firstParam(params.email) ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const busy = task.busy !== null;

  // The service's own "that's not an address" belongs on the field too.
  const serverFieldError = task.error && task.code === "invalid_email" ? task.error : null;

  async function send() {
    const value = email.trim();
    if (!emailPattern.test(value)) {
      setFieldError(EMAIL_FIX);
      flagField(inputRef, EMAIL_FIX);
      return;
    }
    const result = await task.run("send", () => account.sendEmailCode(value));
    await after(result, { email: value });
  }

  return (
    <FlowScreen
      leading="close"
      footer={
        <>
          <FlowButton
            label="Email me a code"
            testID="email-send-code"
            busy={task.busy === "send"}
            onPress={send}
          />
          <TextButton
            label="Use a password instead"
            testID="email-use-password"
            disabled={busy}
            onPress={() =>
              go.push({
                pathname: "/auth/password",
                params: { mode, next, email: email.trim() },
              })
            }
          />
        </>
      }
    >
      <FlowTitle
        serif={false}
        title={mode === "sign-in" ? "Sign in with email" : "Continue with email"}
        lead="We’ll email you a 6-digit code. No password needed."
      />
      <AuthField
        id="email-input"
        kind="email"
        label="Email"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setFieldError(null);
          task.setError(null);
        }}
        inputRef={inputRef}
        error={fieldError ?? serverFieldError}
        editable={!busy}
        returnKey="send"
        onSubmit={send}
        autoFocus
      />
      <FormAlert message={serverFieldError ? null : task.error} />
    </FlowScreen>
  );
}

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
import { firstParam } from "../../navigation";

/** Forgot password: email a code, then choose a new password. */
export default function ResetStep() {
  const account = useAccount();
  if (account.mode === "unavailable") return <AccountsUnavailable />;
  return <ResetForm />;
}

function ResetForm() {
  const params = useLocalSearchParams<{ email?: string; next?: string }>();
  const account = useAccount();
  const task = useFormTask();
  const after = useAfterAuth(afterAuthParam(params.next));
  const [email, setEmail] = useState(() => firstParam(params.email) ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const busy = task.busy !== null;
  const serverFieldError = task.error && task.code === "invalid_email" ? task.error : null;

  async function send() {
    const value = email.trim();
    if (!emailPattern.test(value)) {
      setFieldError(EMAIL_FIX);
      flagField(inputRef, EMAIL_FIX);
      return;
    }
    const result = await task.run("send", () => account.sendPasswordReset(value));
    await after(result, { email: value });
  }

  return (
    <FlowScreen
      footer={
        <FlowButton
          label="Email me a code"
          testID="reset-send-code"
          busy={task.busy === "send"}
          onPress={send}
        />
      }
    >
      <FlowTitle
        title="Reset your password"
        italic="password"
        lead="We’ll email you a 6-digit code to set a new password."
      />
      <AuthField
        id="reset-email"
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
        autoFocus={!email}
      />
      <FormAlert message={serverFieldError ? null : task.error} />
    </FlowScreen>
  );
}

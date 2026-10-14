import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { emailPattern } from "../../auth/messages";
import {
  AccountsUnavailable,
  EMAIL_FIX,
  MIN_PASSWORD,
  PASSWORD_FIX,
  SwitchLine,
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
import { space } from "../../theme";
import { TextButton } from "../../ui";

type Mode = "sign-in" | "sign-up";
type Fields = { email?: string; password?: string };

/**
 * Email and password, for people who'd rather not wait for a code. Signing
 * up still confirms the address with one.
 */
export default function PasswordStep() {
  const account = useAccount();
  if (account.mode === "unavailable") return <AccountsUnavailable />;
  return <PasswordForm />;
}

function PasswordForm() {
  const params = useLocalSearchParams<{ mode?: string; next?: string; email?: string }>();
  const account = useAccount();
  const go = useGo();
  const navigation = useNavigation();
  const task = useFormTask();
  const mode: Mode = firstParam(params.mode) === "sign-up" ? "sign-up" : "sign-in";
  const signUp = mode === "sign-up";
  const next = afterAuthParam(params.next);
  const after = useAfterAuth(next);
  const [email, setEmail] = useState(() => firstParam(params.email) ?? "");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Fields>({});
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const busy = task.busy !== null;

  // Errors about one entry show beside it; the rest above the button.
  const failed = task.error ? task.code : null;
  const emailError =
    fields.email ?? (failed === "invalid_email" ? task.error : null);
  const passwordError =
    fields.password ?? (failed === "weak_password" ? task.error : null);
  const formError =
    failed === "invalid_email" || failed === "weak_password" ? null : task.error;

  function clearErrors() {
    setFields({});
    task.setError(null);
  }

  function switchMode(to: Mode) {
    clearErrors();
    router.setParams({ mode: to });
  }

  async function submit() {
    const value = email.trim();
    const problems: Fields = {};
    if (!emailPattern.test(value)) problems.email = EMAIL_FIX;
    if (signUp ? password.length < MIN_PASSWORD : !password)
      problems.password = signUp ? PASSWORD_FIX : "Enter your password.";
    if (problems.email || problems.password) {
      setFields(problems);
      if (problems.email) flagField(emailRef, problems.email);
      else if (problems.password) flagField(passwordRef, problems.password);
      return;
    }
    const result = await task.run("submit", () =>
      signUp
        ? account.signUpWithPassword(value, password)
        : account.signInWithPassword(value, password),
    );
    await after(result, { email: value });
  }

  // Back to the code step when it's underneath; otherwise open it.
  function toCode() {
    const routes = navigation.getState()?.routes ?? [];
    const below = routes[routes.length - 2]?.name;
    if (below === "auth/email") go.back();
    else
      go.replace({
        pathname: "/auth/email",
        params: { mode, next, email: email.trim() },
      });
  }

  return (
    <FlowScreen
      footer={
        <>
          <FlowButton
            label={signUp ? "Create account" : "Sign in"}
            testID="password-submit"
            busy={task.busy === "submit"}
            onPress={submit}
          />
          {signUp ? (
            <SwitchLine
              prompt="Have an account?"
              label="Sign in"
              testID="password-switch"
              disabled={busy}
              onPress={() => switchMode("sign-in")}
            />
          ) : (
            <SwitchLine
              prompt="New here?"
              label="Create an account"
              testID="password-switch"
              disabled={busy}
              onPress={() => switchMode("sign-up")}
            />
          )}
        </>
      }
    >
      <FlowTitle title={signUp ? "Create your account" : "Sign in with your password"} />
      <View style={styles.fields}>
        <AuthField
          id="password-email"
          kind="email"
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setFields((current) => ({ ...current, email: undefined }));
            task.setError(null);
          }}
          inputRef={emailRef}
          error={emailError}
          editable={!busy}
          returnKey="next"
          onSubmit={() => passwordRef.current?.focus()}
          autoFocus={!email}
        />
        <AuthField
          id="password-input"
          kind={signUp ? "new-password" : "password"}
          label="Password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setFields((current) => ({ ...current, password: undefined }));
            task.setError(null);
          }}
          inputRef={passwordRef}
          error={passwordError}
          hint={signUp ? "Use at least 8 characters." : undefined}
          editable={!busy}
          returnKey="go"
          onSubmit={submit}
          autoFocus={!!email}
        />
        <View style={styles.links}>
          <TextButton
            label="Use a code instead"
            testID="password-use-code"
            align="start"
            disabled={busy}
            onPress={toCode}
          />
          {!signUp && (
            <TextButton
              label="Forgot password?"
              testID="forgot-password"
              align="end"
              disabled={busy}
              onPress={() =>
                go.push({
                  pathname: "/auth/reset",
                  params: { email: email.trim(), next },
                })
              }
            />
          )}
        </View>
      </View>
      {formError ? (
        <View style={styles.alert}>
          <FormAlert message={formError} />
          {failed === "email_taken" && (
            <TextButton
              label="Sign in instead"
              testID="password-sign-in-instead"
              align="start"
              onPress={() => switchMode("sign-in")}
            />
          )}
        </View>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: space.lg },
  // Pulled up so the links sit with the field above, not apart from it.
  links: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: -space.sm,
  },
  alert: { gap: space.xs },
});

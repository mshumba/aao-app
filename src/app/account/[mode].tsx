import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState, type RefObject } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useDemo } from "../../state/demo";
import { Button, c, Header, Page, T } from "../../ui";

type Mode = "sign-in" | "sign-up" | "reset";
type FieldKey = "email" | "password" | "confirm";
type Errors = Partial<Record<FieldKey, string>>;
type Outcome = "success" | "rejected";

const titles: Record<Mode, string> = {
  "sign-in": "Sign in (demo)",
  "sign-up": "Create account (demo)",
  reset: "Reset password (demo)",
};

function closeAccount() {
  Keyboard.dismiss();
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

export default function AccountModeScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode =
    params.mode === "sign-up" || params.mode === "reset"
      ? params.mode
      : "sign-in";
  // Expo Router can retain a dynamic-route component when only params change.
  // A key gives each mode fresh form state and cancels the previous demo timer.
  return <AccountForm key={mode} mode={mode} />;
}

function AccountForm({ mode }: { mode: Mode }) {
  const { setSignedIn } = useDemo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [outcome, setOutcome] = useState<Outcome>("success");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"success" | "rejected" | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const isReset = mode === "reset";
  const isSignUp = mode === "sign-up";

  useFocusEffect(
    useCallback(
      () => () => {
        // Cancel on blur as well as unmount: a native closing animation can keep
        // this screen mounted briefly after the user has already dismissed it.
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        busyRef.current = false;
        setBusy(false);
        setEmail("");
        setPassword("");
        setConfirm("");
        setErrors({});
        setResult(null);
      },
      [],
    ),
  );

  function useDemoValues() {
    setEmail("viewer@example.com");
    setPassword(isReset ? "" : "demo-password");
    setConfirm(isSignUp ? "demo-password" : "");
    setErrors({});
    setResult(null);
    AccessibilityInfo.announceForAccessibility("Demo values filled.");
  }

  function submit() {
    if (busyRef.current) return;
    const next: Errors = {};
    if (!email.trim()) next.email = "Enter an email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "Check the email format.";
    if (!isReset && password.length < 8)
      next.password = "Use at least 8 characters for this demo.";
    if (isSignUp && password !== confirm)
      next.confirm = "Passwords don’t match.";
    setErrors(next);
    setResult(null);

    const firstError = (["email", "password", "confirm"] as const).find(
      (key) => next[key],
    );
    if (firstError) {
      const refs = {
        email: emailRef,
        password: passwordRef,
        confirm: confirmRef,
      };
      refs[firstError].current?.focus();
      AccessibilityInfo.announceForAccessibility(next[firstError]!);
      return;
    }

    Keyboard.dismiss();
    busyRef.current = true;
    setBusy(true);
    // Only a local timer: no request, credential check, account or email service.
    timer.current = setTimeout(() => {
      busyRef.current = false;
      setBusy(false);
      timer.current = null;
      if (!isReset && outcome === "rejected") {
        setResult("rejected");
        AccessibilityInfo.announceForAccessibility(
          isSignUp ? "Demo: email already in use." : "Demo: sign-in rejected.",
        );
        return;
      }
      setEmail("");
      setPassword("");
      setConfirm("");
      if (!isReset) setSignedIn(true);
      setResult("success");
      AccessibilityInfo.announceForAccessibility(
        isReset
          ? "No email was sent. This is a demo."
          : isSignUp
            ? "Demo account shown. Nothing was created or saved."
            : "Signed in for this demo only.",
      );
    }, 800);
  }

  function switchMode(next: Mode) {
    Keyboard.dismiss();
    router.replace(`/account/${next}`);
  }

  const submitLabel = busy
    ? isReset
      ? "Simulating reset…"
      : isSignUp
        ? "Creating demo…"
        : "Signing in…"
    : isReset
      ? "Send reset link (demo)"
      : isSignUp
        ? "Create demo account"
        : "Sign in (demo)";

  return (
    <Page keyboard>
      <Header title={titles[mode]} close />
      <View style={styles.content}>
        <View style={styles.badge}>
          <T style={styles.badgeText}>DEMO — no account service</T>
        </View>

        {result === "success" ? (
          <View style={styles.success}>
            <Ionicons
              name={isReset ? "mail-outline" : "checkmark-circle-outline"}
              size={44}
              color={c.mint}
            />
            <T accessibilityRole="header" style={styles.heading}>
              {isReset
                ? "Reset preview complete."
                : "You’re in. For this demo."}
            </T>
            <T style={styles.description} accessibilityLiveRegion="polite">
              {isReset
                ? "No email was sent — this is a demo."
                : isSignUp
                  ? "Demo account shown — nothing was created or saved."
                  : "This simulated sign-in lasts until you sign out or reload. Your form values have been cleared."}
            </T>
            <Button
              label={isReset ? "Back to sign in" : "Return to sermons"}
              onPress={isReset ? () => switchMode("sign-in") : closeAccount}
              icon="arrow-forward"
            />
            {isReset && (
              <Button
                label="Continue as guest"
                onPress={closeAccount}
                secondary
              />
            )}
          </View>
        ) : (
          <>
            <View style={styles.intro}>
              <T accessibilityRole="header" style={styles.heading}>
                {isReset
                  ? "Try a password reset."
                  : isSignUp
                    ? "Make yourself at home."
                    : "Welcome back."}
              </T>
              <T style={styles.description}>
                {isReset
                  ? "Preview the reset flow. No email will be sent."
                  : "Try the flow with sample details. Don’t enter a real password."}
              </T>
              <T style={styles.helper}>
                Values stay in this screen’s memory. Nothing is sent or saved.
              </T>
            </View>

            <Button
              label="Use demo values"
              onPress={useDemoValues}
              secondary
              disabled={busy}
              icon="sparkles-outline"
            />

            <View style={styles.fields}>
              <Field
                label="Email address"
                value={email}
                onChangeText={setEmail}
                inputRef={emailRef}
                error={errors.email}
                email
                editable={!busy}
                next={!isReset}
                onSubmit={isReset ? submit : () => passwordRef.current?.focus()}
              />
              {!isReset && (
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  inputRef={passwordRef}
                  error={errors.password}
                  password
                  editable={!busy}
                  hint="8 characters minimum, for demonstration only."
                  next={isSignUp}
                  onSubmit={
                    isSignUp ? () => confirmRef.current?.focus() : submit
                  }
                />
              )}
              {isSignUp && (
                <Field
                  label="Confirm password"
                  value={confirm}
                  onChangeText={setConfirm}
                  inputRef={confirmRef}
                  error={errors.confirm}
                  password
                  editable={!busy}
                  onSubmit={submit}
                />
              )}
            </View>

            {!isReset && (
              <View style={styles.outcome}>
                <T style={styles.label}>Demo outcome</T>
                <View style={styles.segments} accessibilityRole="radiogroup">
                  {(["success", "rejected"] as const).map((choice) => (
                    <Pressable
                      key={choice}
                      accessibilityRole="radio"
                      accessibilityLabel={
                        choice === "success" ? "Success" : "Rejected"
                      }
                      accessibilityState={{
                        checked: outcome === choice,
                        disabled: busy,
                      }}
                      disabled={busy}
                      onPress={() => {
                        setOutcome(choice);
                        setResult(null);
                      }}
                      style={({ pressed }) => [
                        styles.segment,
                        outcome === choice && styles.segmentSelected,
                        pressed && styles.pressed,
                        busy && styles.disabled,
                      ]}
                    >
                      <T
                        style={[
                          styles.segmentText,
                          outcome === choice && styles.segmentTextSelected,
                        ]}
                      >
                        {choice === "success" ? "Success" : "Rejected"}
                      </T>
                    </Pressable>
                  ))}
                </View>
                <T style={styles.helper}>
                  Choose a result to preview. No service checks these details.
                </T>
              </View>
            )}

            {result === "rejected" && (
              <View style={styles.errorBox} accessibilityRole="alert">
                <T style={styles.error} accessibilityLiveRegion="assertive">
                  {isSignUp
                    ? "Demo: email already in use."
                    : "Demo: sign-in rejected."}
                </T>
                <T style={styles.helper}>
                  Choose Success above to try the next step.
                </T>
              </View>
            )}

            <View style={styles.actions}>
              {busy && (
                <ActivityIndicator
                  color={c.mint}
                  accessibilityLabel="Running local demo"
                />
              )}
              <Button label={submitLabel} onPress={submit} disabled={busy} />
              {mode === "sign-in" && (
                <TextAction
                  label="Forgot password?"
                  onPress={() => switchMode("reset")}
                  disabled={busy}
                />
              )}
              <TextAction
                label={
                  mode === "sign-in"
                    ? "Create account (demo)"
                    : "Back to sign in"
                }
                onPress={() =>
                  switchMode(mode === "sign-in" ? "sign-up" : "sign-in")
                }
                disabled={busy}
              />
              <TextAction label="Continue as guest" onPress={closeAccount} />
            </View>
          </>
        )}
      </View>
    </Page>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  inputRef: RefObject<TextInput | null>;
  error?: string;
  hint?: string;
  password?: boolean;
  email?: boolean;
  next?: boolean;
  editable: boolean;
  onSubmit: () => void;
};

function Field({
  label,
  value,
  onChangeText,
  inputRef,
  error,
  hint,
  password,
  email,
  next,
  editable,
  onSubmit,
}: FieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <T style={styles.label}>{label}</T>
      <View
        style={[
          styles.inputRow,
          focused && styles.inputFocused,
          error && styles.inputError,
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          autoComplete="off"
          textContentType="none"
          importantForAutofill="noExcludeDescendants"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardType={email ? "email-address" : "default"}
          secureTextEntry={password && !visible}
          returnKeyType={next ? "next" : "done"}
          submitBehavior={next ? "submit" : "blurAndSubmit"}
          onSubmitEditing={onSubmit}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={c.mint}
          placeholder={email ? "viewer@example.com" : undefined}
          placeholderTextColor={c.muted}
          style={styles.input}
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            accessibilityState={{ disabled: !editable }}
            disabled={!editable}
            onPress={() => setVisible(!visible)}
            style={({ pressed }) => [
              styles.visibility,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={visible ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={c.mint}
            />
          </Pressable>
        )}
      </View>
      {error ? (
        <T style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : hint ? (
        <T style={styles.helper}>{hint}</T>
      ) : null}
    </View>
  );
}

function TextAction({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.textAction,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <T style={styles.textActionLabel}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40, gap: 24 },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  badgeText: { color: c.mint, fontSize: 12, fontFamily: "Manrope_700Bold" },
  intro: { gap: 12 },
  heading: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  description: { fontSize: 16, lineHeight: 25, color: c.muted },
  helper: { fontSize: 12, lineHeight: 19, color: c.muted },
  fields: { gap: 20 },
  field: { gap: 8 },
  label: { fontSize: 14, lineHeight: 21, fontFamily: "Manrope_600SemiBold" },
  inputRow: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
  },
  inputFocused: { borderColor: c.mint },
  inputError: { borderColor: c.error },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 15,
    color: c.text,
    fontSize: 16,
    fontFamily: "Manrope_400Regular",
  },
  visibility: {
    width: 48,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  outcome: { gap: 10 },
  segments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 5,
    backgroundColor: c.surface,
    borderRadius: 12,
  },
  segment: {
    flex: 1,
    flexBasis: 110,
    minHeight: 48,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  segmentSelected: { borderColor: c.border, backgroundColor: c.feature },
  segmentText: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 14,
    textAlign: "center",
    color: c.muted,
  },
  segmentTextSelected: { color: c.text },
  actions: { gap: 4 },
  textAction: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  textActionLabel: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    color: c.mint,
  },
  error: { color: c.error, fontSize: 13, lineHeight: 21 },
  errorBox: {
    borderWidth: 1,
    borderColor: c.error,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  success: { gap: 24, paddingTop: 16 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});

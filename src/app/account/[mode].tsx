import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState, type RefObject } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import { DemoPanel } from "../../demoAccount";
import { useReducedMotion } from "../../motion";
import { exitTo, firstParam } from "../../navigation";
import { useDemo } from "../../state/demo";
import { font, radius, space, type } from "../../theme";
import {
  Button,
  Header,
  Icon,
  IconButton,
  Page,
  PageTitle,
  T,
  Tap,
  TextButton,
  c,
  noWebOutline,
  s,
  web,
} from "../../ui";

type Mode = "sign-in" | "sign-up" | "reset";
type FieldKey = "email" | "password" | "confirm";
type Errors = Partial<Record<FieldKey, string>>;
type Outcome = "success" | "rejected";

const copy: Record<
  Mode,
  {
    heading: string;
    intro: string;
    demo?: string;
    submit: string;
    successTitle: string;
    successBody: string;
  }
> = {
  "sign-in": {
    heading: "Welcome back",
    intro: "Try signing in with sample details.",
    submit: "Sign in",
    successTitle: "You’re signed in",
    successBody:
      "This demo sign-in ends when you sign out or reload the app. Nothing was checked or saved.",
  },
  "sign-up": {
    heading: "Create an account",
    intro: "Try creating an account with sample details.",
    submit: "Create account",
    successTitle: "You’re signed in",
    successBody:
      "No account was created and nothing was saved. This demo sign-in ends when you sign out or reload the app.",
  },
  reset: {
    heading: "Reset your password",
    intro: "Try the reset flow with a sample email.",
    demo: "Accounts aren’t live yet, so no email is sent. What you type isn’t saved.",
    submit: "Send reset link",
    successTitle: "No email was sent",
    successBody:
      "In the live app, a reset link would be emailed to you. This demo doesn’t send email.",
  },
};

// The one rare moment in the app gets a short staggered entrance; under
// Reduce Motion it is a plain fade. Taps and announcements are never delayed.
const easeOutCurve = Easing.bezier(0.23, 1, 0.32, 1);
const rise = [0, 1, 2].map((i) =>
  FadeInDown.duration(250).easing(easeOutCurve).delay(i * 50),
);
const fade = FadeIn.duration(200);

function rejection(mode: Mode) {
  return mode === "sign-up"
    ? "An account already uses this email."
    : "Incorrect email or password.";
}

// Close returns to wherever the form was opened from (the Account tab).
function closeAccount() {
  Keyboard.dismiss();
  if (router.canGoBack()) router.back();
  else router.replace("/account");
}

// "Back to sermons" and "Continue as guest" go to Home.
function toSermons() {
  Keyboard.dismiss();
  exitTo("/");
}

export default function AccountModeScreen() {
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const requested = firstParam(params.mode);
  const mode: Mode =
    requested === "sign-up" || requested === "reset" ? requested : "sign-in";
  // Expo Router can retain a dynamic-route component when only params change.
  // A key gives each mode fresh form state and cancels the previous demo timer.
  return <AccountForm key={mode} mode={mode} />;
}

function AccountForm({ mode }: { mode: Mode }) {
  const { signedIn, setSignedIn } = useDemo();
  const reduced = useReducedMotion();
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
  const text = copy[mode];

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

  function fillSample() {
    setEmail("viewer@example.com");
    setPassword(isReset ? "" : "demo-password");
    setConfirm(isSignUp ? "demo-password" : "");
    setErrors({});
    setResult(null);
    AccessibilityInfo.announceForAccessibility("Sample details filled in.");
  }

  // Drop a field's error as soon as it is edited, instead of on next submit.
  function edit(key: FieldKey, set: (value: string) => void) {
    return (value: string) => {
      set(value);
      setErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    };
  }

  function submit() {
    if (busyRef.current) return;
    const next: Errors = {};
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "Enter an email address like name@example.com.";
    if (!isReset && password.length < 8)
      next.password = "Use at least 8 characters.";
    if (isSignUp && password !== confirm)
      next.confirm = "Enter the same password in both fields.";
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
          `${rejection(mode)} This is a simulated error.`,
        );
        return;
      }
      setEmail("");
      setPassword("");
      setConfirm("");
      if (!isReset) setSignedIn(true);
      setResult("success");
      AccessibilityInfo.announceForAccessibility(
        `${text.successTitle}. ${text.successBody}`,
      );
    }, 800);
  }

  function switchMode(next: Mode) {
    Keyboard.dismiss();
    router.replace(`/account/${next}`);
  }

  if (result === "success")
    return (
      <Page>
        <Header close />
        <View style={styles.success}>
          <Animated.View
            entering={reduced ? fade : rise[0]}
            style={styles.successIcon}
          >
            <Icon
              name={isReset ? "mail-outline" : "checkmark"}
              size={30}
              color={c.mint}
            />
          </Animated.View>
          <Animated.View entering={reduced ? fade : rise[1]}>
            <PageTitle title={text.successTitle} lead={text.successBody} />
          </Animated.View>
          <Animated.View
            entering={reduced ? fade : rise[2]}
            style={{ gap: space.md }}
          >
            <Button
              label={isReset ? "Back to sign in" : "Back to sermons"}
              onPress={isReset ? () => switchMode("sign-in") : toSermons}
            />
            {isReset && (
              <TextButton label="Continue as guest" onPress={toSermons} />
            )}
          </Animated.View>
        </View>
      </Page>
    );

  return (
    <Page keyboard>
      <Header close />
      <PageTitle title={text.heading} lead={text.intro} />
      <View style={styles.content}>
        <DemoPanel text={text.demo}>
          <Button
            label="Fill in sample details"
            onPress={fillSample}
            variant="secondary"
            disabled={busy}
            icon="sparkles-outline"
          />
          {!isReset && (
            <View style={{ gap: space.sm }}>
              <T style={styles.segmentsLabel}>Simulated result</T>
              <View
                style={styles.segments}
                accessibilityRole="radiogroup"
                accessibilityLabel="Simulated result"
              >
                {(["success", "rejected"] as const).map((choice) => {
                  const selected = outcome === choice;
                  const label = choice === "success" ? "Success" : "Error";
                  return (
                    <Tap
                      key={choice}
                      accessibilityRole="radio"
                      accessibilityLabel={label}
                      aria-checked={selected}
                      aria-disabled={busy}
                      disabled={busy}
                      onPress={() => {
                        setOutcome(choice);
                        setResult(null);
                      }}
                      style={[styles.segment, selected && styles.segmentOn]}
                    >
                      {selected && (
                        <Icon name="checkmark" size={16} color={c.text} />
                      )}
                      <T
                        style={[
                          styles.segmentText,
                          selected && styles.segmentTextOn,
                        ]}
                      >
                        {label}
                      </T>
                    </Tap>
                  );
                })}
              </View>
            </View>
          )}
        </DemoPanel>

        <View style={styles.fields}>
          <Field
            id={`${mode}-email`}
            label="Email address"
            value={email}
            onChangeText={edit("email", setEmail)}
            inputRef={emailRef}
            error={errors.email}
            email
            editable={!busy}
            next={!isReset}
            onSubmit={isReset ? submit : () => passwordRef.current?.focus()}
          />
          {!isReset && (
            <Field
              id={`${mode}-password`}
              label="Password"
              value={password}
              onChangeText={edit("password", setPassword)}
              inputRef={passwordRef}
              error={errors.password}
              password
              editable={!busy}
              hint={isSignUp ? "Use at least 8 characters." : undefined}
              next={isSignUp}
              onSubmit={isSignUp ? () => confirmRef.current?.focus() : submit}
            />
          )}
          {mode === "sign-in" && (
            <View style={{ marginTop: -space.md }}>
              <TextButton
                label="Forgot password?"
                onPress={() => switchMode("reset")}
                disabled={busy}
                align="end"
              />
            </View>
          )}
          {isSignUp && (
            <Field
              id={`${mode}-confirm`}
              label="Confirm password"
              value={confirm}
              onChangeText={edit("confirm", setConfirm)}
              inputRef={confirmRef}
              error={errors.confirm}
              password
              editable={!busy}
              onSubmit={submit}
            />
          )}
        </View>

        {result === "rejected" && (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Icon name="alert-circle-outline" color={c.error} size={20} />
            <View style={{ flex: 1, gap: 4 }}>
              <T style={styles.errorTitle}>{rejection(mode)}</T>
              <T style={s.meta}>
                This is the simulated error. Set Simulated result to Success to
                continue.
              </T>
            </View>
          </View>
        )}

        <View style={{ gap: space.xs }}>
          {/* Keeps its label while busy: nothing is really being sent. */}
          <Button label={text.submit} onPress={submit} busy={busy} />
          <View style={styles.links}>
            {mode === "sign-in" ? (
              <TextButton
                label="Create an account"
                onPress={() => switchMode("sign-up")}
                disabled={busy}
              />
            ) : (
              <TextButton
                label="Back to sign in"
                onPress={() => switchMode("sign-in")}
                disabled={busy}
              />
            )}
            <TextButton
              label={signedIn ? "Close" : "Continue as guest"}
              onPress={signedIn ? closeAccount : toSermons}
            />
          </View>
        </View>
      </View>
    </Page>
  );
}

type FieldProps = {
  id: string;
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
  id,
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
  const messageId = `${id}-message`;
  return (
    <View style={styles.field}>
      <T style={styles.label}>{label}</T>
      <View
        style={[
          styles.inputRow,
          error && styles.inputError,
          focused && styles.inputFocused,
          focused && error && { borderColor: c.error },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          {...web({
            "aria-describedby": error || hint ? messageId : undefined,
            "aria-invalid": !!error,
          })}
          // Deliberately off: the OS must not offer to save or fill real
          // credentials into a demo form.
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
          placeholder={email ? "name@example.com" : undefined}
          placeholderTextColor={c.muted}
          style={styles.input}
        />
        {password && (
          <IconButton
            name={visible ? "eye-off-outline" : "eye-outline"}
            label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            color={c.mint}
            size={22}
            onPress={() => editable && setVisible(!visible)}
          />
        )}
      </View>
      {error ? (
        // On native, submit() announces the first error. Web has no announce,
        // and a live region inserted already filled is often not read, so the
        // message is an alert there.
        <View style={styles.errorRow}>
          <Icon name="alert-circle" size={16} color={c.error} />
          <T
            nativeID={messageId}
            style={styles.error}
            accessibilityRole={Platform.OS === "web" ? "alert" : undefined}
          >
            {error}
          </T>
        </View>
      ) : hint ? (
        <T nativeID={messageId} style={s.meta}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { marginTop: space.lg, gap: space.xxl },
  fields: { gap: space.lg },
  field: { gap: space.sm },
  label: { ...type.label, fontSize: 14, lineHeight: 20 },
  inputRow: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingStart: 14,
  },
  // Focus thickens the border rather than only recolouring it; padding
  // compensates so the text doesn't shift.
  inputFocused: { borderColor: c.mint, borderWidth: 2, paddingStart: 13 },
  inputError: { borderColor: c.error },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    paddingVertical: 13,
    paddingEnd: 14,
    color: c.text,
    fontSize: 16,
    fontFamily: font.regular,
    ...noWebOutline,
  },
  segmentsLabel: { ...type.label, fontSize: 13, lineHeight: 19 },
  segments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    padding: 4,
    backgroundColor: c.surface,
    borderRadius: radius.md,
  },
  segment: {
    flex: 1,
    flexBasis: 110,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  segmentOn: { backgroundColor: c.feature, borderColor: c.mint },
  segmentText: { ...type.label, fontSize: 14, color: c.muted },
  segmentTextOn: { color: c.text },
  links: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: space.xl,
  },
  errorRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  error: { flex: 1, color: c.error, fontSize: 13, lineHeight: 19 },
  errorBox: {
    flexDirection: "row",
    gap: space.sm,
    borderWidth: 1,
    borderColor: c.error,
    borderRadius: radius.md,
    padding: 14,
  },
  errorTitle: { ...type.label, color: c.text },
  success: { gap: space.xl, paddingTop: space.sm },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
});

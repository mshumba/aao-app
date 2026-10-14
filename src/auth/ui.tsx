import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import { Link, router } from "expo-router";
import {
  useCallback,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGo, usePageTitle } from "../navigation";
import { useToast } from "../toast";
import { font, radius, space, type } from "../theme";
import {
  Heading,
  Icon,
  IconButton,
  type IconName,
  T,
  Tap,
  TextButton,
  c,
  fieldBorder,
  noWebOutline,
  s,
  web,
} from "../ui";
import { useAccount } from "./AccountProvider";
import { useCloseAuthRoutes, useFinishFlow } from "./gate";
import { setAuthReturn } from "./intent";
import { authMessage } from "./messages";
import type { AuthResult, CodePurpose } from "./types";

/* ------------------------------------------------------------------------ */
/* Busy / error state for one form                                          */
/* ------------------------------------------------------------------------ */

/**
 * Runs one account request at a time: tracks busy, keeps the latest error
 * message, and ignores repeat taps while a request is in flight.
 */
export function useAuthTask() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const run = useCallback(
    async <T,>(key: string, work: () => Promise<T>): Promise<T | undefined> => {
      if (running.current) return undefined;
      running.current = true;
      setBusy(key);
      setError(null);
      try {
        return await work();
      } catch (failure) {
        const message = authMessage(failure);
        setError(message);
        AccessibilityInfo.announceForAccessibility(message);
        if (Platform.OS !== "web")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return undefined;
      } finally {
        running.current = false;
        setBusy(null);
      }
    },
    [],
  );
  return { busy, error, setError, run };
}

/* ------------------------------------------------------------------------ */
/* After a successful sign-in                                                */
/* ------------------------------------------------------------------------ */

export type AfterAuth = "resume" | "onboarding";

/** Reads the `next` route param shared by every sign-in screen. */
export function afterAuthParam(value?: string | string[]): AfterAuth {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "onboarding" ? "onboarding" : "resume";
}

/**
 * What happens once an account is ready. From onboarding, it continues to
 * the name step (unless Apple or Google gave a name) and the welcome summary.
 * Otherwise the sign-in screens close and the tapped action carries on.
 */
export function useAfterAuth(next: AfterAuth) {
  const finish = useFinishFlow();
  const closeAuth = useCloseAuthRoutes();
  const toast = useToast();
  return useCallback(
    async (result: AuthResult | undefined, options?: { email?: string }) => {
      if (!result) return;
      if (result.status === "cancelled") return;
      if (result.status === "codeSent") {
        // The email may hold a link as well as the code; following it comes
        // back through /auth/callback, which then continues onboarding.
        setAuthReturn(next === "onboarding" ? "onboarding" : null);
        router.push({
          pathname: "/auth/code",
          params: { email: options?.email ?? result.email, purpose: result.purpose, next },
        });
        return;
      }
      setAuthReturn(null);
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (next === "onboarding") {
        await closeAuth();
        router.push("/onboarding/name");
        return;
      }
      await finish();
      toast("You’re signed in");
    },
    [closeAuth, finish, next, toast],
  );
}

/* ------------------------------------------------------------------------ */
/* Screen shell for onboarding and sign-in steps                             */
/* ------------------------------------------------------------------------ */

/**
 * A flow step: Back or Close, an optional step indicator, scrolling content,
 * and actions pinned to the bottom (above the keyboard on iOS).
 */
export function FlowScreen({
  children,
  footer,
  leading = "back",
  onLeading,
  trailing,
  step,
  scroll = true,
}: PropsWithChildren<{
  footer?: ReactNode;
  leading?: "back" | "close" | "none";
  onLeading?: () => void;
  trailing?: ReactNode;
  /** [current, total], 1-based. Shown as a segmented hairline. */
  step?: [number, number];
  scroll?: boolean;
}>) {
  const go = useGo();
  const insets = useSafeAreaInsets();
  const body = (
    <View style={styles.flowBody}>{children}</View>
  );
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.flowBar}>
          {leading !== "none" ? (
            <IconButton
              name={leading === "close" ? "close" : "arrow-back"}
              label={leading === "close" ? "Close" : "Back"}
              onPress={onLeading ?? go.back}
            />
          ) : (
            <View style={{ width: 48 }} />
          )}
          {/* Centred on the screen, whatever width the actions either side. */}
          <View style={styles.flowSteps} pointerEvents="none">
            {step && <StepBar current={step[0]} total={step[1]} />}
          </View>
          <View style={{ flex: 1 }} />
          {/* An end-aligned text action ("Skip") ends on the content column's
              edge, mirroring the Back arrow, rather than near the screen edge. */}
          <View style={styles.flowTrailing}>{trailing}</View>
        </View>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "web" ? "none" : "interactive"}
            contentContainerStyle={styles.flowScroll}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={[styles.flowScroll, { flex: 1 }]}>{body}</View>
        )}
        {footer ? (
          <View
            style={[
              styles.flowFooter,
              { paddingBottom: Math.max(insets.bottom, space.lg) },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Where the step is in the flow: segments, with "Step 2 of 3" written under
 * them, so how far there is to go doesn't rest on the segments alone.
 */
function StepBar({ current, total }: { current: number; total: number }) {
  const label = `Step ${current} of ${total}`;
  return (
    <View
      style={styles.stepBar}
      // One stop for VoiceOver and TalkBack; on the web the text is read.
      accessible={Platform.OS !== "web"}
      accessibilityLabel={label}
    >
      <View style={styles.steps} {...web({ "aria-hidden": true })}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.step, i < current && styles.stepOn]} />
        ))}
      </View>
      <T style={styles.stepLabel} maxFontSizeMultiplier={1.4} testID="step-label">
        {label}
      </T>
    </View>
  );
}

/**
 * A step's headline with an optional lead line. The serif is kept for the
 * emotional moments (onboarding questions); the sign-in forms pass
 * serif={false} and use the app's sans display, like other utility pages.
 */
export function FlowTitle({
  title,
  lead,
  serif = true,
}: {
  title: string;
  lead?: ReactNode;
  serif?: boolean;
}) {
  usePageTitle(title);
  return (
    <View style={{ gap: space.md }}>
      <Heading
        level={1}
        style={serif ? type.question : type.display}
        maxFontSizeMultiplier={1.6}
      >
        {title}
      </Heading>
      {lead ? <T style={[type.lead, { color: c.muted }]}>{lead}</T> : null}
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Fields                                                                    */
/* ------------------------------------------------------------------------ */

// A field's outline is how it's found, so it uses the app's field edge
// (3:1 or better on the white field and the ivory page), not c.border.
const FIELD_BORDER = fieldBorder;

type FieldKind = "email" | "password" | "new-password" | "name";

const autofill: Record<
  FieldKind,
  {
    autoComplete: "email" | "current-password" | "new-password" | "given-name";
    textContentType: "emailAddress" | "password" | "newPassword" | "givenName";
  }
> = {
  email: { autoComplete: "email", textContentType: "emailAddress" },
  password: { autoComplete: "current-password", textContentType: "password" },
  "new-password": { autoComplete: "new-password", textContentType: "newPassword" },
  name: { autoComplete: "given-name", textContentType: "givenName" },
};

/**
 * A labelled text field with its message underneath. Autofill and password
 * managers work: each kind declares what it holds.
 */
export function AuthField({
  id,
  kind,
  label,
  value,
  onChangeText,
  inputRef,
  error,
  hint,
  editable = true,
  returnKey = "done",
  onSubmit,
  autoFocus = false,
}: {
  id: string;
  kind: FieldKind;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  inputRef?: RefObject<TextInput | null>;
  error?: string | null;
  hint?: string;
  editable?: boolean;
  returnKey?: "next" | "done" | "go" | "send";
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const secret = kind === "password" || kind === "new-password";
  const messageId = `${id}-message`;
  return (
    <View style={styles.field}>
      <T style={styles.label} nativeID={`${id}-label`}>
        {label}
      </T>
      <View
        style={[
          styles.inputRow,
          !!error && styles.inputError,
          focused && styles.inputFocused,
          focused && !!error && { borderColor: c.error },
        ]}
      >
        <TextInput
          ref={inputRef}
          testID={id}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          {...web({
            id,
            "aria-describedby": error || hint ? messageId : undefined,
            "aria-invalid": !!error,
          })}
          autoComplete={autofill[kind].autoComplete}
          textContentType={autofill[kind].textContentType}
          autoCapitalize={kind === "name" ? "words" : "none"}
          autoCorrect={false}
          spellCheck={false}
          keyboardType={kind === "email" ? "email-address" : "default"}
          secureTextEntry={secret && !visible}
          returnKeyType={returnKey}
          submitBehavior={returnKey === "next" ? "submit" : "blurAndSubmit"}
          onSubmitEditing={onSubmit}
          editable={editable}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={c.accent}
          placeholder={kind === "email" ? "name@example.com" : undefined}
          placeholderTextColor={c.muted}
          maxLength={kind === "name" ? 80 : 254}
          style={styles.input}
        />
        {secret && (
          <IconButton
            name={visible ? "eye-off-outline" : "eye-outline"}
            label={visible ? "Hide password" : "Show password"}
            color={c.accent}
            size={22}
            onPress={() => setVisible((v) => !v)}
          />
        )}
      </View>
      {error ? (
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

/**
 * Six-digit code entry: one real input (so iOS can offer the code from Mail
 * and paste works) drawn as six boxes. Calls onComplete at six digits.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  error,
  editable = true,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (code: string) => void;
  error?: boolean;
  editable?: boolean;
  inputRef?: RefObject<TextInput | null>;
}) {
  const own = useRef<TextInput>(null);
  const ref = inputRef ?? own;
  const [focused, setFocused] = useState(false);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");
  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      accessible={false}
      style={styles.codeWrap}
    >
      <View style={styles.codeRow} pointerEvents="none">
        {digits.map((digit, i) => {
          const active = focused && i === Math.min(value.length, 5);
          return (
            <View
              key={i}
              style={[
                styles.codeBox,
                active && styles.codeBoxActive,
                error && styles.codeBoxError,
              ]}
            >
              {/* Capped so the digit stays inside its box at the largest
                  text sizes; the real input still reads the code out. */}
              <T style={styles.codeDigit} maxFontSizeMultiplier={1.5}>
                {digit.trim()}
              </T>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        testID="code-input"
        value={value}
        onChangeText={(text) => {
          const clean = text.replace(/\D/g, "").slice(0, 6);
          onChange(clean);
          if (clean.length === 6) onComplete(clean);
        }}
        accessibilityLabel="6-digit code"
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        maxLength={6}
        editable={editable}
        autoFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
        selectionColor="transparent"
        style={styles.codeInput}
      />
    </Pressable>
  );
}

/** One error for the whole form (a rejected sign-in, a network failure). */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.alert} accessibilityRole="alert" testID="form-alert">
      <Icon name="alert-circle-outline" color={c.error} size={20} />
      <T style={styles.alertText}>{message}</T>
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* Buttons                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * A full-width action for the sign-in screens. "primary" is the app's navy;
 * "apple" is the black style Apple's guidelines ask for on light
 * backgrounds; "surface" is white with Google's grey stroke (Google's light
 * theme); "outline" is a quiet bordered alternative. `image` replaces the
 * icon with a full-colour mark (Google's G).
 */
export function FlowButton({
  label,
  onPress,
  tone = "primary",
  icon,
  image,
  busy = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "apple" | "surface" | "outline";
  icon?: IconName;
  image?: ImageSourcePropType;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const fg = tone === "primary" ? c.onAccent : tone === "apple" ? c.white : c.text;
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      disabled={disabled}
      busy={busy}
      onPress={onPress}
      feedback="scaleLarge"
      style={[styles.flowButton, styles[tone]]}
    >
      {busy ? (
        <ActivityIndicator color={fg} size="small" />
      ) : image ? (
        <Image source={image} style={styles.flowButtonImage} accessible={false} />
      ) : icon ? (
        <Icon name={icon} size={20} color={fg} />
      ) : null}
      <T style={[styles.flowButtonText, { color: fg }]}>{label}</T>
    </Tap>
  );
}

/**
 * Continue with Apple or Google, the preferred ways in, with email as a
 * quieter fallback. Apple and Google finish here (or hand back
 * "cancelled"); email opens the email step.
 */
export function ProviderButtons({
  next,
  mode = "sign-up",
  onError,
  task,
}: {
  next: AfterAuth;
  mode?: "sign-up" | "sign-in";
  onError?: (message: string | null) => void;
  task: ReturnType<typeof useAuthTask>;
}) {
  const account = useAccount();
  const go = useGo();
  const after = useAfterAuth(next);
  const { busy, run } = task;
  const locked = busy !== null;

  async function provider(key: "apple" | "google") {
    onError?.(null);
    // On the web this leaves the page and returns to /auth/callback, which
    // reads where to continue. Native sign-ins finish here.
    if (Platform.OS === "web") setAuthReturn(next === "onboarding" ? "onboarding" : null);
    const result = await run(key, () =>
      key === "apple" ? account.signInWithApple() : account.signInWithGoogle(),
    );
    await after(result);
  }

  const social = account.methods.apple || account.methods.google;
  const openEmail = () =>
    go.push({ pathname: "/auth/email", params: { mode, next } });

  // Apple's own button on iPhone, as App Review expects; a matching custom
  // one elsewhere. Apple and Google get equal size and prominence (App
  // Store guideline 4.8).
  const nativeApple = Platform.OS === "ios" && account.mode === "supabase";

  return (
    <View style={styles.providers}>
      {account.methods.apple &&
        (nativeApple ? (
          <View>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                mode === "sign-in"
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.md}
              style={[styles.appleNative, locked && { opacity: 0.5 }]}
              onPress={() => {
                if (!locked) provider("apple");
              }}
            />
            {busy === "apple" && (
              <View style={styles.appleBusy} pointerEvents="none">
                <ActivityIndicator color={c.white} />
              </View>
            )}
          </View>
        ) : (
          <FlowButton
            testID="continue-apple"
            label={mode === "sign-in" ? "Sign in with Apple" : "Continue with Apple"}
            icon="logo-apple"
            tone="apple"
            busy={busy === "apple"}
            disabled={locked && busy !== "apple"}
            onPress={() => provider("apple")}
          />
        ))}
      {account.methods.google && (
        <FlowButton
          testID="continue-google"
          label={mode === "sign-in" ? "Sign in with Google" : "Continue with Google"}
          // Google's standard four-colour G, as its branding guidelines ask.
          image={googleG}
          tone="surface"
          busy={busy === "google"}
          disabled={locked && busy !== "google"}
          onPress={() => provider("google")}
        />
      )}
      {account.methods.email &&
        // Email is the quiet fallback beside Apple and Google, a link a
        // step down from them; it's only a full button when it's the one
        // way in.
        (social ? (
          <View style={styles.emailLink}>
            <TextButton
              testID="continue-email"
              label={mode === "sign-in" ? "Sign in with email instead" : "Use email instead"}
              disabled={locked}
              onPress={openEmail}
            />
          </View>
        ) : (
          <FlowButton
            testID="continue-email"
            label={mode === "sign-in" ? "Sign in with email" : "Continue with email"}
            icon="mail-outline"
            tone="primary"
            disabled={locked}
            onPress={openEmail}
          />
        ))}
    </View>
  );
}

// Drawn from Google's published G (assets/google-g*.png at 1x, 2x and 3x).
const googleG = require("../../assets/google-g.png");

/**
 * Terms and Privacy, linked, under any sign-up action. Real links: on the
 * web Enter opens them (and they open in a new tab like any link), and they
 * take the sentence's own size rather than the body text's.
 */
export function LegalNote({ action = "continuing" }: { action?: string }) {
  return (
    <T style={styles.legal}>
      By {action}, you agree to the{" "}
      <Link href="/terms" push style={styles.legalLink}>
        Terms of Use
      </Link>{" "}
      and confirm you’ve read the{" "}
      <Link href="/privacy" push style={styles.legalLink}>
        Privacy Policy
      </Link>
      .
    </T>
  );
}

/**
 * What a free account adds, in the same words and icons wherever it's
 * offered: "lead" on the onboarding step, "body" in the Account tab's card.
 * Watching isn't listed when guests can already watch everything.
 */
export function AccountBenefits({ size = "body" }: { size?: "lead" | "body" }) {
  const account = useAccount();
  const text = size === "lead" ? type.lead : type.body;
  const items: { icon: IconName; text: string }[] = [
    ...(account.guestWatch === "all"
      ? []
      : [{ icon: "play-circle-outline" as const, text: "Watch every sermon in full" }]),
    { icon: "bookmark-outline", text: "Save sermons to come back to" },
    { icon: "sync-outline", text: "Keep your topics on any device" },
  ];
  return (
    <View style={{ gap: size === "lead" ? space.lg : space.md }} role="list">
      {items.map((item) => (
        <View key={item.text} style={styles.benefit} role="listitem">
          {/* Centred on the first line of text, however many lines it takes. */}
          <View style={{ height: text.lineHeight, justifyContent: "center" }}>
            <Icon name={item.icon} size={size === "lead" ? 22 : 20} color={c.accent} />
          </View>
          <T style={[text, styles.benefitText]}>{item.text}</T>
        </View>
      ))}
    </View>
  );
}

/** Code purposes from a route param. */
export function purposeParam(value?: string | string[]): CodePurpose {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "confirm" || v === "recovery" ? v : "sign-in";
}

const styles = StyleSheet.create({
  flowBar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: space.sm,
  },
  flowSteps: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  flowTrailing: { minWidth: 48, alignItems: "flex-end", paddingEnd: space.lg },
  flowScroll: {
    flexGrow: 1,
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  flowBody: { gap: space.xl, flexGrow: 1 },
  flowFooter: {
    paddingHorizontal: space.gutter,
    paddingTop: space.md,
    gap: space.sm,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  stepBar: { alignItems: "center", gap: 6 },
  steps: { flexDirection: "row", gap: 6, width: 120 },
  // Steps still to come in the field edge (3:1 on the ivory page), not the
  // decorative hairline, so they can be counted.
  step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: fieldBorder },
  stepOn: { backgroundColor: c.accent },
  stepLabel: { ...type.caption, fontSize: 12, lineHeight: 16, color: c.muted },
  field: { gap: space.sm },
  label: { ...type.label, fontSize: 14, lineHeight: 20 },
  // A point of padding inside the 1pt border, so focus can take it for a
  // 2pt border without the field growing or the text moving.
  inputRow: {
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingStart: 14,
    paddingEnd: 1,
    paddingVertical: 1,
  },
  // Focus thickens the border rather than only recolouring it.
  inputFocused: {
    borderColor: c.accent,
    borderWidth: 2,
    paddingStart: 13,
    paddingEnd: 0,
    paddingVertical: 0,
  },
  inputError: { borderColor: c.error },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 14,
    paddingEnd: 14,
    color: c.text,
    fontSize: 16,
    fontFamily: font.regular,
    ...noWebOutline,
  },
  errorRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  error: { flex: 1, color: c.error, fontSize: 13, lineHeight: 19 },
  codeWrap: { position: "relative" },
  codeRow: { flexDirection: "row", gap: space.sm, justifyContent: "space-between" },
  codeBox: {
    flex: 1,
    maxWidth: 56,
    aspectRatio: 0.86,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    // As with fields: the active box's 2pt border takes this point, so the
    // boxes stay the same size as the active one moves along.
    padding: 1,
    borderColor: FIELD_BORDER,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxActive: { borderColor: c.accent, borderWidth: 2, padding: 0 },
  codeBoxError: { borderColor: c.error },
  codeDigit: {
    color: c.text,
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 30,
    fontVariant: ["tabular-nums"],
  },
  // The real input covers the boxes, invisible, so taps and paste reach it.
  codeInput: {
    ...StyleSheet.absoluteFill,
    opacity: Platform.OS === "web" ? 0.011 : 0.02,
    color: "transparent",
    fontSize: 16,
    ...noWebOutline,
  },
  // A faint wash of the error colour behind the outline, so the alert reads
  // as a message rather than another field.
  alert: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: c.error,
    borderRadius: radius.md,
    backgroundColor: `${c.error}0d`,
    padding: 14,
  },
  alertText: { ...type.body, flex: 1, color: c.text },
  flowButton: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primary: { backgroundColor: c.accent },
  apple: { backgroundColor: c.black },
  // Google's light-theme stroke (#747775): the button keeps its edge on the
  // white sign-up sheet, level with the black Apple button.
  surface: { backgroundColor: c.surface, borderWidth: 1, borderColor: "#747775" },
  outline: { borderWidth: 1, borderColor: FIELD_BORDER },
  flowButtonText: {
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    flexShrink: 1,
  },
  flowButtonImage: { width: 20, height: 20 },
  providers: { gap: space.md },
  // Pulled up a little: the link's touch area is taller than its words, so
  // it would otherwise read as further away than the buttons are apart.
  emailLink: { marginTop: -space.xs },
  appleNative: { width: "100%", height: 52 },
  appleBusy: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  benefit: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  benefitText: { flex: 1, color: c.text },
  legal: { ...type.caption, color: c.muted, textAlign: "center" },
  legalLink: { color: c.text, textDecorationLine: "underline" },
});

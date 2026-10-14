import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import {
  AccountsUnavailable,
  TestModeNotice,
  useFormTask,
} from "../../auth/screens/shared";
import type { CodePurpose } from "../../auth/types";
import {
  type AfterAuth,
  CodeInput,
  FlowButton,
  FlowScreen,
  FlowTitle,
  FormAlert,
  afterAuthParam,
  purposeParam,
  useAfterAuth,
} from "../../auth/ui";
import { firstParam, useGo } from "../../navigation";
import { font, space, type } from "../../theme";
import { useToast } from "../../toast";
import { StatePanel, T, TextButton, c, s } from "../../ui";

/** Seconds before another code can be sent, matching the service's limit. */
const RESEND_SECONDS = 30;

const why: Record<CodePurpose, string> = {
  "sign-in": "",
  confirm: " to confirm it’s yours",
  recovery: " to choose a new password",
};

/**
 * Enter the 6-digit code from the email. It verifies by itself at six
 * digits; a rejected code clears so the next attempt starts fresh.
 */
export default function CodeStep() {
  const params = useLocalSearchParams<{ email?: string; purpose?: string; next?: string }>();
  const account = useAccount();
  const next = afterAuthParam(params.next);
  const email = firstParam(params.email)?.trim();
  if (account.mode === "unavailable") return <AccountsUnavailable />;
  if (!email) return <MissingEmail next={next} />;
  return <CodeForm email={email} purpose={purposeParam(params.purpose)} next={next} />;
}

function CodeForm({
  email,
  purpose,
  next,
}: {
  email: string;
  purpose: CodePurpose;
  next: AfterAuth;
}) {
  const account = useAccount();
  const go = useGo();
  const toast = useToast();
  const task = useFormTask();
  const after = useAfterAuth(next);
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState("");
  // Each send restarts the resend countdown.
  const [sends, setSends] = useState(0);
  const [retries, setRetries] = useState(0);
  const busy = task.busy !== null;
  const rejected =
    !!task.error && (task.code === "invalid_code" || task.code === "expired_code");
  const expired = !!task.error && task.code === "expired_code";

  // The boxes clear after a rejected code; focus returns to them once
  // they're editable again.
  useEffect(() => {
    if (retries && !busy) inputRef.current?.focus();
  }, [retries, busy]);

  async function verify(value: string) {
    if (value.length !== 6) return;
    let failed = false;
    const result = await task.run("verify", () =>
      account.verifyCode(email, value, purpose).catch((failure) => {
        failed = true;
        throw failure;
      }),
    );
    if (failed) {
      setCode("");
      setRetries((n) => n + 1);
      return;
    }
    if (result?.status === "signedIn" && purpose === "recovery") {
      router.replace({ pathname: "/auth/new-password", params: { next } });
      return;
    }
    await after(result);
  }

  async function resend() {
    let sent = false;
    await task.run("resend", async () => {
      await account.resendCode(email, purpose);
      sent = true;
    });
    if (!sent) return;
    setCode("");
    setSends((n) => n + 1);
    setRetries((n) => n + 1);
    toast("New code sent", "mail-outline");
  }

  return (
    <FlowScreen
      footer={
        expired ? (
          <FlowButton
            label="Email me a new code"
            testID="code-send-new"
            busy={task.busy === "resend"}
            onPress={resend}
          />
        ) : (
          <FlowButton
            label="Verify code"
            testID="code-verify"
            busy={task.busy === "verify"}
            disabled={code.length !== 6 || busy}
            onPress={() => verify(code)}
          />
        )
      }
    >
      <View>
        <FlowTitle
          title="Check your email"
          lead={
            <>
              Enter the 6-digit code we sent to <T style={styles.email}>{email}</T>
              {why[purpose]}.
            </>
          }
        />
        <TextButton
          label="Change email"
          testID="code-change-email"
          align="start"
          disabled={busy}
          onPress={go.back}
        />
      </View>

      <View style={styles.entry}>
        <CodeInput
          value={code}
          onChange={(value) => {
            setCode(value);
            if (task.error) task.setError(null);
          }}
          onComplete={verify}
          error={rejected}
          editable={!busy}
          inputRef={inputRef}
        />
        <FormAlert message={task.error} />
      </View>

      <View style={styles.help}>
        <T style={s.meta}>
          {purpose === "recovery"
            ? "Can’t find it? Check your spam or promotions folder, and that this is the email your account uses."
            : "Can’t find it? Check your spam or promotions folder."}
        </T>
        {!expired && (
          <ResendButton key={sends} disabled={busy} onPress={resend} />
        )}
        <TestModeNotice />
      </View>
    </FlowScreen>
  );
}

/**
 * "Resend code", unavailable for a short while after each send, so nobody
 * hits the service's rate limit by accident. Meanwhile the time left shows
 * as readable muted text in the same place, rather than a faded button.
 */
function ResendButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const [until] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [left, setLeft] = useState(RESEND_SECONDS);
  useEffect(() => {
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(seconds);
      if (!seconds) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [until]);
  if (left > 0)
    return (
      <View style={styles.countdown} testID="code-resend">
        <T style={s.meta}>{`You can resend the code in ${clock(left)}`}</T>
      </View>
    );
  return (
    <TextButton
      label="Resend code"
      testID="code-resend"
      align="start"
      disabled={disabled}
      onPress={onPress}
    />
  );
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Opened without an address (an old link): start the email step again. */
function MissingEmail({ next }: { next: AfterAuth }) {
  return (
    <FlowScreen leading="close">
      <StatePanel
        level={1}
        icon="mail-outline"
        title="Start again to get a code"
        body="This step needs the email address the code was sent to."
        label="Start again"
        action={() =>
          router.replace({ pathname: "/auth/email", params: { next } })
        }
      />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  // Nested in the lead, so it restates the lead's size.
  email: { ...type.lead, fontFamily: font.semibold, color: c.text },
  entry: { gap: space.md },
  help: { gap: space.xs },
  // The button's height, so nothing moves when the countdown ends.
  countdown: { minHeight: 48, justifyContent: "center" },
});

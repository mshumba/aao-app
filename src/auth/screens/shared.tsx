import { useCallback, useState, type RefObject } from "react";
import { AccessibilityInfo, StyleSheet, TextInput, View } from "react-native";
import { useGo } from "../../navigation";
import { type } from "../../theme";
import { Notice, T, TextButton, c } from "../../ui";
import { useAccount } from "../AccountProvider";
import { LOCAL_CODE } from "../localBackend";
import { errorCode } from "../messages";
import type { AuthErrorCode } from "../types";
import { FlowButton, FlowScreen, FlowTitle, useAuthTask } from "../ui";

/** Shown under an email field that doesn't look like an address. */
export const EMAIL_FIX = "Enter an email address like name@example.com.";
export const PASSWORD_FIX = "Choose a password with at least 8 characters.";
export const MIN_PASSWORD = 8;

/**
 * useAuthTask, plus which error the last request failed with, so a screen
 * can show it beside the field it concerns instead of above the form.
 */
export function useFormTask() {
  const task = useAuthTask();
  const { run: runTask } = task;
  const [code, setCode] = useState<AuthErrorCode | null>(null);
  const run = useCallback(
    <T,>(key: string, work: () => Promise<T>) =>
      runTask(key, async () => {
        setCode(null);
        try {
          return await work();
        } catch (failure) {
          setCode(errorCode(failure));
          throw failure;
        }
      }),
    [runTask],
  );
  return { ...task, run, code };
}

/** Moves to a field whose entry needs fixing and says why. */
export function flagField(ref: RefObject<TextInput | null>, message: string) {
  ref.current?.focus();
  AccessibilityInfo.announceForAccessibility(message);
}

/** "Already have an account? Sign in", and the other way round. */
export function SwitchLine({
  prompt,
  label,
  onPress,
  testID,
  disabled,
}: {
  prompt: string;
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.switchLine}>
      <T style={styles.switchPrompt}>{prompt}</T>
      <TextButton label={label} onPress={onPress} testID={testID} disabled={disabled} />
    </View>
  );
}

/**
 * The on-device stand-in account service says so, and gives its code.
 * Never shown with real accounts.
 */
export function TestModeNotice() {
  const account = useAccount();
  if (account.mode !== "local") return null;
  return (
    <Notice icon="flask-outline">
      {`Test mode: accounts stay on this device. The code is always ${LOCAL_CODE}.`}
    </Notice>
  );
}

export const UNAVAILABLE_TITLE = "Sign-in isn’t available";
export const UNAVAILABLE_LEAD =
  "Accounts aren’t available in this build yet. You can keep browsing and watching sermons without one.";

/** A sign-in step opened in a build without an account service. */
export function AccountsUnavailable({ onClose }: { onClose?: () => void }) {
  return (
    <FlowScreen
      leading="close"
      onLeading={onClose}
      footer={<UnavailableClose onClose={onClose} />}
    >
      <FlowTitle serif={false} title={UNAVAILABLE_TITLE} lead={UNAVAILABLE_LEAD} />
    </FlowScreen>
  );
}

// Does what FlowScreen's own Close does.
function UnavailableClose({ onClose }: { onClose?: () => void }) {
  const go = useGo();
  return (
    <FlowButton label="Close" testID="unavailable-close" onPress={onClose ?? go.back} />
  );
}

const styles = StyleSheet.create({
  switchLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },
  switchPrompt: { ...type.body, color: c.muted, textAlign: "center" },
});

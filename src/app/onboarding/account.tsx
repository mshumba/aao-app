import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { useFinishFlow } from "../../auth/gate";
import { SwitchLine, TestModeNotice } from "../../auth/screens/shared";
import {
  AccountBenefits,
  FlowButton,
  FlowScreen,
  FlowTitle,
  FormAlert,
  LegalNote,
  ProviderButtons,
  useAuthTask,
} from "../../auth/ui";
import { useGo } from "../../navigation";
import { space } from "../../theme";
import { TextButton } from "../../ui";

/**
 * Onboarding step 2: create a free account, or carry on without one.
 * Apple and Google finish here; email continues in the sign-in steps, and
 * all of them come back to the name step.
 */
export default function OnboardingAccount() {
  const account = useAccount();
  const go = useGo();
  const finish = useFinishFlow();
  const task = useAuthTask();

  // Someone already signed in (a link, a reload) has nothing to create.
  // Checked once: a sign-in that happens here moves on by itself.
  const checked = useRef(false);
  useEffect(() => {
    if (!account.ready || checked.current) return;
    checked.current = true;
    if (account.user) router.replace("/onboarding/name");
  }, [account.ready, account.user]);

  // Leaves onboarding as a guest, on Home.
  const notNow = () =>
    go.run(async () => {
      await account.finishWelcome();
      await finish();
    });

  if (account.mode === "unavailable") {
    return (
      <FlowScreen
        footer={
          <FlowButton label="Continue" testID="onboarding-continue" onPress={notNow} />
        }
      >
        <FlowTitle
          title="Accounts aren’t available yet"
          lead="You can browse and watch every sermon without one."
        />
      </FlowScreen>
    );
  }

  // Back here after signing in (Android Back, the browser's Back): nothing
  // left to create, so carry on to the name step.
  if (account.user) {
    return (
      <FlowScreen
        step={[2, 3]}
        footer={
          <FlowButton
            label="Continue"
            testID="onboarding-continue"
            onPress={() => go.push("/onboarding/name")}
          />
        }
      >
        <FlowTitle
          title="You’re signed in"
          lead={account.user.email ? `Signed in as ${account.user.email}.` : undefined}
        />
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      step={[2, 3]}
      // Top right, like Skip on the other steps. It leaves onboarding as a
      // guest (there's nothing after this step without an account).
      trailing={
        <TextButton
          label="Skip"
          hint="Continues without an account"
          testID="onboarding-not-now"
          align="end"
          onPress={notNow}
        />
      }
      footer={
        <SwitchLine
          prompt="Already have an account?"
          label="Sign in"
          testID="onboarding-sign-in"
          onPress={() =>
            go.push({
              pathname: "/join",
              params: { mode: "sign-in", next: "onboarding" },
            })
          }
        />
      }
    >
      <FlowTitle title="Create your free account" />
      <AccountBenefits size="lead" />
      <TestModeNotice />
      <View style={styles.actions}>
        <FormAlert message={task.error} />
        <ProviderButtons next="onboarding" mode="sign-up" task={task} />
        <LegalNote />
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  // Sits at the bottom of the screen when there's room, nearest the thumb.
  actions: { gap: space.md, marginTop: "auto", paddingTop: space.sm },
});

import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { useFinishFlow } from "../../auth/gate";
import { TestModeNotice } from "../../auth/screens/shared";
import {
  FlowButton,
  FlowScreen,
  FlowTitle,
  FormAlert,
  LegalNote,
  ProviderButtons,
  useAuthTask,
} from "../../auth/ui";
import { useGo } from "../../navigation";
import { space, type } from "../../theme";
import { Icon, IconName, T, TextButton, c } from "../../ui";

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
          lead="You can browse and watch every message without one."
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

  const benefits: { icon: IconName; text: string }[] = [
    ...(account.guestWatch === "all"
      ? []
      : [{ icon: "play-circle-outline" as const, text: "Watch every message in full" }]),
    { icon: "bookmark-outline", text: "Save sermons to come back to" },
    { icon: "sync-outline", text: "Keep your topics on any device" },
  ];

  return (
    <FlowScreen
      step={[2, 3]}
      footer={
        <View>
          <TextButton
            label="I already have an account"
            testID="onboarding-sign-in"
            onPress={() =>
              go.push({
                pathname: "/join",
                params: { mode: "sign-in", next: "onboarding" },
              })
            }
          />
          <TextButton label="Not now" testID="onboarding-not-now" onPress={notNow} />
        </View>
      }
    >
      <FlowTitle title="Create your free account" />
      <View style={styles.benefits}>
        {benefits.map((benefit) => (
          <View key={benefit.text} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Icon name={benefit.icon} size={22} color={c.accent} />
            </View>
            <T style={styles.benefitText}>{benefit.text}</T>
          </View>
        ))}
      </View>
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
  benefits: { gap: space.lg },
  benefit: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  // Centred on the first line of text, however many lines it takes.
  benefitIcon: { height: type.lead.lineHeight, justifyContent: "center" },
  benefitText: { ...type.lead, flex: 1 },
  // Sits at the bottom of the screen when there's room, nearest the thumb.
  actions: { gap: space.md, marginTop: "auto", paddingTop: space.sm },
});

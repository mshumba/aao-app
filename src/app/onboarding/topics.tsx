import { router } from "expo-router";
import { useState } from "react";
import { useAccount } from "../../auth/AccountProvider";
import { FlowButton, FlowScreen, FlowTitle } from "../../auth/ui";
import { useMyTopics } from "../../learning";
import { useGo } from "../../navigation";
import { TopicPicker } from "../../onboarding/TopicPicker";
import { TextButton } from "../../ui";

/** Onboarding step 1: the topics to put first. Optional. */
export default function OnboardingTopics() {
  const account = useAccount();
  const go = useGo();
  // Until they tap a card, this follows the topics already stored.
  const [picked, setPicked] = useState<string[] | null>(null);
  const mine = useMyTopics();
  const value = picked ?? mine.map((topic) => topic.id);

  const next = () =>
    go.run(async () => {
      // Kept on the device first; an account's copy catches up when it can.
      // Untouched, what's stored stays (with no topics loaded, there was
      // nothing to pick).
      if (picked !== null) await account.setInterests(picked).catch(() => {});
      router.push("/onboarding/account");
    });

  return (
    <FlowScreen
      step={[1, 3]}
      trailing={
        <TextButton
          label="Skip"
          testID="topics-skip"
          align="end"
          onPress={() => go.push("/onboarding/account")}
        />
      }
      footer={
        <FlowButton label="Continue" testID="topics-continue" onPress={next} />
      }
    >
      <FlowTitle
        title="What would you like to grow in?"
        italic="grow in"
        lead="Pick any that speak to you. We’ll put them first."
      />
      <TopicPicker value={value} onChange={setPicked} />
    </FlowScreen>
  );
}

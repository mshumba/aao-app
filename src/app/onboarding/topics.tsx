import { router } from "expo-router";
import { useState } from "react";
import { useAccount } from "../../auth/AccountProvider";
import { FlowButton, FlowScreen, FlowTitle } from "../../auth/ui";
import { CategoryId } from "../../data/categories";
import { useGo } from "../../navigation";
import { TopicPicker } from "../../onboarding/TopicPicker";
import { TextButton } from "../../ui";

/** Onboarding step 1: the topics to put first. Optional. */
export default function OnboardingTopics() {
  const account = useAccount();
  const go = useGo();
  // Until they tap a card, this follows the topics already stored.
  const [picked, setPicked] = useState<CategoryId[] | null>(null);
  const value = picked ?? account.interests;

  const next = () =>
    go.run(async () => {
      // Kept on the device first; an account's copy catches up when it can.
      await account.setInterests(value).catch(() => {});
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

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { FormAlert, useAuthTask } from "../../auth/ui";
import { CategoryId } from "../../data/categories";
import { useGo } from "../../navigation";
import { TopicPicker } from "../../onboarding/TopicPicker";
import { space } from "../../theme";
import { useToast } from "../../toast";
import { Button, Header, Page, PageTitle } from "../../ui";

/**
 * Account › Your topics: the same choice as onboarding. Guests keep it on
 * this device; signed-in viewers keep it with their account.
 */
export default function YourTopics() {
  const account = useAccount();
  const go = useGo();
  const toast = useToast();
  const task = useAuthTask();
  // Until they tap a card, this follows the stored topics (which can arrive
  // a moment after the screen when the profile is still loading).
  const [picked, setPicked] = useState<CategoryId[] | null>(null);
  const value = picked ?? account.interests;

  async function save() {
    const saved = await task.run("save", async () => {
      await account.setInterests(value);
      return true;
    });
    if (!saved) return;
    toast("Topics updated");
    go.back();
  }

  return (
    <Page>
      <Header back />
      <PageTitle
        kicker="Account"
        title="Your topics"
        lead={
          account.user
            ? "Pick any that speak to you. We’ll put them first wherever you’re signed in."
            : "Pick any that speak to you. We’ll put them first on this device."
        }
      />
      <View style={styles.form}>
        <TopicPicker
          value={value}
          onChange={(ids) => {
            setPicked(ids);
            if (task.error) task.setError(null);
          }}
        />
        <FormAlert message={task.error} />
        <Button
          testID="save-topics"
          label="Save topics"
          busy={task.busy === "save"}
          onPress={save}
        />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: space.xl, gap: space.xl },
});

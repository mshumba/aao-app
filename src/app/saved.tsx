import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAccount } from "../auth/AccountProvider";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import type { Sermon } from "../data/sermons";
import { exitTo, useGo } from "../navigation";
import { space } from "../theme";
import { sermonCount } from "../topics";
import {
  Header,
  Page,
  PageTitle,
  SermonRow,
  StatePanel,
  T,
  c,
  s,
} from "../ui";

export default function Saved() {
  const account = useAccount();
  const catalogue = useCatalogue();
  const go = useGo();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    // A second failure shows this state again; nothing else to report.
    await account.reloadSaved();
    setRetrying(false);
  }

  // Newest first, as the account keeps them; ids no longer in the library
  // are skipped rather than shown as broken rows.
  const list = account.saved
    .map((id) => catalogue.find(id))
    .filter((sermon): sermon is Sermon => !!sermon);
  // The saved list arrives a moment after the session; a sermon newer than
  // the device's copy of the library arrives with the sync.
  const loading =
    retrying ||
    !account.ready ||
    (!!account.user && !account.loaded) ||
    (!catalogue.settled && list.length < account.saved.length);

  return (
    <Page>
      <Header back />
      <PageTitle title="Saved" />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading saved sermons" />
        </View>
      ) : !account.user ? (
        account.mode === "unavailable" ? (
          <StatePanel
            icon="bookmark-outline"
            title="Saving isn’t available yet"
            body="Accounts are coming soon. Until then, you can browse and watch every sermon."
            label="Browse sermons"
            action={() => exitTo("/")}
          />
        ) : (
          <StatePanel
            icon="bookmark-outline"
            title="Save sermons with a free account"
            body="Keep the sermons you want to come back to, ready on any device."
            label="Create free account"
            action={() => go.push({ pathname: "/join", params: { reason: "save" } })}
            secondaryLabel="Sign in"
            secondaryAction={() =>
              go.push({ pathname: "/join", params: { mode: "sign-in" } })
            }
          />
        )
      ) : account.savedError ? (
        <StatePanel
          icon="cloud-offline-outline"
          tone="error"
          title="Your saved sermons didn’t load"
          body="Check your connection and try again."
          label="Try again"
          action={retry}
        />
      ) : list.length ? (
        <>
          <T style={[s.meta, styles.count]}>{sermonCount(list.length)}</T>
          <View style={{ gap: space.sm }}>
            {list.map((sermon) => (
              <SermonRow key={sermon.id} sermon={sermon} />
            ))}
          </View>
        </>
      ) : (
        <StatePanel
          icon="bookmark-outline"
          title="Nothing saved yet"
          body="Tap Save on any sermon to keep it here."
          label="Browse sermons"
          action={() => exitTo("/")}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  count: { color: c.text, marginTop: space.lg, marginBottom: space.sm },
});

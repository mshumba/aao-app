import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAccount, useSaved } from "../auth/AccountProvider";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import type { Sermon } from "../data/sermons";
import { useGo } from "../navigation";
import { space } from "../theme";
import { sermonCount } from "../topics";
import { Header, Page, PageTitle, SermonRow, StatePanel, c } from "../ui";

export default function Saved() {
  const account = useAccount();
  const saved = useSaved();
  const catalogue = useCatalogue();
  const go = useGo();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    // A second failure shows this state again; nothing else to report.
    await saved.reloadSaved();
    setRetrying(false);
  }

  // Newest first, as the account keeps them; ids no longer in the library
  // are skipped rather than shown as broken rows.
  const list = saved.saved
    .map((id) => catalogue.find(id))
    .filter((sermon): sermon is Sermon => !!sermon);
  // The saved list arrives a moment after the session; a sermon newer than
  // the device's copy of the library arrives with the sync.
  const loading =
    retrying ||
    !account.ready ||
    (!!account.user && !account.loaded) ||
    (!catalogue.settled && list.length < saved.saved.length);

  return (
    <Page>
      <Header back />
      <PageTitle
        title="Saved"
        lead={
          !loading && account.user && !saved.savedError && list.length
            ? `${sermonCount(list.length)}, the most recently saved first.`
            : undefined
        }
      />
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
            label="Browse all sermons"
            action={() => go.push("/sermons")}
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
      ) : saved.savedError ? (
        <StatePanel
          icon="cloud-offline-outline"
          tone="error"
          title="Your saved sermons didn’t load"
          body="Check your connection and try again."
          label="Try again"
          action={retry}
        />
      ) : list.length ? (
        <View style={styles.rows}>
          {list.map((sermon) => (
            <SermonRow key={sermon.id} sermon={sermon} />
          ))}
        </View>
      ) : (
        <StatePanel
          icon="bookmark-outline"
          title="Nothing saved yet"
          body="Tap Save on any sermon and it will wait for you here."
          label="Browse all sermons"
          action={() => go.push("/sermons")}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  rows: { gap: space.lg, marginTop: space.lg },
});

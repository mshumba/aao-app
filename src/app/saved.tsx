import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount, useSaved } from "../auth/AccountProvider";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import type { Sermon } from "../data/sermons";
import { CardFan } from "../kit";
import { useGo } from "../navigation";
import { useDockInset } from "../player/useDockInset";
import { space, textCap, type } from "../theme";
import { sermonCount } from "../topics";
import { Button, Header, Heading, Page, PageTitle, SermonRow, StatePanel, T, TextButton, c, web } from "../ui";

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
    <Page header={<Header back />}>
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
          <Empty
            title="Saving isn’t available yet"
            body="Accounts are coming soon. Until then, you can browse and watch every sermon."
          >
            <View>
              <Button compact label="Browse all sermons" onPress={() => go.push("/sermons")} />
            </View>
          </Empty>
        ) : (
          <Empty
            title="Save sermons with a free account"
            body="Keep the sermons you want to come back to, ready on any device."
          >
            {/* A compact button sits at its row's start: the wrapper centres it. */}
            <View>
              <Button
                compact
                label="Create free account"
                onPress={() => go.push({ pathname: "/join", params: { reason: "save" } })}
              />
            </View>
            <TextButton
              label="Sign in"
              onPress={() => go.push({ pathname: "/join", params: { mode: "sign-in" } })}
            />
          </Empty>
        )
      ) : saved.savedError ? (
        <StatePanel
          icon="cloud-offline-outline"
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
        <Empty title="Nothing saved yet" body="Tap Save on any sermon and it will wait for you here." />
      )}
    </Page>
  );
}

/**
 * Nothing to list: three of the newest sermons as a little fan of posters,
 * then what to do, centred in the space under the title rather than boxed
 * at the top of it. No card.
 */
function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  const { sermons } = useCatalogue();
  const fan = useMemo(() => sermons.slice(0, 3), [sermons]);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  // Where this block starts on the page, to fill what's left of the screen
  // (the page keeps 48pt and the home indicator clear at its foot).
  const [top, setTop] = useState(0);
  const room = height - insets.top - top - (48 + insets.bottom + dock);
  return (
    <View onLayout={(e) => setTop(e.nativeEvent.layout.y)} style={[styles.empty, { minHeight: Math.max(0, room) }]}>
      {fan.length ? <CardFan sermons={fan} size="card" scale={1.25} /> : null}
      <Heading
        level={2}
        style={[styles.title, balanced]}
        lineBreakStrategyIOS="push-out"
        maxFontSizeMultiplier={textCap.section}
      >
        {title}
      </Heading>
      <T style={[styles.body, balanced]} lineBreakStrategyIOS="push-out">
        {body}
      </T>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

/** Lines of even length, never one word left on its own. */
const balanced = web({ textWrap: "balance" }) as object;

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  rows: { gap: space.lg, marginTop: space.lg },
  // A little above the true centre, where the eye expects it.
  empty: { alignItems: "center", justifyContent: "center", paddingBottom: space.xxl },
  title: { ...type.section, color: c.text, textAlign: "center", marginTop: space.xl, maxWidth: 320 },
  body: { ...type.body, color: c.muted, textAlign: "center", marginTop: space.sm, maxWidth: 320 },
  actions: { alignItems: "center", gap: space.xs, marginTop: space.xl },
});

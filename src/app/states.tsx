import { exitTo } from "../navigation";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { sampleSermons } from "../data/sermons";
import { FilterChip } from "../kit";
import { space } from "../theme";
import {
  Header,
  Page,
  PageTitle,
  StatePanel,
  T,
  TextButton,
  Thumbnail,
  c,
  s,
  useRadioKeys,
} from "../ui";

const options = [
  { id: "empty", label: "Empty" },
  { id: "loading", label: "Loading" },
  { id: "offline", label: "Offline" },
  { id: "error", label: "Error" },
  { id: "artwork", label: "Missing artwork" },
] as const;
type Sample = (typeof options)[number]["id"];

/**
 * Development only: Account links here under __DEV__, and a release build
 * treats the address as unknown.
 */
export default function States() {
  if (!__DEV__)
    return (
      <Page header={<Header back />}>
        <StatePanel
          level={1}
          icon="compass-outline"
          title="Page not found"
          body="The link may be broken or out of date."
          label="Browse sermons"
          action={() => exitTo("/")}
        />
      </Page>
    );
  return <Samples />;
}

function Samples() {
  const [state, setState] = useState<Sample>("empty");
  const radio = useRadioKeys(
    options.map((option) => option.id),
    state,
    setState,
  );
  return (
    <Page header={<Header back />}>
      <PageTitle
        kicker="For testing"
        title="Sample screens"
        lead="Examples of loading, offline and error screens. Nothing here changes your connection."
      />
      <View
        style={styles.options}
        accessibilityRole="radiogroup"
        accessibilityLabel="Sample state"
      >
        {options.map((option) => (
          <FilterChip
            key={option.id}
            {...radio(option.id)}
            label={option.label}
            selected={state === option.id}
            onPress={() => setState(option.id)}
          />
        ))}
      </View>
      <View style={styles.sample}>
        {state === "empty" && (
          <StatePanel
            title="No sermons here yet"
            body="Sermons haven’t been added to this view. The rest of the library is still here."
            label="Browse sermons"
            action={() => exitTo("/")}
          />
        )}
        {state === "loading" && (
          <View style={{ gap: space.lg }}>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={c.accent} />
              <T style={s.body}>Loading sermons…</T>
            </View>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonRow}>
                <View style={styles.skeletonThumb} />
                <View style={{ flex: 1, gap: space.sm }}>
                  <View style={[styles.skeletonLine, { width: "40%" }]} />
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, { width: "70%" }]} />
                </View>
              </View>
            ))}
            <TextButton
              label="Finish loading"
              onPress={() => setState("empty")}
            />
          </View>
        )}
        {state === "offline" && (
          <StatePanel
            icon="cloud-offline-outline"
            title="You’re offline"
            body="Sermon titles are still here. Connect to the internet to see artwork and watch."
            label="Try again"
            action={() => setState("loading")}
          />
        )}
        {state === "error" && (
          <StatePanel
            icon="alert-circle-outline"
            tone="error"
            title="The player didn’t load"
            body="Check your connection and try again."
            label="Try again"
            action={() => setState("loading")}
          />
        )}
        {state === "artwork" && (
          <View style={{ gap: space.lg }}>
            <Thumbnail
              sermon={sampleSermons[1]}
              missing
              duration
              style={{ borderRadius: 16 }}
            />
            <T style={s.body}>
              When artwork is missing, the sermon keeps its event name, title
              and Watch action.
            </T>
          </View>
        )}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.xl,
  },
  sample: { marginTop: space.lg },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingTop: space.xl,
  },
  // Sand placeholders: visible on the ivory page, quieter than content.
  skeletonRow: { flexDirection: "row", gap: space.lg, alignItems: "center" },
  skeletonThumb: {
    width: 128,
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: c.feature,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: c.feature,
  },
});

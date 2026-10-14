import { exitTo } from "../navigation";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { sermons } from "../data/sermons";
import { font, radius, space } from "../theme";
import {
  Header,
  Page,
  PageTitle,
  StatePanel,
  T,
  Tap,
  TextButton,
  Thumbnail,
  c,
  s,
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
      <Page>
        <Header back />
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
  return (
    <Page>
      <Header back />
      <PageTitle
        title="Sample screens"
        lead="Examples of loading, offline and error screens. Nothing here changes your connection."
      />
      <View
        style={styles.options}
        accessibilityRole="radiogroup"
        accessibilityLabel="Sample state"
      >
        {options.map((option) => {
          const selected = state === option.id;
          return (
            <Tap
              key={option.id}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={selected}
              onPress={() => setState(option.id)}
              style={[styles.option, selected && styles.optionOn]}
            >
              <T style={[styles.optionText, selected && { color: c.onAccent }]}>
                {option.label}
              </T>
            </Tap>
          );
        })}
      </View>
      <View style={styles.sample}>
        {state === "empty" && (
          <StatePanel
            title="No sermons here yet"
            body="Sermons haven’t been added to this view. The rest of the library is still open."
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
              sermon={sermons[1]}
              missing
              duration
              style={{ borderRadius: radius.lg }}
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
  option: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    justifyContent: "center",
  },
  optionOn: { backgroundColor: c.accent, borderColor: c.accent },
  optionText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  sample: { marginTop: space.lg },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingTop: space.xl,
  },
  // Sand placeholders: visible on the ivory page, quieter than content.
  skeletonRow: { flexDirection: "row", gap: 14 },
  skeletonThumb: {
    width: "40%",
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: c.feature,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: c.feature,
  },
});

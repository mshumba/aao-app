import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { CardFan, ItalicTitle, Kicker, PathProgress, Wash, spokenText, type ArtSource } from "../kit";
import type { Path } from "../learning";
import { c, radius, tabular, textCap, type } from "../theme";
import { Icon, T, Tap, web } from "../ui";
import { isSingleTeaching, pathWords } from "./model";

export type ListProgress =
  | { kind: "none" }
  | { kind: "on"; day: number; done: readonly number[]; partial: number }
  | { kind: "finished" };

/**
 * A path on the Paths tab: a small copy of the path page's dark cover (its
 * fan under navy light, "7 MESSAGES" or "12 TEACHINGS" and the name in
 * white serif), so opening it feels like stepping into it; then on ivory the
 * one-line promise and your progress once you've started it. One element to
 * assistive tech.
 */
export const PathListCard = memo(function PathListCard({
  path,
  fan,
  total,
  width,
  progress,
  onPress,
  style,
}: {
  path: Path;
  /** Front first. */
  fan: readonly ArtSource[];
  total: number;
  /** The card's width, to size the fan. */
  width: number;
  progress: ListProgress;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = Math.max(0.6, Math.min(0.8, (width - 40) / 340));
  const words = pathWords(path);
  const kicker = words.count(total);
  const single = isSingleTeaching(path, total);
  const status =
    progress.kind === "on"
      ? `${words.unit} ${progress.day} of ${total}, ${progress.done.length} done`
      : progress.kind === "finished"
        ? "Finished"
        : null;
  // One label, in words: "Breaking free from habitual sin. 7 messages.
  // <promise>."
  const label = [
    path.name,
    spokenText(kicker),
    path.promise,
    status,
  ]
    .filter((part): part is string => !!part)
    .map((part) => part.trim().replace(/[.!?]$/, ""))
    .join(". ")
    .concat(".");

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={single ? "Opens the teaching" : `Opens the ${words.noun}`}
      onPress={onPress}
      feedback="scaleLarge"
      style={style}
      testID={`path-card-${path.id}`}
    >
      <View style={styles.art} {...web({ dataSet: { dark: "true" } })}>
        <Wash kind="pathCover" />
        <CardFan sermons={fan} size="cover" scale={scale} style={styles.fan} />
        <Kicker tone="onMedia" style={styles.kicker}>
          {kicker}
        </Kicker>
        <ItalicTitle
          text={path.name}
          italic={path.italic}
          style={[type.pathName, styles.name]}
          maxFontSizeMultiplier={textCap.section}
        />
      </View>
      <View style={styles.body}>
        {path.promise ? <T style={styles.promise}>{path.promise}</T> : null}
        {progress.kind === "on" ? (
          <PathProgress
            total={total}
            done={progress.done}
            current={progress.day}
            partial={progress.partial}
            tone="onLight"
            thickness={3}
            caption={{
              left: `${words.unit} ${progress.day} of ${total}`,
              right: `${progress.done.length} done · ${Math.max(0, total - progress.done.length)} to go`,
            }}
            style={styles.progress}
          />
        ) : progress.kind === "finished" ? (
          <View style={styles.finished}>
            <Icon name="checkmark-circle" size={16} color={c.accent} />
            <T style={styles.finishedText}>Finished</T>
          </View>
        ) : null}
      </View>
    </Tap>
  );
});

const styles = StyleSheet.create({
  art: {
    borderRadius: radius.r22,
    backgroundColor: c.media,
    overflow: "hidden",
    alignItems: "center",
    paddingTop: 22,
    paddingBottom: 22,
    paddingHorizontal: 20,
  },
  fan: { marginBottom: 14 },
  kicker: { textAlign: "center" },
  name: { color: c.white, textAlign: "center", marginTop: 6 },
  body: { paddingTop: 12, paddingHorizontal: 2 },
  promise: { ...type.body, color: c.muted },
  progress: { marginTop: 12 },
  finished: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  finishedText: { ...type.labelSmall, color: c.accent, ...tabular },
});

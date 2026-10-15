import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { PlayPill } from "../kit";
import { c, space, textCap, type } from "../theme";
import { Heading, Icon, T, TextButton } from "../ui";
import { PathSheet } from "./Sheet";

/**
 * What a locked day says when tapped: kindly, why it waits, a way to the
 * day that's open ("Go to Day 3" plays it), and "Open Day 4 anyway" for
 * someone who wants that message now (it opens outside the path, so the
 * order stays the ministry's).
 */
export const LockedDaySheet = memo(function LockedDaySheet({
  day,
  today,
  enrolled,
  onClose,
  onGoToday,
  onOpenAnyway,
}: {
  /** The locked day tapped, or null when closed. */
  day: number | null;
  /** The day that's open now. */
  today: number;
  enrolled: boolean;
  onClose: () => void;
  onGoToday: () => void;
  onOpenAnyway: (day: number) => void;
}) {
  const shown = day != null;
  const n = day ?? today + 1;
  const title = enrolled ? `Day ${n} opens after Day ${n - 1}` : "This path starts with Day 1";
  const body = !enrolled
    ? "Each day builds on the one before, so the path begins with Day 1."
    : n - 1 === today
      ? `Each day builds on the one before. Finish Day ${today} first, and Day ${n} will be ready for you.`
      : `Each day builds on the one before. You’re on Day ${today} now; Day ${n} opens once Day ${n - 1} is done.`;
  return (
    <PathSheet visible={shown} onClose={onClose} label={title} testID="locked-day">
      <View style={styles.well}>
        <Icon name="lock-closed-outline" size={22} color={c.accent} />
      </View>
      <Heading level={2} style={styles.title} maxFontSizeMultiplier={textCap.display}>
        {title}
      </Heading>
      <T style={[type.body, styles.body]}>{body}</T>
      <View style={styles.actions}>
        <PlayPill
          tone="navy"
          size="md"
          label={enrolled ? `Go to Day ${today}` : "Start Day 1"}
          onPress={onGoToday}
          style={styles.primary}
          testID="locked-day-go"
        />
        {day != null ? (
          <TextButton
            label={`Open Day ${day} anyway`}
            hint="Opens this message on its own, outside the path"
            onPress={() => onOpenAnyway(day)}
          />
        ) : null}
      </View>
    </PathSheet>
  );
});

const styles = StyleSheet.create({
  well: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.question, fontSize: 26, lineHeight: 31, color: c.text, textAlign: "center", marginTop: 14 },
  body: { color: c.muted, textAlign: "center", marginTop: 8 },
  actions: { marginTop: space.xl, gap: space.xs, alignItems: "stretch" },
  primary: { alignSelf: "stretch", minHeight: 52 },
});

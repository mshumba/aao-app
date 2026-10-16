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
 * order stays the ministry's). A teaching series says "Teaching 4".
 */
export const LockedDaySheet = memo(function LockedDaySheet({
  day,
  today,
  enrolled,
  unit = "Day",
  noun = "path",
  onClose,
  onGoToday,
  onOpenAnyway,
}: {
  /** The locked day tapped, or null when closed. */
  day: number | null;
  /** The day that's open now. */
  today: number;
  enrolled: boolean;
  /** "Day", or "Teaching" in a series. */
  unit?: string;
  /** "path" or "series". */
  noun?: string;
  onClose: () => void;
  onGoToday: () => void;
  onOpenAnyway: (day: number) => void;
}) {
  const shown = day != null;
  const n = day ?? today + 1;
  const u = unit;
  const each = u === "Day" ? "Each day" : `Each ${u.toLowerCase()}`;
  const title = enrolled ? `${u} ${n} opens after ${u} ${n - 1}` : `This ${noun} starts with ${u} 1`;
  const body = !enrolled
    ? `${each} builds on the one before, so the ${noun} begins with ${u} 1.`
    : n - 1 === today
      ? `${each} builds on the one before. Finish ${u} ${today} first, and ${u} ${n} will be ready for you.`
      : `${each} builds on the one before. You’re on ${u} ${today} now; ${u} ${n} opens once ${u} ${n - 1} is done.`;
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
          label={enrolled ? `Go to ${u} ${today}` : `Start ${u} 1`}
          onPress={onGoToday}
          style={styles.primary}
          testID="locked-day-go"
        />
        {day != null ? (
          <TextButton
            label={`Open ${u} ${day} anyway`}
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
  title: { ...type.sermonTitle, color: c.text, textAlign: "center", marginTop: 14 },
  body: { color: c.muted, textAlign: "center", marginTop: 8 },
  actions: { marginTop: space.xl, gap: space.xs, alignItems: "stretch" },
  primary: { alignSelf: "stretch", minHeight: 52 },
});

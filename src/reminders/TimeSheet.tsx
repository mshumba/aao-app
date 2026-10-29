import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { FilterChip, Kicker } from "../kit";
import { PathSheet } from "../paths/Sheet";
import { c, space, tabular, textCap, type } from "../theme";
import { Button, T, TextButton, useRadioKeys, web } from "../ui";
import { timeText } from "./plan";
import type { ReminderTime } from "./types";

const HOURS = [
  { label: "Morning", hours: [5, 6, 7, 8, 9, 10, 11] },
  { label: "Afternoon", hours: [12, 13, 14, 15, 16, 17] },
  { label: "Evening", hours: [18, 19, 20, 21, 22, 23] },
];
const MINUTES = [0, 15, 30, 45];

/**
 * When the daily reminder comes: the hour (morning, afternoon or evening)
 * and the minutes past it, as two groups of choices, the time chosen in the
 * serif above them. Nothing changes until Set time.
 */
export function TimeSheet({
  visible,
  time,
  onClose,
  onSet,
}: {
  visible: boolean;
  /** The time it opens on. */
  time: ReminderTime;
  onClose: () => void;
  onSet: (time: ReminderTime) => void;
}) {
  return (
    <PathSheet visible={visible} onClose={onClose} label="Reminder time" testID="reminder-time-sheet">
      {/* Mounted as it opens, so it starts from the time it was given. */}
      {visible ? <Choices time={time} onClose={onClose} onSet={onSet} /> : null}
    </PathSheet>
  );
}

function Choices({
  time,
  onClose,
  onSet,
}: {
  time: ReminderTime;
  onClose: () => void;
  onSet: (time: ReminderTime) => void;
}) {
  // An hour outside the choices (none is offered) moves to the nearest one.
  const [hour, setHour] = useState(Math.min(23, Math.max(5, time.hour)));
  const [minute, setMinute] = useState(MINUTES.includes(time.minute) ? time.minute : 0);
  const hourKeys = useRadioKeys(
    HOURS.flatMap((g) => g.hours.map(String)),
    String(hour),
    (key) => setHour(Number(key)),
  );
  const minuteKeys = useRadioKeys(MINUTES.map(String), String(minute), (key) => setMinute(Number(key)));
  const chosen = timeText({ hour, minute });
  return (
    <View>
      <View style={styles.head}>
        <Kicker>Daily reminder</Kicker>
        <T
          style={[type.question, tabular, styles.time]}
          maxFontSizeMultiplier={textCap.display}
          accessibilityLiveRegion="polite"
          {...web({ "aria-live": "polite" })}
          testID="reminder-time-chosen"
        >
          {chosen}
        </T>
        <T style={styles.lead}>Each day, while you’re on a guided path.</T>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel="Hour" style={styles.groups}>
        {HOURS.map((group) => (
          <View key={group.label} style={styles.group}>
            <T style={styles.groupLabel}>{group.label}</T>
            <View style={styles.chips}>
              {group.hours.map((h) => (
                <FilterChip
                  key={h}
                  label={timeText({ hour: h, minute: 0 })}
                  selected={h === hour}
                  onPress={() => setHour(h)}
                  {...hourKeys(String(h))}
                />
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.group, styles.minutes]}>
        <T style={styles.groupLabel}>Minutes past the hour</T>
        <View accessibilityRole="radiogroup" accessibilityLabel="Minutes past the hour" style={styles.chips}>
          {MINUTES.map((m) => (
            <FilterChip
              key={m}
              label={`:${String(m).padStart(2, "0")}`}
              selected={m === minute}
              onPress={() => setMinute(m)}
              {...minuteKeys(String(m))}
            />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Button label={`Remind me at ${chosen}`} onPress={() => onSet({ hour, minute })} testID="reminder-time-set" />
        <TextButton label="Cancel" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center" },
  time: { color: c.text, marginTop: 6 },
  lead: { ...type.meta, color: c.muted, marginTop: 2 },
  groups: { gap: space.lg, marginTop: space.xl },
  group: { gap: space.sm },
  minutes: { marginTop: space.lg },
  groupLabel: { ...type.label, color: c.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  actions: { marginTop: space.xl, gap: space.xs },
});

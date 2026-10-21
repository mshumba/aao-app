import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { FilterChip } from "../kit";
import { c, font, fontSize, radius, shadows, space, textCap, type } from "../theme";
import { useToast } from "../toast";
import { Button, Heading, Icon, T, TextButton } from "../ui";
import { timeText } from "./plan";
import { useReminders } from "./RemindersProvider";
import { TimeSheet } from "./TimeSheet";
import type { ReminderTime } from "./types";

/**
 * "Remind me each day?" on a guided path's day (the sermon page, under
 * "Part of your path"), for someone on the path who hasn't been asked: the
 * time, about now until they choose another, then Remind me or Not now. The
 * one place the app offers reminders; never at a first launch, never on the
 * web. Remind me asks the phone for notifications only then. If the phone
 * says no, the card says how to allow them in Settings (the reminder stays
 * set, and starts once they're allowed).
 */
export function ReminderOffer() {
  const reminders = useReminders();
  const toast = useToast();
  // This visit's answer. While asking, and after a "no" from the phone, the
  // card stays (it was asked by then, which would otherwise hide it).
  const [answer, setAnswer] = useState<"asking" | "denied" | "done" | null>(null);
  const [time, setTime] = useState<ReminderTime | null>(null);
  const [choosing, setChoosing] = useState(false);
  if (!reminders.supported || !reminders.ready) return null;
  if (answer === "done" || (answer === null && reminders.asked)) return null;
  // Allowed in Settings since: the reminder has started.
  if (answer === "denied" && reminders.permission === "granted") return null;
  const chosen = time ?? reminders.time;

  async function remind() {
    if (answer === "asking") return;
    setAnswer("asking");
    const allowed = await reminders.turnOn(chosen);
    if (allowed === "granted") {
      setAnswer("done");
      toast(`Daily reminder on · ${timeText(chosen)}`, "notifications-outline");
    } else setAnswer("denied");
  }

  function notNow() {
    reminders.decline();
    setAnswer("done");
    toast("You can turn on reminders in Account", "notifications-outline");
  }

  const denied = answer === "denied";
  return (
    <View style={styles.card} testID="reminder-offer">
      <View style={styles.head}>
        <View style={styles.well}>
          <Icon name="notifications-outline" size={18} color={c.accent} />
        </View>
        <View style={styles.text}>
          <Heading level={3} style={styles.title} maxFontSizeMultiplier={textCap.section}>
            {denied ? "Notifications are off for AAO" : "Remind me each day?"}
          </Heading>
          <T style={styles.body}>
            {denied
              ? "Your reminder is set. Allow notifications for AAO in Settings and it will start."
              : "One gentle note a day when your next day is ready, and nothing else."}
          </T>
        </View>
      </View>
      {denied ? null : (
        <View style={styles.time}>
          <T style={styles.timeLabel}>At</T>
          <FilterChip
            role="button"
            label={timeText(chosen)}
            expanded={choosing}
            onPress={() => setChoosing(true)}
            hint="Chooses another time"
            testID="reminder-offer-time"
          />
        </View>
      )}
      <View style={styles.actions}>
        {denied ? (
          <Button
            compact
            variant="secondary"
            icon="open-outline"
            label="Open Settings"
            onPress={reminders.openSettings}
            testID="reminder-offer-settings"
          />
        ) : (
          <Button
            compact
            label="Remind me"
            busy={answer === "asking"}
            onPress={remind}
            hint={`Asks your phone to allow notifications, then reminds you each day at ${timeText(chosen)}`}
            testID="reminder-offer-yes"
          />
        )}
        <TextButton
          label="Not now"
          onPress={denied ? () => setAnswer("done") : notNow}
          testID="reminder-offer-no"
        />
      </View>
      <TimeSheet
        visible={choosing}
        time={chosen}
        onClose={() => setChoosing(false)}
        onSet={(next) => {
          setTime(next);
          setChoosing(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.md,
    padding: space.lg,
    gap: space.md,
    backgroundColor: c.surface,
    borderRadius: radius.r20,
    boxShadow: shadows.card,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  well: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: font.serif, fontSize: fontSize.heading, lineHeight: 24, letterSpacing: -0.2, color: c.text },
  body: { ...type.body, color: c.muted },
  time: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingStart: 36 + space.md },
  timeLabel: { ...type.label, color: c.text },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.md,
    paddingStart: 36 + space.md,
  },
});

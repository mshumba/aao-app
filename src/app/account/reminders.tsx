import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Card, ListGroup, ListRow, SwitchRow } from "../../kit";
import { TimeSheet, timeText, useReminders, whenText } from "../../reminders";
import { space, type } from "../../theme";
import { Button, Header, Heading, Page, PageTitle, T, c } from "../../ui";

/**
 * Account › Daily reminder: the switch and the time, what comes next, and,
 * when the phone doesn't allow notifications, the way to allow them. The
 * web has no reminders, and says where they are.
 */
export default function RemindersScreen() {
  const reminders = useReminders();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function flip(on: boolean) {
    if (!on) return reminders.turnOff();
    setBusy(true);
    try {
      await reminders.turnOn(reminders.time);
    } finally {
      setBusy(false);
    }
  }

  // From the clock now, not when they were put on the phone: the app may
  // have come back a day or more later, with some come since.
  const now = new Date();
  const next = reminders.upcoming.find((r) => r.at > now);
  const note = !reminders.enabled || reminders.permission !== "granted"
    ? undefined
    : !reminders.target
      ? "You’re not on a guided path just now. Start one and we’ll remind you each day."
      : next
        ? `Next: Day ${next.data.day} of ${reminders.target.name}, ${whenText(next.at, now)}.`
        : undefined;

  return (
    <Page header={<Header back />}>
      <PageTitle
        kicker="Account"
        title="Daily reminder"
        lead="One gentle note a day when your next day on a guided path is ready, at a time you choose. Nothing else: no new-sermon alerts and no offers."
      />
      {!reminders.supported ? (
        <Card tone="sand" style={styles.block} testID="reminders-web">
          <Heading level={2} style={styles.cardTitle}>
            On the phone apps
          </Heading>
          <T style={styles.cardBody}>
            Daily reminders come through the AAO app on iPhone and Android. Turn them on there, in Account.
          </T>
        </Card>
      ) : !reminders.ready ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading your reminder" />
        </View>
      ) : (
        <>
          <ListGroup style={styles.block} note={note}>
            <SwitchRow
              icon="notifications-outline"
              title="Remind me each day"
              value={reminders.enabled}
              disabled={busy}
              onChange={flip}
              testID="reminder-switch"
            />
            {reminders.enabled ? (
              <ListRow
                icon="time-outline"
                title="Time"
                value={timeText(reminders.time)}
                hint="Chooses when the reminder comes"
                onPress={() => setChoosing(true)}
                testID="reminder-time"
              />
            ) : null}
          </ListGroup>
          {reminders.enabled && reminders.permission && reminders.permission !== "granted" ? (
            <NotAllowed
              canAsk={reminders.permission === "undetermined"}
              onAllow={reminders.allow}
              onOpenSettings={reminders.openSettings}
            />
          ) : null}
        </>
      )}
      <TimeSheet
        visible={choosing}
        time={reminders.time}
        onClose={() => setChoosing(false)}
        onSet={(time) => {
          reminders.setTime(time);
          setChoosing(false);
        }}
      />
    </Page>
  );
}

/**
 * Reminders are on, but the phone doesn't show them: the way to allow them,
 * there and then while the phone can still ask (Android after a first "no"),
 * else in Settings.
 */
function NotAllowed({
  canAsk,
  onAllow,
  onOpenSettings,
}: {
  canAsk: boolean;
  onAllow: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <Card tone="sand" style={styles.block} testID="reminders-denied">
      <Heading level={2} style={styles.cardTitle}>
        Notifications are off for AAO
      </Heading>
      <T style={styles.cardBody}>
        {canAsk
          ? "Your reminder is set. Allow notifications for AAO and it will start."
          : "Your reminder is set. Allow notifications for AAO in Settings and it will start."}
      </T>
      <View style={styles.cardAction}>
        {canAsk ? (
          <Button compact label="Allow notifications" onPress={onAllow} testID="reminders-allow" />
        ) : (
          <Button
            compact
            variant="secondary"
            icon="open-outline"
            label="Open Settings"
            onPress={onOpenSettings}
            testID="reminders-settings"
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: space.xl },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  cardTitle: { ...type.sectionSmall, color: c.text },
  cardBody: { ...type.body, color: c.text, marginTop: space.sm },
  cardAction: { marginTop: space.lg, alignItems: "flex-start" },
});

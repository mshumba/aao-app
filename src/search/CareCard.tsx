import { memo, useEffect, useRef } from "react";
import { Linking, Platform, StyleSheet, View, type Text } from "react-native";
import { c, font, radius, textCap, type } from "../theme";
import { Icon, T, Tap, moveFocus, web } from "../ui";
import { HELPLINE_URL, careText } from "./care";

/**
 * Above everything else when someone may be in distress: a calm card, navy
 * on sand (no alarm colours), saying they don't have to carry this alone,
 * to call their local emergency number if they might act on these thoughts,
 * and where to find a helpline (findahelpline.com, opened outside the app).
 * It can't be dismissed. On iOS and Android the screen reader moves to it
 * as it appears; on the web the screen's live region reads it first.
 */
export const CareCard = memo(function CareCard() {
  const title = useRef<Text>(null);
  useEffect(() => {
    if (Platform.OS === "web") return;
    // After the screen reader has finished with the tap that searched.
    const timer = setTimeout(() => moveFocus(title.current as unknown as View | null), 500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View testID="care-card" style={styles.card} role="region" accessibilityLabel={careText.title}>
      <View style={styles.icon}>
        <Icon name="heart-outline" size={20} color={c.accent} />
      </View>
      <T
        ref={title}
        accessibilityRole="header"
        {...web({ "aria-level": 2 })}
        style={[styles.title, prettyWrap]}
        maxFontSizeMultiplier={textCap.section}
      >
        {careText.title}
      </T>
      <T style={styles.body}>{careText.body}</T>
      <Tap
        accessibilityRole="link"
        accessibilityLabel={careText.link}
        accessibilityHint="Opens findahelpline.com in your browser"
        onPress={() => Linking.openURL(HELPLINE_URL).catch(() => {})}
        style={styles.link}
      >
        <T style={styles.linkText} maxFontSizeMultiplier={textCap.chip}>
          {careText.link}
        </T>
        <Icon name="open-outline" size={16} color={c.onAccent} />
      </Tap>
    </View>
  );
});

/**
 * Someone in distress whose search couldn't answer, or answered with nothing
 * (it was down): one calm line and a way to try again, never sermon titles,
 * other needs or their own words in its place.
 */
export function CareCalm({ onRetry }: { onRetry: () => void }) {
  return (
    <View testID="care-calm" style={styles.calm}>
      <T style={styles.calmTitle}>{careText.failed}</T>
      <T style={styles.calmBody}>Try again in a moment. The helpline above is there now.</T>
      <Tap accessibilityRole="button" accessibilityLabel="Try again" onPress={onRetry} feedback="dim" style={styles.retry}>
        <Icon name="refresh" size={16} color={c.accent} />
        <T style={styles.retryText} maxFontSizeMultiplier={textCap.chip}>
          Try again
        </T>
      </Tap>
    </View>
  );
}

/** On the web, lines broken evenly ("this alone." never left on its own). */
const prettyWrap = web({ textWrap: "pretty" }) as object;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 20,
    borderRadius: radius.r22,
    backgroundColor: c.feature,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { ...type.sectionSmall, color: c.text },
  body: { ...type.body, color: c.mutedOnFeature, marginTop: 6 },
  link: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    marginTop: 16,
    borderRadius: radius.pill,
    backgroundColor: c.accent,
  },
  linkText: { ...type.button, color: c.onAccent },
  calm: { marginHorizontal: 24, marginTop: 20 },
  calmTitle: { ...type.heading, fontFamily: font.serif, color: c.text },
  calmBody: { ...type.body, color: c.muted, marginTop: 4 },
  retry: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginTop: 6 },
  retryText: { ...type.button, color: c.accent },
});

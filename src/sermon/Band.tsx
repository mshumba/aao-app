import { StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Spark } from "../kit/Spark";
import { c, font, textCap, type } from "../theme";
import { T } from "../ui";

/**
 * "From your search: rejection" in the band's centre for the first six
 * seconds after opening from a search, then it fades away.
 */
export function SearchPill({ q }: { q: string }) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.pill}
      accessible
      accessibilityLabel={`From your search: ${q}`}
    >
      <Spark size={12} color={c.gold} />
      <T style={styles.pillText} numberOfLines={2} maxFontSizeMultiplier={textCap.chip}>
        From your search: <T style={styles.pillQuery}>{q}</T>
      </T>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Information only: a tap here falls through to the strip.
  pill: {
    pointerEvents: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: c.feature,
    borderWidth: 1,
    borderColor: c.border,
  },
  pillText: { ...type.metaSmall, color: c.muted, flexShrink: 1 },
  pillQuery: { fontFamily: font.bold, color: c.text },
});

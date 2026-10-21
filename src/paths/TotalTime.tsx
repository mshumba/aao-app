import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { totalTime } from "../learning/format";
import { c, tabular, textCap, type } from "../theme";
import { Icon, T, web } from "../ui";

/**
 * A path's length, its sermons whole, as a clock and "12h" (the owner: "use
 * a clock symbol and 12h"). Drawn only: whatever holds it says
 * `totalTime(seconds).spoken` ("About 12 hours") in its own label.
 */
export const TotalTime = memo(function TotalTime({
  seconds,
  tone = "onDark",
  style,
}: {
  seconds: number;
  tone?: "onDark" | "onLight";
  style?: StyleProp<ViewStyle>;
}) {
  const color = tone === "onDark" ? c.onMediaMuted : c.muted;
  return (
    <View
      style={[styles.row, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <Icon name="time-outline" size={14} color={color} />
      <T style={[type.metaSmall, tabular, { color }]} maxFontSizeMultiplier={textCap.section}>
        {totalTime(seconds).text}
      </T>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});

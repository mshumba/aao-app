import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { c, font, radius, tabular } from "../../theme";
import { T, web } from "../../ui";

/**
 * Circular arrow with "15" inside, turning back (counter-clockwise) or
 * forward (clockwise), matching the Mindvalley lesson player reference.
 */
export const Skip15Icon = memo(function Skip15Icon({
  direction,
  size = 32,
  color = c.white,
}: {
  direction: "back" | "forward";
  size?: number;
  color?: string;
}) {
  const back = direction === "back";
  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        {back ? (
          <>
            <Path
              d="M16 5.5A10.5 10.5 0 1 1 6.3 12"
              stroke={color}
              strokeWidth={2.1}
              strokeLinecap="round"
            />
            <Path
              d="M11.5 5.5L16.5 5.5L14.5 1.8"
              stroke={color}
              strokeWidth={2.1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <>
            <Path
              d="M16 5.5A10.5 10.5 0 1 0 25.7 12"
              stroke={color}
              strokeWidth={2.1}
              strokeLinecap="round"
            />
            <Path
              d="M20.5 5.5L15.5 5.5L17.5 1.8"
              stroke={color}
              strokeWidth={2.1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </Svg>
      <T
        style={[
          styles.skipNumber,
          { color, fontSize: Math.round(size * 0.34), lineHeight: Math.round(size * 0.38) },
        ]}
        maxFontSizeMultiplier={1}
      >
        15
      </T>
    </View>
  );
});

/**
 * The top-right header icon: a small play triangle beside stacked lines,
 * opening the path's days or the sermon's moments.
 */
export const PlaylistIcon = memo(function PlaylistIcon({
  size = 20,
  color = c.text,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={{ width: size, height: size }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        <Path d="M3 4.2L8.2 7.2L3 10.2V4.2Z" fill={color} />
        <Path
          d="M10.5 6H17M10.5 10.5H17M4 15H17"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
});

/**
 * Closed captions badge ("CC") at the top right of the video overlay.
 * Filled white when captions are on; translucent outlined badge when off.
 */
export const CcBadge = memo(function CcBadge({ active = false }: { active?: boolean }) {
  return (
    <View
      style={[styles.ccBox, active && styles.ccBoxActive]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <T style={[styles.ccText, active && styles.ccTextActive]} maxFontSizeMultiplier={1}>
        CC
      </T>
    </View>
  );
});

/** Four-corner full-screen icon (or inward corners when exiting). */
export const FullscreenIcon = memo(function FullscreenIcon({
  exit = false,
  size = 18,
  color = c.white,
}: {
  exit?: boolean;
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={{ width: size, height: size }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        {exit ? (
          <Path
            d="M7 3V7H3M13 3V7H17M7 17V13H3M13 17V13H17"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <Rect x={0} y={0} width={20} height={20} fill="none" />
            <Path
              d="M3 7.5V3.5H7M13 3.5H17V7.5M17 12.5V16.5H13M7 16.5H3V12.5"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  skipNumber: {
    position: "absolute",
    top: "33%",
    fontFamily: font.extrabold,
    letterSpacing: -0.4,
    ...tabular,
  },
  ccBox: {
    minWidth: 28,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: radius.sm / 2,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.88)",
    backgroundColor: "rgba(15, 17, 21, 0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  ccBoxActive: {
    backgroundColor: c.white,
    borderColor: c.white,
  },
  ccText: {
    fontFamily: font.extrabold,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.3,
    color: c.white,
  },
  ccTextActive: {
    color: c.media,
  },
});

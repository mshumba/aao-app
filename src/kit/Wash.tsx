import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { gradients } from "../theme";
import { gradient, web } from "../ui";

/**
 * One of the concept's fades or lights over its parent (touches pass
 * through): "heroScrim" and "heroFade" on Home's hero, "pathCover" behind a
 * path's fan, "stage" on the sermon stage, "pathCard", "tabFade", "ctaFade",
 * "pageEnd". Fills the parent, or with `band` and `height` runs along its
 * top or bottom edge (heroFade: `band="bottom" height={68}`).
 */
export const Wash = memo(function Wash({
  kind,
  band,
  height,
  style,
}: {
  kind: keyof typeof gradients;
  band?: "top" | "bottom";
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const box: ViewStyle = band
    ? { position: "absolute", left: 0, right: 0, height, [band]: 0 }
    : StyleSheet.absoluteFill;
  return (
    <View
      accessible={false}
      {...web({ "aria-hidden": true })}
      style={[box, { pointerEvents: "none" }, gradient(gradients[kind]), style]}
    />
  );
});

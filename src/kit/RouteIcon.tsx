import { memo } from "react";
import { View, type ViewStyle } from "react-native";
import { web } from "../ui";
import { Glyph, hasGlyphs } from "./icons/Glyph";

/**
 * The concept's Paths glyph (a route between two points), which Ionicons
 * doesn't have: the tab bar's SVG glyph (kit/icons). `bold` is the selected
 * form, with its two stops filled and a heavier line.
 */
export const RouteIcon = memo(function RouteIcon({
  size = 22,
  color,
  bold = false,
}: {
  size?: number;
  color: string;
  bold?: boolean;
}) {
  if (hasGlyphs) return <Glyph name="paths" active={bold} color={color} size={size} />;
  return <DrawnRoute size={size} color={color} bold={bold} />;
});

/**
 * The same glyph drawn with views, for a native build made before
 * react-native-svg was added. Geometry is the 24-unit icon: circles at
 * (6,19) and (18,5) joined by an S-shaped run.
 */
function DrawnRoute({ size, color, bold }: { size: number; color: string; bold: boolean }) {
  const k = size / 24;
  const w = (bold ? 2.5 : 1.75) * k;
  const u = (n: number) => n * k;

  const ring = (cx: number, cy: number, r: number): ViewStyle => ({
    position: "absolute",
    left: u(cx - r) - w / 2,
    top: u(cy - r) - w / 2,
    width: u(r * 2) + w,
    height: u(r * 2) + w,
    borderRadius: (u(r * 2) + w) / 2,
    borderWidth: w,
    borderColor: color,
  });
  const line = (x1: number, x2: number, y: number): ViewStyle => ({
    position: "absolute",
    left: u(x1),
    top: u(y) - w / 2,
    width: u(x2 - x1),
    height: w,
    backgroundColor: color,
  });
  // A half circle of radius 3.5 at (cx, cy): the right half or the left.
  const half = (cx: number, cy: number, side: "right" | "left") => {
    const r = 3.5;
    const clipW = u(r) + w / 2;
    return (
      <View
        style={{
          position: "absolute",
          left: side === "right" ? u(cx) : u(cx) - clipW,
          top: u(cy - r) - w / 2,
          width: clipW,
          height: u(r * 2) + w,
          overflow: "hidden",
        }}
      >
        <View style={{ ...ring(r, r, r), left: side === "right" ? -clipW : 0, top: 0 }} />
      </View>
    );
  };

  return (
    <View
      style={{ width: size, height: size }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <View style={ring(6, 19, 2.5)} />
      <View style={ring(18, 5, 2.5)} />
      <View style={line(8.5, 16, 19)} />
      {half(16, 15.5, "right")}
      <View style={line(8, 16, 12)} />
      {half(8, 8.5, "left")}
      <View style={line(8, 15.5, 5)} />
    </View>
  );
}

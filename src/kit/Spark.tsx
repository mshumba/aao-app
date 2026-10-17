import { memo } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { c } from "../theme";
import { web } from "../ui";

// The concept's sparkle: one slender four-point star with a small one at its
// top right (the concept's #spark), drawn once as PNGs and tinted here, so
// no SVG library is needed on native.
const SPARK = require("../../assets/icons/spark.png");

/** The search sparkle, `size` points square, in `color` (navy by default). */
export const Spark = memo(function Spark({
  size = 20,
  color = c.accent,
  style,
}: {
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={SPARK}
      accessible={false}
      {...web({ "aria-hidden": true })}
      style={[{ width: size, height: size, tintColor: color }, style]}
      resizeMode="contain"
    />
  );
});

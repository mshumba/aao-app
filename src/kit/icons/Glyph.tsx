import { memo } from "react";
import { TurboModuleRegistry } from "react-native";
import { GLYPHS, STROKE, type GlyphProps } from "./glyphs";

/**
 * iOS and Android draw glyphs with react-native-svg when this build has it.
 * A build made before it was added (TestFlight build 2, which only gets
 * JavaScript updates) lacks its native module, and loading the library
 * there would throw at once, so it's only loaded when the module is found
 * (the same lookup the library makes). Callers check `hasGlyphs` and keep
 * their older icons otherwise. The web draws plain SVG (Glyph.web.tsx).
 */
type SvgModule = typeof import("react-native-svg");
const svg: SvgModule | null = TurboModuleRegistry.get("RNSVGSvgViewModule")
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("react-native-svg") as SvgModule)
  : null;

export const hasGlyphs = svg !== null;

export const Glyph = memo(function Glyph({ name, active = false, color, size = 22 }: GlyphProps) {
  if (!svg) return null;
  const { default: Svg, Path, Circle } = svg;
  const glyph = GLYPHS[name];
  const stroke = {
    stroke: color,
    strokeWidth: active ? glyph.strokeOn : STROKE,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {glyph.shapes.map((shape, i) => {
        const fill = active && shape.fillOn ? color : "none";
        return shape.kind === "path" ? (
          <Path key={i} d={shape.d} fill={fill} {...stroke} />
        ) : (
          <Circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} fill={fill} {...stroke} />
        );
      })}
    </Svg>
  );
});

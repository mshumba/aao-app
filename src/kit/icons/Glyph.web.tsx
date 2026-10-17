import { memo } from "react";
import { GLYPHS, STROKE, type GlyphProps } from "./glyphs";

/** The web draws glyphs as plain SVG, so they cost the bundle nothing. */
export const hasGlyphs = true;

export const Glyph = memo(function Glyph({ name, active = false, color, size = 22 }: GlyphProps) {
  const glyph = GLYPHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-glyph={name}
      data-active={active ? "true" : "false"}
      fill="none"
      stroke={color}
      strokeWidth={active ? glyph.strokeOn : STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0 }}
    >
      {glyph.shapes.map((shape, i) => {
        const fill = active && shape.fillOn ? color : "none";
        return shape.kind === "path" ? (
          <path key={i} d={shape.d} fill={fill} />
        ) : (
          <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} fill={fill} />
        );
      })}
    </svg>
  );
});

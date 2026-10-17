import type { Ref } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, type TextProps } from "react-native";
import { c, font } from "../theme";

/**
 * The lowest-level pieces every screen and kit component builds on. They
 * live here, below ui.tsx, so that ui.tsx can use the kit's artwork without
 * the two importing each other; ui.tsx re-exports them.
 */

/**
 * Web-only attributes (heading levels, field descriptions) that React Native's
 * types don't describe. react-native-web maps them onto the DOM.
 */
export function web(props: Record<string, unknown>) {
  return Platform.OS === "web" ? props : {};
}

export function T({ style, ref, ...props }: TextProps & { ref?: Ref<Text> }) {
  // When the system text size changes while the app is open or in the
  // background, iOS keeps the old measured box for text already on screen
  // (rows kept their old height). A key per font scale re-measures it.
  const { fontScale } = useWindowDimensions();
  return <Text key={fontScale} ref={ref} {...props} style={[styles.text, style]} />;
}

const styles = StyleSheet.create({
  text: {
    color: c.text,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 23,
  },
});

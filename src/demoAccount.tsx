import { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { radius, space, type } from "./theme";
import { Icon, T, c } from "./ui";

export const demoNotice =
  "Accounts aren’t live yet. Nothing you type is sent or saved, so please use sample details, not a real password.";

/**
 * The one place each account screen says it's a demo. Demo-only controls
 * (sample details, simulated result) sit inside it, apart from the form.
 */
export function DemoPanel({
  children,
  text = demoNotice,
}: PropsWithChildren<{ text?: string }>) {
  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Icon name="flask-outline" size={18} color={c.mint} />
        <T style={styles.label}>This is a demo</T>
      </View>
      <T style={styles.text}>{text}</T>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    borderStyle: "dashed",
  },
  heading: { flexDirection: "row", alignItems: "center", gap: space.sm },
  label: { ...type.kicker, color: c.mint },
  text: { ...type.body, fontSize: 14, lineHeight: 21, color: c.muted },
});

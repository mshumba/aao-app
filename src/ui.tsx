import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React, { ComponentProps, PropsWithChildren, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { c } from "./theme";
import { Sermon } from "./data/sermons";
import { getCategory } from "./data/categories";
export { c };
type IconName = ComponentProps<typeof Ionicons>["name"];
export function T({ style, ...props }: TextProps) {
  return <Text {...props} style={[s.text, style]} />;
}
export function Icon({
  name,
  size = 22,
  color = c.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons accessible={false} name={name} size={size} color={color} />;
}
export function IconButton({
  name,
  label,
  onPress,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, pressed && s.pressed]}
    >
      <Icon name={name} />
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  secondary = false,
  icon,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.5 },
        pressed && s.pressed,
      ]}
    >
      {icon && (
        <Icon name={icon} color={secondary ? c.text : c.ink} size={20} />
      )}
      <T style={[s.buttonText, { color: secondary ? c.text : c.ink }]}>
        {label}
      </T>
    </Pressable>
  );
}
export function Page({
  children,
  keyboard = false,
}: PropsWithChildren<{ keyboard?: boolean }>) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={keyboard && Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.page}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Header({
  title = "Arome Osayi",
  back = false,
  close = false,
}: {
  title?: string;
  back?: boolean;
  close?: boolean;
}) {
  const pathname = usePathname();
  return (
    <View style={s.header}>
      {back || close ? (
        <IconButton
          name={close ? "close" : "arrow-back"}
          label={close ? "Close" : "Back"}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        />
      ) : (
        <View style={s.wordmarkLine} />
      )}
      <T accessibilityRole="header" style={s.brand}>
        {title}
      </T>
      {!close && (
        <IconButton
          name="menu-outline"
          label="Menu"
          onPress={() =>
            router.push({ pathname: "/menu", params: { origin: pathname } })
          }
        />
      )}
    </View>
  );
}
export function SectionHeading({
  children,
  aside,
}: PropsWithChildren<{ aside?: string }>) {
  return (
    <View style={s.sectionHeading}>
      <T accessibilityRole="header" style={s.sectionTitle}>
        {children}
      </T>
      {aside && <T style={s.small}>{aside}</T>}
    </View>
  );
}
export function Badge({ children }: PropsWithChildren) {
  return (
    <View style={s.badge}>
      <T style={s.badgeText}>{children}</T>
    </View>
  );
}
export function StatePanel({
  icon = "albums-outline",
  title,
  body,
  action,
  label,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <View style={s.state}>
      <View style={s.stateIcon}>
        <Icon name={icon} color={c.mint} size={30} />
      </View>
      <T accessibilityRole="header" style={s.stateTitle}>
        {title}
      </T>
      <T style={s.body}>{body}</T>
      {action && label && <Button label={label} onPress={action} />}
    </View>
  );
}
export function Thumbnail({
  sermon,
  height,
  missing = false,
}: {
  sermon: Sermon;
  height?: number;
  missing?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[s.thumbnail, height ? { height } : { aspectRatio: 16 / 9 }]}>
      {!failed && !missing ? (
        <Image
          source={{ uri: sermon.thumbnail }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityLabel={sermon.title + " thumbnail"}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={s.thumbFallback}>
          <Icon name="play-outline" size={30} color={c.mint} />
          <T style={s.small}>Arome Osayi · sermon</T>
        </View>
      )}
    </View>
  );
}
export function SermonCard({
  sermon,
  compact = false,
}: {
  sermon: Sermon;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        "Open " +
        sermon.title +
        ". Demo topic: " +
        getCategory(sermon.edification.primaryCategoryId)?.label
      }
      onPress={() =>
        router.push({ pathname: "/sermon/[id]", params: { id: sermon.id } })
      }
      style={({ pressed }) => [
        s.card,
        compact && { width: "48%" },
        pressed && s.pressed,
      ]}
    >
      <Thumbnail sermon={sermon} />
      <View style={s.cardBody}>
        <T style={s.collection}>
          {getCategory(sermon.edification.primaryCategoryId)?.label} · Demo
        </T>
        <T numberOfLines={3} style={s.cardTitle}>
          {sermon.title}
        </T>
        <T style={s.small}>
          {sermon.collection} · {sermon.duration}
        </T>
      </View>
    </Pressable>
  );
}
export const s = StyleSheet.create({
  text: {
    color: c.text,
    fontFamily: "Manrope_400Regular",
    fontSize: 15,
    lineHeight: 23,
  },
  safe: { flex: 1, backgroundColor: c.bg },
  page: {
    paddingHorizontal: 22,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 78,
    marginBottom: 12,
  },
  brand: { fontFamily: "Manrope_700Bold", fontSize: 17, flex: 1 },
  wordmarkLine: {
    width: 4,
    height: 24,
    backgroundColor: c.mint,
    borderRadius: 2,
  },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  button: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: c.mint,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondary: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  buttonText: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    textAlign: "center",
    flexShrink: 1,
  },
  pressed: { opacity: 0.76 },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
    marginTop: 30,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 20, fontFamily: "Manrope_700Bold", flexShrink: 1 },
  small: { fontSize: 12, lineHeight: 19, color: c.muted },
  body: { fontSize: 15, lineHeight: 25, color: c.muted },
  title: {
    fontSize: 32,
    lineHeight: 41,
    fontFamily: "Manrope_700Bold",
    letterSpacing: -1,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: c.surface,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 16,
    color: c.mint,
    fontFamily: "Manrope_700Bold",
    letterSpacing: 1,
  },
  state: { paddingVertical: 34, gap: 17 },
  stateIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  stateTitle: { fontSize: 25, lineHeight: 33, fontFamily: "Manrope_700Bold" },
  thumbnail: { width: "100%", backgroundColor: c.feature, overflow: "hidden" },
  thumbFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  cardBody: { padding: 14, gap: 8 },
  cardTitle: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Manrope_600SemiBold",
  },
  collection: {
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: c.mint,
    textTransform: "uppercase",
    fontFamily: "Manrope_600SemiBold",
  },
  input: {
    minHeight: 54,
    color: c.text,
    fontFamily: "Manrope_400Regular",
    fontSize: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 13,
    backgroundColor: c.surface,
  },
  divider: { height: 1, backgroundColor: c.border, marginVertical: 24 },
});

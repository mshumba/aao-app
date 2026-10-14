import { Ionicons } from "@expo/vector-icons";
import React, {
  ComponentProps,
  PropsWithChildren,
  ReactNode,
  Ref,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  PressableProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { CategoryId, getCategory } from "./data/categories";
import { eventLine, headline } from "./data/display";
import { Sermon, sermonCategoryIds } from "./data/sermons";
import { useReducedMotion } from "./motion";
import { useGo, usePageTitle } from "./navigation";
import { useDockInset } from "./player/useDockInset";
import { c, easeOut, font, press, radius, space, type } from "./theme";
export { c };

type IconName = ComponentProps<typeof Ionicons>["name"];
export type { IconName };

/**
 * Web-only attributes (heading levels, field descriptions) that React Native's
 * types don't describe. react-native-web maps them onto the DOM.
 */
export function web(props: Record<string, unknown>) {
  return Platform.OS === "web" ? props : {};
}

/**
 * Text fields here draw their own navy focus border, so the browser's default
 * ring is removed on web. "none" is web-only, hence outside RN's style types.
 */
export const noWebOutline =
  Platform.OS === "web"
    ? ({ outlineStyle: "none" } as unknown as TextStyle)
    : null;

/**
 * Press tint for icon buttons and rows: a wash of the text colour, so it
 * shows on the ivory page, white sheets and sand cards alike.
 */
export const pressedTint = "rgba(27, 30, 36, 0.06)";

/**
 * Edge of text fields (and Home's search field, which stands in for one).
 * The hairline c.border is decorative only; a field's edge needs 3:1 against
 * white (3.8:1) and the ivory page (3.5:1).
 */
export const fieldBorder = "#878279";

/** Moves keyboard focus (web) or screen reader focus (native) to a control. */
export function moveFocus(node: View | null) {
  if (!node) return;
  if (Platform.OS === "web") (node as unknown as HTMLElement).focus();
  else AccessibilityInfo.sendAccessibilityEvent(node, "focus");
}

/**
 * Web: once a dialog or the docked player closes, keyboard focus goes back
 * to `target` (the control that opened it) if it's still on the page, or
 * else to the screen's selected tab, Back or Close, rather than dropping to
 * the top of the document. Left alone if something has already taken focus
 * (the sermon's Play after Watch).
 */
export function returnFocus(target?: Element | null) {
  if (Platform.OS !== "web") return;
  setTimeout(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const shown = (node: Element): node is HTMLElement =>
      node instanceof HTMLElement &&
      node.isConnected &&
      !node.closest('[aria-hidden="true"], [inert]');
    if (target && target !== document.body && shown(target)) {
      target.focus();
      if (document.activeElement === target) return;
    }
    Array.from(
      document.querySelectorAll(
        '[role="tab"][aria-selected="true"], [aria-label="Back"], [aria-label="Close"]',
      ),
    )
      .find(shown)
      ?.focus();
  }, 0);
}

/** A key press on the web, as react-native-web passes it to handlers. */
export type WebKey = { key: string; preventDefault: () => void };

/**
 * Web keyboard for a group of radios, as the ARIA radio group pattern
 * expects: one Tab stop (the checked option, or the first), and the arrow
 * keys move to the next or previous option and select it, wrapping round.
 * Spread the result for each option onto its Tap.
 */
export function useRadioKeys<K extends string>(
  keys: readonly K[],
  checked: K | undefined,
  select: (key: K) => void,
) {
  const nodes = useRef<Partial<Record<K, View | null>>>({});
  const stop = checked !== undefined && keys.includes(checked) ? checked : keys[0];
  return (key: K) => ({
    ref: (node: View | null) => {
      nodes.current[key] = node;
    },
    ...web({ tabIndex: key === stop ? 0 : -1 }),
    onWebKey: (e: WebKey) => {
      const step =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : 0;
      if (!step) return;
      e.preventDefault();
      const next = keys[(keys.indexOf(key) + step + keys.length) % keys.length];
      select(next);
      moveFocus(nodes.current[next] ?? null);
    },
  });
}

/**
 * Lets the browser scroll a focused control clear of the docked player,
 * which floats over the bottom of the page.
 */
export function dockScrollPadding(dock: number) {
  return Platform.OS === "web"
    ? ({ scrollPaddingBottom: dock } as ViewStyle)
    : undefined;
}

export function T({ style, ...props }: TextProps) {
  // When the system text size changes while the app is open or in the
  // background, iOS keeps the old measured box for text already on screen
  // (rows kept their old height). A key per font scale re-measures it.
  const { fontScale } = useWindowDimensions();
  return <Text key={fontScale} {...props} style={[s.text, style]} />;
}

/** A heading with a real level: h1 for the page title, h2 for sections. */
export function Heading({
  level = 2,
  ...props
}: TextProps & { level?: 1 | 2 | 3 }) {
  return (
    <T accessibilityRole="header" {...web({ "aria-level": level })} {...props} />
  );
}

/**
 * A verified sermon title. The string is never changed; only the "|"
 * separators are drawn in the system face, because Manrope's bar is the same
 * shape as a capital I ("CONFERENCE II PRAY" would read as a numeral).
 */
export function SermonTitle({
  title,
  ...props
}: TextProps & { title: string }) {
  const parts = title.split(/(\|+)/);
  return (
    <T {...props}>
      {parts.map((part, index) =>
        /^\|+$/.test(part) ? (
          <Text key={index} style={s.separator}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </T>
  );
}

/** "2 hr 28 min" read aloud as "2 hours 28 minutes". */
export function spokenDuration(duration: string) {
  return duration
    .replace(/\b1 hr\b/, "1 hour")
    .replace(/\bhr\b/, "hours")
    .replace(/\b1 min\b/, "1 minute")
    .replace(/\bmin\b/, "minutes");
}

/** Keeps "2 hr 28 min" and "23 Sep 2026" from breaking across lines. */
export function nowrap(text: string) {
  return text.replace(/ /g, " ");
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
  return (
    <Ionicons
      accessible={false}
      {...web({ "aria-hidden": true })}
      name={name}
      size={size}
      color={color}
    />
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Feedback = "scale" | "scaleLarge" | "highlight" | "dim";

/**
 * Pressable with press-in feedback that commits on release.
 * - scale: small controls shrink 3% over 120ms (strong ease-out).
 * - scaleLarge: full-width surfaces shrink 2%, so edges don't wobble.
 * - highlight: rows inside a shared surface and icon buttons tint instead.
 * - dim: borderless text actions fade, like iOS text buttons.
 * Under Reduce Motion, scaling becomes a dim.
 */
export function Tap({
  style,
  feedback = "scale",
  highlightColor = c.feature,
  disabled,
  busy = false,
  onPress,
  onPressIn,
  onPressOut,
  onWebKey,
  ref,
  ...rest
}: Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  feedback?: Feedback;
  highlightColor?: string;
  busy?: boolean;
  ref?: Ref<View>;
  /** Web only: other keys this control handles (a radio group's arrows). */
  onWebKey?: (e: WebKey) => void;
}) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  const active = pressed && !disabled && !busy;
  const scales = feedback === "scale" || feedback === "scaleLarge";
  const scale =
    active && scales && !reduced
      ? feedback === "scale"
        ? press.scale
        : press.scaleLarge
      : 1;
  const dimmed =
    active && (feedback === "dim" || (scales && reduced)) ? 0.6 : 1;
  const role = rest.accessibilityRole;
  return (
    <AnimatedPressable
      {...rest}
      ref={ref as never}
      // Busy controls ignore presses but stay focusable, so keyboard focus
      // isn't thrown to the page while a demo request "runs".
      disabled={disabled}
      onPress={busy ? undefined : onPress}
      // VoiceOver otherwise activates by tapping the control's centre, which
      // can land on the docked player floating above it.
      {...(Platform.OS === "ios"
        ? {
            onAccessibilityTap:
              disabled || busy ? undefined : () => onPress?.(undefined as never),
          }
        : null)}
      // On web, Space selects radios and tabs as it does native controls.
      {...(role === "radio" || role === "tab" || onWebKey
        ? web({
            onKeyDown: (e: WebKey) => {
              const space = e.key === " " || e.key === "Spacebar";
              if (space && (role === "radio" || role === "tab")) {
                if (disabled || busy) return;
                e.preventDefault();
                onPress?.(e as never);
                return;
              }
              onWebKey?.(e);
            },
          })
        : null)}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[
        style,
        active &&
          feedback === "highlight" && { backgroundColor: highlightColor },
        {
          opacity: disabled && !busy ? 0.45 : dimmed,
          transform: [{ scale }],
          transitionProperty: ["transform", "opacity"],
          transitionDuration: press.duration,
          transitionTimingFunction: easeOut,
        },
      ]}
    />
  );
}

export function IconButton({
  name,
  label,
  onPress,
  color = c.text,
  size = 24,
  testID,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  testID?: string;
}) {
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={s.iconButton}
      feedback="highlight"
      highlightColor={pressedTint}
    >
      <Icon name={name} size={size} color={color} />
    </Tap>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  busy = false,
  hint,
  testID,
}: {
  label: string;
  onPress: () => void;
  /** danger: destructive and final (Delete account); never navy. */
  variant?: "primary" | "secondary" | "danger";
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
  testID?: string;
}) {
  const fg = variant === "secondary" ? c.text : c.onAccent;
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      // aria-* rather than accessibilityState: react-native-web only maps these.
      aria-disabled={disabled || busy}
      aria-busy={busy}
      onPress={onPress}
      disabled={disabled}
      busy={busy}
      style={[s.button, s[variant]]}
    >
      {busy ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        icon && <Icon name={icon} color={fg} size={20} />
      )}
      <T style={[s.buttonText, { color: fg }]}>{label}</T>
    </Tap>
  );
}

/** A borderless navy action for secondary choices ("Forgot password?"). */
export function TextButton({
  label,
  onPress,
  icon,
  disabled = false,
  align = "center",
  hint,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  align?: "center" | "start" | "end";
  hint?: string;
  testID?: string;
}) {
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      feedback="dim"
      style={[
        s.textButton,
        align === "start" && { alignSelf: "flex-start", marginStart: -space.sm },
        align === "end" && { alignSelf: "flex-end", marginEnd: -space.sm },
        align === "center" && { alignSelf: "center" },
      ]}
    >
      <T style={s.textButtonLabel}>{label}</T>
      {icon && <Icon name={icon} size={16} color={c.accent} />}
    </Tap>
  );
}

/**
 * A scrolling screen. Content runs under the home indicator and ends clear of
 * it, rather than stopping at a fixed band above it.
 */
/**
 * A linear gradient on both platforms without a dependency: CSS on web,
 * experimental_backgroundImage on native (React Native 0.76+, New Arch).
 */
export function gradient(css: string): ViewStyle {
  return (
    Platform.OS === "web"
      ? { backgroundImage: css }
      : { experimental_backgroundImage: css }
  ) as ViewStyle;
}

export function Page({
  children,
  keyboard = false,
}: PropsWithChildren<{ keyboard?: boolean }>) {
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={keyboard && Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          // react-native-web dismisses on any scroll, including the scroll
          // that brings a newly focused field into view, so native only.
          keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
          style={dockScrollPadding(dock)}
          contentContainerStyle={[
            s.page,
            { paddingBottom: 48 + insets.bottom + dock },
          ]}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Screen chrome for Home (the wordmark) and for screens opened over the tabs:
 * Back, or Close for the account forms you leave rather than go back through.
 * A title here is the page's heading, so screens with their own large title
 * leave it out.
 */
export function Header({
  title,
  back = false,
  close = false,
}: {
  title?: string;
  back?: boolean;
  close?: boolean;
}) {
  const go = useGo();
  const home = !back && !close;
  return (
    <View style={s.header}>
      {home ? (
        <View style={s.wordmark}>
          <View style={s.wordmarkLine} />
          <Heading level={1} style={s.wordmarkText}>
            Arome Osayi
          </Heading>
        </View>
      ) : (
        <>
          <IconButton
            name={close ? "close" : "arrow-back"}
            label={close ? "Close" : "Back"}
            onPress={go.back}
          />
          <View style={{ flex: 1 }}>
            {title ? (
              <Heading level={1} numberOfLines={1} style={s.headerTitle}>
                {title}
              </Heading>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

/** A screen's large title with an optional lead paragraph. */
export function PageTitle({
  title,
  lead,
  children,
}: PropsWithChildren<{ title: string; lead?: ReactNode }>) {
  usePageTitle(title);
  return (
    <View style={s.pageTitleBlock}>
      {children}
      <Heading level={1} style={s.pageTitle} maxFontSizeMultiplier={1.8}>
        {title}
      </Heading>
      {lead ? <T style={s.lead}>{lead}</T> : null}
    </View>
  );
}

export function SectionHeading({
  children,
  aside,
  action,
  style,
}: PropsWithChildren<{
  aside?: string;
  action?: { label: string; onPress: () => void; hint?: string };
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <View style={[s.sectionHeading, action && { minHeight: 48 }, style]}>
      <Heading level={2} style={s.sectionTitle}>
        {children}
      </Heading>
      {action ? (
        <TextButton
          label={action.label}
          hint={action.hint}
          onPress={action.onPress}
          icon="chevron-forward"
          align="end"
        />
      ) : (
        aside && <T style={s.meta}>{aside}</T>
      )}
    </View>
  );
}

/** Quiet inline note, used for honest limits (sample topics, YouTube). */
export function Notice({
  children,
  icon = "information-circle-outline",
}: PropsWithChildren<{ icon?: IconName }>) {
  return (
    <View style={s.notice}>
      <Icon name={icon} size={16} color={c.muted} />
      <T style={[s.meta, { flex: 1 }]}>{children}</T>
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
  secondaryAction,
  secondaryLabel,
  tone = "neutral",
  level = 2,
}: {
  icon?: IconName;
  title: string;
  body: ReactNode;
  action?: () => void;
  label?: string;
  secondaryAction?: () => void;
  secondaryLabel?: string;
  tone?: "neutral" | "error";
  level?: 1 | 2;
}) {
  // A panel that is the page's heading names the page.
  usePageTitle(level === 1 ? title : null);
  return (
    <View style={s.state}>
      <View style={s.stateIcon}>
        <Icon
          name={icon}
          color={tone === "error" ? c.error : c.accent}
          size={28}
        />
      </View>
      <View style={{ gap: space.sm }}>
        <Heading level={level} style={s.stateTitle}>
          {title}
        </Heading>
        <T style={s.body}>{body}</T>
      </View>
      {(action || secondaryAction) && (
        <View style={{ gap: space.md, marginTop: space.sm }}>
          {action && label && <Button label={label} onPress={action} />}
          {secondaryAction && secondaryLabel && (
            <Button
              label={secondaryLabel}
              variant="secondary"
              onPress={secondaryAction}
            />
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Source artwork, or a stand-in built from verified metadata when the image is
 * missing or fails to load. Always decorative: the title sits beside it.
 */
export function Thumbnail({
  sermon,
  height,
  missing = false,
  duration = false,
  compact = false,
  style,
}: {
  sermon: Sermon;
  height?: number;
  missing?: boolean;
  duration?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={[
        s.thumbnail,
        height ? { height } : { aspectRatio: 16 / 9 },
        style,
      ]}
      {...web({ "aria-hidden": true })}
    >
      {!failed && !missing ? (
        <Image
          source={{ uri: sermon.thumbnail }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessible={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={s.thumbFallback} testID="thumbnail-fallback">
          <Icon
            name="play-circle-outline"
            size={compact ? 24 : 32}
            color={c.accent}
          />
          {!compact && (
            <T style={s.thumbFallbackText} numberOfLines={2}>
              {sermon.collection}
            </T>
          )}
        </View>
      )}
      <View
        style={[
          s.ring,
          { pointerEvents: "none" },
          { borderRadius: StyleSheet.flatten(style)?.borderRadius ?? 0 },
        ]}
      />
      {duration && (
        <View style={s.durationChip}>
          <T style={s.durationText} maxFontSizeMultiplier={1.5}>
            {nowrap(sermon.duration)}
          </T>
        </View>
      )}
    </View>
  );
}

/**
 * How much of a sermon has been watched, 0 to 1. Decorative: the time left
 * is always said in words beside it. `onMedia` draws it over artwork.
 */
export function ProgressBar({
  value,
  onMedia = false,
  style,
}: {
  value: number;
  onMedia?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  return (
    <View
      testID="progress-bar"
      style={[s.progressTrack, onMedia && s.progressTrackOnMedia, style]}
      {...web({ "aria-hidden": true })}
    >
      <View
        style={[
          s.progressFill,
          onMedia && s.progressFillOnMedia,
          { width: `${percent}%` },
        ]}
      />
    </View>
  );
}

/** Sample topic labels, with the topic being browsed first when given. */
export function topicLabels(sermon: Sermon, lead?: CategoryId) {
  const ids = sermonCategoryIds(sermon);
  const ordered =
    lead && ids.includes(lead) ? [lead, ...ids.filter((id) => id !== lead)] : ids;
  return ordered
    .map((id) => getCategory(id)?.label)
    .filter(Boolean) as string[];
}

/**
 * True when the reading column is under ~300pt at the user's text size, from
 * a narrow screen, browser zoom or large accessibility text.
 */
export function useNarrow() {
  const { width, fontScale } = useWindowDimensions();
  return (Math.min(width, 760) - space.gutter * 2) / fontScale < 300;
}

/**
 * Side-by-side rows need roughly 140pt of text column at the user's text
 * size; below that the artwork moves above the text.
 */
function useStackedRows() {
  const { width, fontScale } = useWindowDimensions();
  const content = Math.min(width, 760) - space.gutter * 2;
  const thumb = Math.min(176, Math.max(112, content * 0.4));
  return (content - thumb - 14) / fontScale < 140;
}

export function sermonLabel(sermon: Sermon, lead?: CategoryId) {
  const topics = topicLabels(sermon, lead);
  return [
    `${headline(sermon)}.`,
    `${eventLine(sermon)}, ${sermon.date}, ${spokenDuration(sermon.duration)}.`,
    topics.length ? `Sample topics: ${topics.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The list unit for sermons: artwork on the leading side, then sample topic
 * labels, the short headline and the event and date.
 */
export function SermonRow({
  sermon,
  lead,
}: {
  sermon: Sermon;
  lead?: CategoryId;
}) {
  const go = useGo();
  const stacked = useStackedRows();
  const topics = topicLabels(sermon, lead).slice(0, 2);
  return (
    <Tap
      testID="sermon-row"
      accessibilityRole="button"
      accessibilityLabel={sermonLabel(sermon, lead)}
      onPress={() =>
        go.push({ pathname: "/sermon/[id]", params: { id: sermon.id } })
      }
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={[s.row, stacked && s.rowStacked]}
    >
      <Thumbnail
        sermon={sermon}
        duration
        compact={!stacked}
        style={stacked ? s.rowThumbStacked : s.rowThumb}
      />
      <View style={s.rowBody}>
        {topics.length > 0 && <T style={s.kicker}>{topics.join(" · ")}</T>}
        <SermonTitle
          title={headline(sermon)}
          numberOfLines={stacked ? undefined : 2}
          style={s.rowTitle}
        />
        <T style={s.meta}>
          {eventLine(sermon)} · {nowrap(sermon.date)}
        </T>
      </View>
    </Tap>
  );
}

/**
 * A sermon as a card in a horizontal rail: artwork above, then the headline
 * and which part of the series it is.
 */
export function SermonCard({
  sermon,
  width,
  detail,
}: {
  sermon: Sermon;
  width: number;
  /** The line under the headline; the event line by default. */
  detail?: string;
}) {
  const go = useGo();
  const meta = detail ?? eventLine(sermon);
  return (
    <Tap
      testID="sermon-card"
      accessibilityRole="button"
      accessibilityLabel={sermonLabel(sermon)}
      onPress={() =>
        go.push({ pathname: "/sermon/[id]", params: { id: sermon.id } })
      }
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={[s.card, { width }]}
    >
      <Thumbnail sermon={sermon} duration compact style={s.cardThumb} />
      <View style={{ gap: 4 }}>
        <SermonTitle
          title={headline(sermon)}
          numberOfLines={2}
          style={s.rowTitle}
        />
        <T style={s.meta} numberOfLines={2}>
          {meta ? `${meta} · ` : ""}
          {nowrap(sermon.date)}
        </T>
      </View>
    </Tap>
  );
}

export const s = StyleSheet.create({
  text: {
    color: c.text,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 23,
  },
  separator: {
    fontFamily: Platform.select({
      ios: "System",
      android: "sans-serif",
      default: "system-ui, sans-serif",
    }),
    fontWeight: "300",
    color: c.muted,
  },
  safe: { flex: 1, backgroundColor: c.bg },
  page: {
    paddingHorizontal: space.gutter,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 56,
    marginHorizontal: -12,
    marginBottom: space.sm,
  },
  headerTitle: {
    fontFamily: font.bold,
    fontSize: 17,
    lineHeight: 24,
  },
  wordmark: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingStart: 12,
  },
  wordmarkLine: {
    width: 4,
    height: 22,
    backgroundColor: c.accent,
    borderRadius: 2,
  },
  wordmarkText: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
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
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primary: { backgroundColor: c.accent },
  // White with a hairline: quieter than the navy fill, still a clear button
  // on the ivory page and on white sheets.
  secondary: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  danger: { backgroundColor: c.error },
  buttonText: {
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    flexShrink: 1,
  },
  textButton: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  textButtonLabel: {
    ...type.label,
    color: c.accent,
    textAlign: "center",
  },
  pageTitleBlock: {
    gap: space.md,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  pageTitle: type.display,
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: space.md,
    marginTop: 36,
    marginBottom: space.md,
  },
  sectionTitle: { ...type.heading, flexShrink: 1 },
  lead: { ...type.lead, color: c.muted },
  body: { ...type.body, color: c.muted },
  meta: { ...type.caption, color: c.muted },
  // Navy caps mean "sample topic"; verified or editorial labels use eyebrow.
  kicker: { ...type.kicker, color: c.accent },
  eyebrow: { ...type.kicker, color: c.muted },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingTop: 1,
  },
  // Sand, so it reads as a label (not a button) on ivory and white alike.
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: c.feature,
  },
  badgeText: { ...type.kicker, color: c.accent },
  state: { paddingVertical: space.xl, gap: space.lg },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.feature,
    justifyContent: "center",
    alignItems: "center",
  },
  stateTitle: { fontFamily: font.bold, fontSize: 22, lineHeight: 29 },
  thumbnail: {
    width: "100%",
    backgroundColor: c.feature,
    overflow: "hidden",
  },
  // Drawn inside the image edge so pale artwork keeps its shape on the
  // ivory page.
  ring: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.06)",
  },
  thumbFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
  },
  thumbFallbackText: {
    ...type.kicker,
    color: c.mutedOnFeature,
    textAlign: "center",
  },
  durationChip: {
    position: "absolute",
    end: 6,
    bottom: 6,
    backgroundColor: c.scrim,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  // On the dark scrim over artwork, whatever the page colour.
  durationText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: font.semibold,
    color: c.onMedia,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: space.sm,
  },
  rowStacked: { flexDirection: "column", gap: space.md },
  rowThumb: {
    width: "40%",
    maxWidth: 176,
    minWidth: 112,
    borderRadius: radius.md,
  },
  rowThumbStacked: { borderRadius: radius.md },
  rowBody: { flex: 1, gap: 6, alignSelf: "stretch" },
  rowTitle: {
    fontFamily: font.semibold,
    fontSize: 16,
    lineHeight: 22,
  },
  card: { gap: space.sm, paddingVertical: space.xs },
  cardThumb: { borderRadius: radius.md },
  divider: { height: 1, backgroundColor: c.divider },
  // The scrubber's rail and fill, so watched progress reads the same
  // everywhere. Over artwork: white on a dark wash, which holds on pale
  // artwork and dark alike.
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(27, 30, 36, 0.5)",
    overflow: "hidden",
  },
  progressTrackOnMedia: { backgroundColor: c.scrim },
  progressFill: { height: 4, backgroundColor: c.accent },
  progressFillOnMedia: { backgroundColor: c.onMedia },
});

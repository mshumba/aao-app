import { Ionicons } from "@expo/vector-icons";
import React, {
  ComponentProps,
  PropsWithChildren,
  ReactNode,
  Ref,
  memo,
  useMemo,
  useRef,
  useState,
} from "react";
import { Artwork } from "./kit/Artwork";
import { T, web } from "./kit/base";
import { WebIcon } from "./kit/icons/WebIcon";
import { splitItalic } from "./kit/italic";
import { spokenKicker } from "./kit/time";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { eventLine, eventParts, headline } from "./data/display";
import { Sermon } from "./data/sermons";
import { useReducedMotion } from "./motion";
import { useGo, usePageTitle } from "./navigation";
import { shortDay } from "./home/copy";
import { useDockInset } from "./player/useDockInset";
import { c, font, press, radius, shadows, space, tabular, textCap, type } from "./theme";
export { c, T, web };

type IconName = ComponentProps<typeof Ionicons>["name"];
export type { IconName };

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
  list = false,
  style,
  numberOfLines,
  ...props
}: TextProps & {
  title: string;
  /**
   * In a list (rows, rails, cards): the one style every list draws a
   * sermon's title in, two lines at most unless numberOfLines says else.
   */
  list?: boolean;
}) {
  const parts = title.split(/(\|+)/);
  return (
    <T
      {...props}
      numberOfLines={list && numberOfLines === undefined ? 2 : numberOfLines}
      style={[list && s.listTitle, style]}
    >
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

/**
 * An Ionicon. The web draws it as SVG, so it never waits for (or shows an
 * empty box before) the icon font: see src/kit/icons/WebIcon.web.tsx.
 */
export function Icon({
  name,
  size = 22,
  color = c.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  if (Platform.OS === "web") return <WebIcon name={name} size={size} color={color} />;
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

/**
 * Web: react-native-web ignores `hitSlop`, so a control drawn smaller than
 * 44pt (a 36pt chip, a 40pt round button) would only answer touches on what
 * is drawn. An invisible child reaching past the edges by the slop takes
 * those touches instead; it's inside the control, so presses bubble to it.
 */
function webSlop(hitSlop: PressableProps["hitSlop"], border = 0): ViewStyle | null {
  if (Platform.OS !== "web" || hitSlop == null) return null;
  // An absolute child is placed from inside the border, so a bordered
  // control (an outlined chip) reaches its edge plus the border.
  const n = (v: number | null | undefined) => -((v ?? 0) + border);
  const box =
    typeof hitSlop === "number"
      ? { top: -hitSlop, bottom: -hitSlop, left: -hitSlop, right: -hitSlop }
      : { top: n(hitSlop.top), bottom: n(hitSlop.bottom), left: n(hitSlop.left), right: n(hitSlop.right) };
  if (!box.top && !box.bottom && !box.left && !box.right) return null;
  return { position: "absolute", ...box };
}

// Web: one keyboard focus ring for every control, navy on the light page and
// white on the dark surfaces (anything inside a view with dataSet={{ dark }}).
if (Platform.OS === "web" && typeof document !== "undefined" && !document.getElementById("aao-focus")) {
  const style = document.createElement("style");
  style.id = "aao-focus";
  style.textContent = [
    "[role=button]:focus-visible,[role=link]:focus-visible,[role=tab]:focus-visible,[role=radio]:focus-visible,[role=adjustable]:focus-visible,[role=slider]:focus-visible,[role=switch]:focus-visible,[role=checkbox]:focus-visible,a:focus-visible{outline:2px solid #1f3a5f;outline-offset:2px}",
    "[data-dark] [role=button]:focus-visible,[data-dark] [role=link]:focus-visible,[data-dark] [role=adjustable]:focus-visible,[data-dark] [role=slider]:focus-visible,[data-dark] a:focus-visible{outline-color:#ffffff}",
  ].join("\n");
  document.head.appendChild(style);
}

type Feedback = "scale" | "scaleLarge" | "highlight" | "dim";

/** A quick tap keeps the pressed look this long, so every tap shows. */
const MIN_PRESSED = 100;

/**
 * Phone: the longest the pressed look waits, once the finger lifts, for the
 * press's work (often building the next screen) before letting go.
 */
const MAX_HELD = 400;

/** The theme's easeOut, as a curve for Animated. */
const pressEase = Easing.bezier(0.23, 1, 0.32, 1);

/** Web: the browser draws the press, on the theme's easeOut. */
const pressTransition =
  Platform.OS === "web"
    ? ({
        transitionProperty: "opacity, transform",
        transitionDuration: `${press.duration}ms`,
        transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
      } as unknown as ViewStyle)
    : null;

/**
 * Pressable with press-in feedback that commits on release.
 * - scale: small controls shrink 3% over 120ms (strong ease-out).
 * - scaleLarge: full-width surfaces shrink 2%, so edges don't wobble.
 * - highlight: rows inside a shared surface and icon buttons tint instead.
 * - dim: borderless text actions fade, like iOS text buttons.
 * Under Reduce Motion, scaling becomes a dim.
 *
 * On a phone the look runs on Animated's native driver, on the UI thread. A
 * press costs only a small update of the control as each step settles, and
 * a Tap nobody presses never re-renders for its look (Reanimated's styles
 * did, a second or so after every screen appeared, when it handed their
 * settled values back to React). A quick tap still shows for MIN_PRESSED,
 * and the look holds through the press's work, up to MAX_HELD, so a slow
 * push never leaves a moment with nothing pressed.
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
  const reduced = useReducedMotion();
  // 0 at rest, 1 pressed.
  const [pressed] = useState(() => new Animated.Value(0));
  const downAt = useRef<number | null>(null);
  const webTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = !disabled && !busy;
  const scales = feedback === "scale" || feedback === "scaleLarge";
  const shrink =
    scales && !reduced
      ? 1 - (feedback === "scale" ? press.scale : press.scaleLarge)
      : 0;
  const dims = feedback === "dim" || (scales && reduced);
  const resting = disabled && !busy ? 0.45 : 1;
  const highlight = feedback === "highlight";
  const ground = highlight
    ? ((StyleSheet.flatten(style)?.backgroundColor ?? "transparent") as string)
    : "transparent";
  // Kept across renders, so the animated nodes (on a phone, their native
  // twins) are built once per look rather than on every parent render.
  const look = useMemo(() => {
    const toward = (rest: number, on: number) =>
      live ? pressed.interpolate({ inputRange: [0, 1], outputRange: [rest, on] }) : rest;
    return {
      opacity: dims ? toward(resting, resting * 0.6) : resting,
      transform: [{ scale: shrink ? toward(1, 1 - shrink) : 1 }],
      // The tint switches halfway rather than fading through a darker mix.
      ...(highlight && {
        backgroundColor: live
          ? pressed.interpolate({
              inputRange: [0.5, 0.51],
              outputRange: [ground, highlightColor],
              extrapolate: "clamp",
            })
          : ground,
      }),
      ...pressTransition,
    };
  }, [pressed, live, dims, resting, shrink, highlight, ground, highlightColor]);
  // Eases the look to `to` (1 pressed, 0 at rest) after keeping it where it
  // is for `hold` ms. On a phone the hold is part of the curve, since
  // Animated's delays are JS timers, so it lets go on time however busy the
  // press's work keeps the JS thread. On the web the value changes after the
  // hold and the CSS transition draws it.
  const move = (to: number, hold = 0) => {
    if (Platform.OS === "web") {
      if (webTimer.current) clearTimeout(webTimer.current);
      webTimer.current = null;
      if (hold > 0) webTimer.current = setTimeout(() => pressed.setValue(to), hold);
      else pressed.setValue(to);
      return;
    }
    const start = hold / (hold + press.duration);
    Animated.timing(pressed, {
      toValue: to,
      duration: hold + press.duration,
      easing: (t) => (t < start ? 0 : pressEase((t - start) / (1 - start))),
      useNativeDriver: true,
    }).start();
  };
  // Lets go, after MIN_PRESSED from the press-in when the tap was quicker.
  const release = () => {
    if (downAt.current === null) return;
    const held = Date.now() - downAt.current;
    downAt.current = null;
    move(0, Math.max(MIN_PRESSED - held, 0));
  };
  const role = rest.accessibilityRole;
  const slop = webSlop(
    rest.hitSlop,
    Platform.OS === "web" ? (StyleSheet.flatten(style)?.borderWidth ?? 0) : 0,
  );
  const children =
    slop && typeof rest.children !== "function" ? (
      <>
        <View style={[slop, { pointerEvents: "auto" }]} aria-hidden />
        {rest.children}
      </>
    ) : (
      rest.children
    );
  return (
    <AnimatedPressable
      {...rest}
      ref={ref as never}
      // Busy controls ignore presses but stay focusable, so keyboard focus
      // isn't thrown to the page while a demo request "runs".
      disabled={disabled}
      onPress={
        busy || !onPress
          ? undefined
          : (e) => {
              // The web keeps the action inside the click, which sharing,
              // copying and playback need. Its press-out comes first, so
              // the look has already let go.
              if (Platform.OS === "web") {
                release();
                onPress(e);
                return;
              }
              // A phone sends the press as the finger lifts (press-out
              // follows 130ms after press-in at the earliest). The look
              // holds from here, shown at once if the press-in came with it,
              // while the action's work runs, and lets go a frame after it,
              // or after MAX_HELD on the UI thread if the work runs longer.
              const at = downAt.current;
              downAt.current = null;
              if (at !== null) {
                pressed.setValue(1);
                move(0, MAX_HELD);
              }
              const lifted = Date.now();
              onPress(e);
              if (at === null) return;
              requestAnimationFrame(() => {
                // Unless the hold ran out or a new press has begun.
                if (Date.now() - lifted >= MAX_HELD || downAt.current !== null) return;
                move(0, Math.max(at + MIN_PRESSED - Date.now(), 0));
              });
            }
      }
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
        if (live) {
          downAt.current = Date.now();
          move(1);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        release();
        onPressOut?.(e);
      }}
      style={[style, look]}
    >
      {children}
    </AnimatedPressable>
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

/**
 * The app's one button shape: a pill. "primary" is the navy action (one per
 * card or section), "secondary" a white pill with a hairline, "danger" the
 * destructive and final kind. Full width by default, 52pt; `compact` sizes
 * it to its label at 44pt (state panels, inline actions).
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  busy = false,
  hint,
  testID,
  compact = false,
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
  compact?: boolean;
}) {
  const fg = variant === "secondary" ? c.accent : c.onAccent;
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
      feedback={compact ? "scale" : "scaleLarge"}
      style={[s.button, compact && s.buttonCompact, s[variant]]}
    >
      {busy ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        icon && <Icon name={icon} color={fg} size={compact ? 16 : 20} />
      )}
      <T
        style={[compact ? s.buttonTextCompact : s.buttonText, { color: fg }]}
        maxFontSizeMultiplier={textCap.chip}
      >
        {label}
      </T>
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
 * Screen chrome for screens opened over the tabs: Back (or Close, for the
 * account forms you leave rather than go back through) as the concept's
 * round button, white on the ivory page. Without either it draws the
 * wordmark. A title here is the page's heading, so screens with their own
 * large title leave it out.
 */
export function Header({
  title,
  back = false,
  close = false,
  disabled = false,
}: {
  title?: string;
  back?: boolean;
  close?: boolean;
  /** Back or Close can't be pressed (while something it would abandon runs). */
  disabled?: boolean;
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
          <RoundBack close={close} disabled={disabled} onPress={go.back} />
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

/** Back or Close: a 40pt white circle with a hairline, 48pt to touch. */
export function RoundBack({
  close = false,
  disabled,
  onPress,
  label,
  testID,
}: {
  close?: boolean;
  disabled?: boolean;
  onPress: () => void;
  label?: string;
  testID?: string;
}) {
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label ?? (close ? "Close" : "Back")}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={s.roundBack}
    >
      <Icon name={close ? "close" : "chevron-back"} size={20} color={c.text} />
    </Tap>
  );
}

/**
 * A page's title, as the finished screens set theirs: an optional gold
 * kicker, the title in the serif (one phrase in italics when `italic`
 * names it), and a muted lead. Wraps, never truncates; Dynamic Type stops
 * at 1.3× for the title.
 */
export function PageTitle({
  title,
  lead,
  kicker,
  italic,
  children,
}: PropsWithChildren<{
  title: string;
  lead?: ReactNode;
  /** Sentence case; drawn uppercase ("Your account"). */
  kicker?: string;
  /** The phrase of the title set in Newsreader italic. */
  italic?: string | null;
}>) {
  usePageTitle(title);
  const parts = splitItalic(title, italic);
  return (
    <View style={s.pageTitleBlock}>
      {children}
      {kicker ? (
        <T
          style={s.pageKicker}
          accessibilityLabel={spokenKicker(kicker)}
          maxFontSizeMultiplier={textCap.section}
        >
          {kicker}
        </T>
      ) : null}
      <Heading level={1} style={s.pageTitle} maxFontSizeMultiplier={textCap.display}>
        {parts.before}
        {parts.italic ? <Text style={s.italic}>{parts.italic}</Text> : null}
        {parts.after}
      </Heading>
      {lead ? <T style={[s.lead, s.pageLead]}>{lead}</T> : null}
    </View>
  );
}

/**
 * A section's serif heading on a page (24/28), with a navy text action or a
 * muted aside on its baseline. Serif for what is said to you; a list's
 * label stays in Manrope.
 */
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
    <View style={[s.sectionHeading, style]}>
      <Heading level={2} style={s.sectionTitle} maxFontSizeMultiplier={textCap.section}>
        {children}
      </Heading>
      {action ? (
        <View style={s.sectionAction}>
          <TextButton
            label={action.label}
            hint={action.hint}
            onPress={action.onPress}
            align="end"
          />
        </View>
      ) : (
        aside && <T style={[s.meta, tabular]}>{aside}</T>
      )}
    </View>
  );
}

/** Quiet inline note, used for honest limits (how topics are matched, YouTube). */
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

/**
 * What happened, in one serif line; why, in one muted line; and the way
 * forward as pills. A white card on the ivory page with a sand icon well,
 * as Search's calm states are drawn. Errors stay calm (navy, never red):
 * `tone` is kept for older callers.
 */
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
  testID,
  children,
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
  testID?: string;
  children?: ReactNode;
}) {
  // A panel that is the page's heading names the page.
  usePageTitle(level === 1 ? title : null);
  return (
    <View testID={testID} style={s.state}>
      <View style={s.stateIcon}>
        <Icon name={icon} color={c.accent} size={24} />
      </View>
      <Heading level={level} style={s.stateTitle} maxFontSizeMultiplier={textCap.section}>
        {title}
      </Heading>
      <T style={s.stateBody}>{body}</T>
      {children ? <View style={s.stateExtra}>{children}</View> : null}
      {(action || secondaryAction) && (
        <View style={s.stateActions}>
          {action && label && <Button compact label={label} onPress={action} />}
          {secondaryAction && secondaryLabel && (
            <Button
              compact
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

/**
 * True when the reading column is under ~300pt at the user's text size, from
 * a narrow screen, browser zoom or large accessibility text.
 */
export function useNarrow() {
  const { width, fontScale } = useWindowDimensions();
  return (Math.min(width, 760) - space.gutter * 2) / fontScale < 300;
}

/** Row artwork: 112pt, 96pt on a narrow phone (320pt). */
export function rowArtWidth(width: number) {
  return width < 360 ? 96 : 112;
}

/**
 * Side-by-side rows need roughly 120pt of text column at the user's text
 * size; below that the artwork moves above the text.
 */
function useStackedRows(art: number) {
  const { width, fontScale } = useWindowDimensions();
  const content = Math.min(width, 760) - space.gutter * 2;
  return (content - art - 16) / fontScale < 120;
}

/**
 * What a sermon reads aloud as one element. `shown` is the title and kicker a
 * row draws instead of the headline and event line (a series page's "Day 4 ·
 * Morning"), so the label says what's on screen.
 */
export function sermonLabel(sermon: Sermon, shown?: { title: string; kicker: string | null }) {
  const title = shown ? spokenKicker(shown.title) : headline(sermon);
  const kicker = shown ? shown.kicker && spokenKicker(shown.kicker) : eventLine(sermon);
  return `${title}. ${[kicker, sermon.date, spokenDuration(sermon.duration)].filter(Boolean).join(", ")}.`;
}

/**
 * "11 Oct · 1 hr 36 min", with the year only when it isn't this one ("23
 * Sep 2025 · 2 hr 28 min"), unbroken inside each part. Spoken labels keep
 * the full date (sermonLabel).
 */
export function sermonMeta(sermon: Pick<Sermon, "day" | "date" | "duration">, now = new Date()) {
  const date = nowrap((sermon.day && shortDay(sermon.day, now)) || sermon.date);
  return sermon.duration ? `${date} · ${nowrap(sermon.duration)}` : date;
}

/**
 * The list unit for sermons, everywhere a list of them appears (Home's
 * latest, All sermons, Saved, a series, a topic, More sermons): 16:9 artwork
 * on the leading side, then the event as a gold kicker, the headline (two
 * lines, see SermonTitle) and the date and length. At large text the
 * artwork moves above the words. One accessible element.
 *
 * Memoised: a long list redraws its cells on every batch it renders, so
 * pass a stable `onPress` (or none) for a row to skip those.
 */
export const SermonRow = memo(function SermonRow({
  sermon,
  title,
  kicker,
  detail,
  onPress,
  hint,
  progress,
  testID = "sermon-row",
}: {
  sermon: Sermon;
  /** Replaces the headline ("Day 4 · Morning" on a series page). */
  title?: string;
  /** Replaces the event line as the kicker ("Part 2", "Session 3"). */
  kicker?: string | null;
  /** A line under the date ("1 hr 12 min left"), in navy. */
  detail?: string | null;
  /** Instead of opening the sermon's page. */
  onPress?: () => void;
  hint?: string;
  /** Watched part, 0 to 1, along the artwork's bottom edge. */
  progress?: number | null;
  testID?: string;
}) {
  const go = useGo();
  const { width } = useWindowDimensions();
  const art = rowArtWidth(width);
  const stacked = useStackedRows(art);
  const top = kicker === undefined ? eventLine(sermon) : kicker;
  // Kept to one line beside the artwork: the event gives way, and the
  // session ("Day 2 Morning") that tells a gathering's rows apart stays.
  const split = kicker === undefined && !stacked ? eventParts(sermon) : null;
  const label = sermonLabel(sermon, title === undefined ? undefined : { title, kicker: top });
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label} ${detail}.` : label}
      accessibilityHint={hint}
      onPress={
        onPress ??
        (() => go.push({ pathname: "/sermon/[id]", params: { id: sermon.id } }))
      }
      // Rows sit in scrolling lists: the delay keeps a scroll's first touch
      // from pressing one, and Tap still shows a quick tap made inside it.
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={[s.row, stacked && s.rowStacked]}
    >
      <Artwork
        art={sermon}
        width={stacked ? undefined : art}
        radius={10}
        progress={progress}
        fallback={sermon.collection}
        priority="low"
      />
      <View style={s.rowBody}>
        {split?.session ? (
          <View style={s.rowKickerLine}>
            <T style={[s.rowKicker, s.rowKickerLead]} numberOfLines={1} maxFontSizeMultiplier={textCap.section}>
              {split.lead}
            </T>
            <T style={[s.rowKicker, s.rowKickerSession]} numberOfLines={1} maxFontSizeMultiplier={textCap.section}>
              {`\u00a0·\u00a0${nowrap(split.session)}`}
            </T>
          </View>
        ) : top ? (
          <T style={s.rowKicker} numberOfLines={stacked ? undefined : 1} maxFontSizeMultiplier={textCap.section}>
            {top}
          </T>
        ) : null}
        <SermonTitle list title={title ?? headline(sermon)} numberOfLines={stacked ? 0 : 2} />
        <T style={s.rowMeta} numberOfLines={stacked ? undefined : 1}>
          {sermonMeta(sermon)}
        </T>
        {detail ? <T style={s.rowDetail}>{detail}</T> : null}
      </View>
    </Tap>
  );
});

/**
 * A sermon as a card in a horizontal rail: artwork above, then the headline
 * and a line under it (the event line by default).
 */
export const SermonCard = memo(function SermonCard({
  sermon,
  width,
  detail,
  testID = "sermon-card",
}: {
  sermon: Sermon;
  width: number;
  /** The line under the headline; the event line by default. */
  detail?: string;
  testID?: string;
}) {
  const go = useGo();
  const meta = detail ?? eventLine(sermon);
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={sermonLabel(sermon)}
      onPress={() =>
        go.push({ pathname: "/sermon/[id]", params: { id: sermon.id } })
      }
      // In a sideways rail: as for rows, a swipe's first touch doesn't press.
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={[s.card, { width }]}
    >
      <Artwork
        art={sermon}
        width={width}
        chip={sermon.duration || null}
        fallback={sermon.collection}
        priority="low"
      />
      <View style={{ gap: 3 }}>
        <SermonTitle list title={headline(sermon)} />
        <T style={s.rowMeta} numberOfLines={2}>
          {meta ? `${meta} · ` : ""}
          {nowrap(sermon.date)}
        </T>
      </View>
    </Tap>
  );
});

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
    gap: space.md,
    minHeight: 56,
    marginBottom: space.xs,
  },
  headerTitle: {
    ...type.buttonLarge,
    color: c.text,
  },
  roundBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    boxShadow: "0 1px 2px rgba(27,30,36,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  wordmarkLine: {
    width: 4,
    height: 22,
    backgroundColor: c.accent,
    borderRadius: 2,
  },
  // The wordmark is a lockup (the welcome's), not a step on the type scale.
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
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonCompact: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 8,
    alignSelf: "flex-start",
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
    ...type.buttonLarge,
    textAlign: "center",
    flexShrink: 1,
  },
  buttonTextCompact: {
    ...type.button,
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
    marginTop: space.md,
    marginBottom: space.sm,
  },
  pageKicker: { ...type.overline, color: c.gold, marginBottom: 6 },
  pageTitle: { ...type.title, color: c.text },
  pageLead: { marginTop: space.md },
  italic: { fontFamily: font.serifItalic },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: space.md,
    marginTop: space.section,
    marginBottom: space.md,
  },
  sectionTitle: { ...type.section, color: c.text, flexShrink: 1 },
  // The text button is 48pt tall; pulled back so its label shares the
  // title's baseline instead of pushing the row taller.
  sectionAction: { marginVertical: -14 },
  lead: { ...type.lead, color: c.muted },
  body: { ...type.body, color: c.muted },
  meta: { ...type.caption, color: c.muted },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingTop: 1,
  },
  // Sand, so it reads as a label (not a button) on ivory and white alike.
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: c.feature,
  },
  badgeText: { ...type.overline, color: c.mutedOnFeature },
  state: {
    marginTop: space.lg,
    padding: 22,
    borderRadius: radius.r22,
    backgroundColor: c.surface,
    boxShadow: shadows.card,
  },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.feature,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  stateTitle: { ...type.sectionSmall, color: c.text },
  stateBody: { ...type.body, color: c.muted, marginTop: 6 },
  stateExtra: { marginTop: 14 },
  stateActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    marginTop: 18,
  },
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
    ...type.metaSmall,
    color: c.onMedia,
    ...tabular,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    minHeight: 72,
    // 4pt more between rows in every list, without each list changing its gap.
    paddingVertical: 2,
  },
  rowStacked: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  rowBody: { flex: 1, minWidth: 0, gap: 3, alignSelf: "stretch", justifyContent: "center" },
  // One line, tracked a little tighter than other eyebrows so an event's
  // name fits beside the artwork.
  rowKicker: { ...type.overline, letterSpacing: 0.4, color: c.gold },
  rowKickerLine: { flexDirection: "row", minWidth: 0 },
  // The event shortens first; the session never does, unless it alone is too wide.
  rowKickerLead: { flexShrink: 1, minWidth: 0 },
  rowKickerSession: { flexShrink: 0, maxWidth: "100%" },
  rowMeta: { ...type.meta, color: c.muted, ...tabular },
  rowDetail: { ...type.meta, fontFamily: font.bold, color: c.accent, ...tabular },
  /** A sermon's title in any list (SermonTitle `list`). */
  listTitle: { ...type.cardTitle, color: c.text },
  // Kept for older callers; rows now use listTitle.
  rowTitle: { ...type.cardTitle, color: c.text },
  card: { gap: 10, paddingVertical: space.xs },
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

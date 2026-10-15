import { Stack, router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../auth/AccountProvider";
import { peekPendingIntent, readPendingIntent, setPendingIntent } from "../auth/intent";
import {
  SwitchLine,
  TestModeNotice,
  UNAVAILABLE_LEAD,
  UNAVAILABLE_TITLE,
} from "../auth/screens/shared";
import {
  FlowButton,
  FormAlert,
  LegalNote,
  ProviderButtons,
  afterAuthParam,
  useAuthTask,
} from "../auth/ui";
import { eventLine, headline } from "../data/display";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import type { Sermon } from "../data/sermons";
import { Artwork, CardFan, ItalicTitle, spokenText } from "../kit";
import { minutesPerDayLabel, usePath } from "../learning";
import { useReducedMotion } from "../motion";
import { firstParam, useGo, usePageTitle } from "../navigation";
import { motion } from "../onboarding/parts";
import { easeOut, radius, space, type } from "../theme";
import {
  RoundBack,
  SermonTitle,
  T,
  c,
  noWebOutline,
  returnFocus,
  s,
  web,
} from "../ui";

type Reason = "watch" | "save" | "path" | "account";
type Mode = "sign-up" | "sign-in";

const headlines: Record<Reason, string> = {
  watch: "Create a free account to watch",
  save: "Create a free account to save sermons",
  path: "Create a free account to start this path",
  account: "Create your free account",
};

/** Each headline's phrase in italic, as the app's serif titles set it. */
const italics: Record<Reason, string> = {
  watch: "watch",
  save: "save sermons",
  path: "start this path",
  account: "free account",
};

// The headline already says it's free and what was tapped; the lead adds
// what else an account does, without repeating either.
function leadFor(mode: Mode, reason: Reason, guestsWatch: boolean) {
  if (mode === "sign-in")
    return guestsWatch
      ? "Sign in to save sermons and keep your topics."
      : "Sign in to watch, save sermons and keep your topics.";
  if (reason === "watch") return "You can also save sermons and keep your topics on any device.";
  if (reason === "save") return "Your saved sermons and topics stay with you on any device.";
  if (reason === "path") return "Day 1 plays as soon as you’re in, and your progress stays with you on any device.";
  return guestsWatch
    ? "Save sermons and keep your topics on any device."
    : "Watch every sermon in full, save sermons and keep your topics on any device.";
}

// Close button row above the scrolling part.
const TOP_ROW = 48;
// Above the Close row: as much as the sides on the web; on iOS a little
// more, clear of the sheet's grabber.
const SHEET_TOP = Platform.OS === "web" ? space.lg : space.xl;
// Page left visible above the sheet: the native sheet's own gap below the
// status bar, or on the web a strip of the page, so it reads as a sheet.
const SHEET_GAP = Platform.OS === "web" ? 56 : 40;
// Wide browser windows get a centred dialog instead of a bottom sheet.
const DIALOG_WIDTH = 768;

/**
 * The sign-up sheet. It opens over whatever was tapped (Watch, Save, or
 * Account), names the sermon when there is one, and carries on with it
 * once there's an account. Sized to its content so the iOS sheet can fit
 * it; past the room on screen (large text, small phones) the body scrolls
 * under a fixed Close. On the web, where the stack has no native sheet,
 * it draws its own over a scrim.
 */
export default function Join() {
  const params = useLocalSearchParams<{
    reason?: string;
    mode?: string;
    sermon?: string;
    next?: string;
    /** The pending intent this sheet was opened for (see auth/intent). */
    intent?: string;
  }>();
  const account = useAccount();
  const go = useGo();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const task = useAuthTask();
  const requested = firstParam(params.reason);
  const reason: Reason =
    requested === "watch" || requested === "save" || requested === "path" ? requested : "account";
  const mode: Mode = firstParam(params.mode) === "sign-in" ? "sign-in" : "sign-up";
  const next = afterAuthParam(params.next);
  const busy = task.busy !== null;
  const sermonParam = firstParam(params.sermon);
  const intentId = firstParam(params.intent);
  const catalogue = useCatalogue();
  const findSermon = (id?: string) => catalogue.find(id) ?? null;
  // Read once, so the sermon stays put while the sheet closes after its
  // intent has been carried out.
  const [sermon, setSermon] = useState<Sermon | null>(() =>
    findSermon(sermonParam ?? peekPendingIntent(intentId)?.sermonId),
  );
  // Starting a path: the sheet names the path rather than its first sermon.
  const [pathId, setPathId] = useState<string | null>(() => pathOf(peekPendingIntent(intentId)));
  useEffect(() => {
    // Opened for something else (Account, Saved): an intent left behind by
    // an abandoned attempt isn't this sign-in's to carry out.
    if (!intentId) {
      setPendingIntent(null);
      return;
    }
    // After a web reload the intent is only in storage.
    if (sermonParam) return;
    let active = true;
    readPendingIntent(intentId).then((intent) => {
      if (!active || !intent) return;
      setSermon((current) => current ?? catalogue.find(intent.sermonId) ?? null);
      setPathId((current) => current ?? pathOf(intent));
    });
    return () => {
      active = false;
    };
  }, [intentId, sermonParam, catalogue]);

  // Closing without an account (Close, the scrim, a swipe down) drops what was
  // tapped, so it can't run after some later, unrelated sign-in. Closed while
  // a sign-in is finishing, it's kept: that sign-in carries it out.
  const signedIn = useRef(!!account.user);
  const working = useRef(busy);
  useEffect(() => {
    signedIn.current = !!account.user;
    working.current = busy;
  }, [account.user, busy]);
  useEffect(() => {
    const state = { open: true };
    return () => {
      state.open = false;
      // Deferred, so a development remount isn't mistaken for a close.
      setTimeout(() => {
        if (!state.open && !signedIn.current && !working.current) setPendingIntent(null);
      }, 0);
    };
  }, [signedIn, working]);

  function close() {
    // A sign-in in flight finishes or fails first.
    if (busy) return;
    setPendingIntent(null);
    go.back();
  }

  function switchMode(to: Mode) {
    task.setError(null);
    router.setParams({ mode: to });
  }

  const unavailable = account.mode === "unavailable";
  usePageTitle(
    unavailable ? UNAVAILABLE_TITLE : mode === "sign-in" ? "Sign in" : headlines[reason],
  );
  const bottom = Math.max(insets.bottom, space.lg);
  // The Close row grows with the sermon's title at large text sizes.
  const [topRow, setTopRow] = useState(TOP_ROW);
  // What's left for the scrolling part once the gap above the sheet, its
  // top padding, the Close row and the bottom inset are taken.
  const room = Math.max(
    TOP_ROW * 3,
    height - insets.top - SHEET_GAP - SHEET_TOP - topRow - bottom,
  );

  const body = unavailable ? (
    <>
      <Intro title={UNAVAILABLE_TITLE} lead={UNAVAILABLE_LEAD} />
      <View style={styles.actions}>
        <FlowButton label="Close" testID="join-unavailable-close" onPress={close} />
      </View>
    </>
  ) : (
    <>
      <Intro
        title={mode === "sign-in" ? "Welcome back" : headlines[reason]}
        italic={mode === "sign-in" ? null : italics[reason]}
        lead={leadFor(mode, reason, account.guestWatch === "all")}
      />

      <View style={styles.actions}>
        <ProviderButtons next={next} mode={mode} task={task} />
        <FormAlert message={task.error} />
      </View>

      {mode === "sign-up" && (
        <View style={styles.legal}>
          <LegalNote />
        </View>
      )}

      <View style={styles.tertiary}>
        {mode === "sign-up" ? (
          <SwitchLine
            prompt="Already have an account?"
            label="Sign in"
            testID="join-switch"
            disabled={busy}
            onPress={() => switchMode("sign-in")}
          />
        ) : (
          <SwitchLine
            prompt="New here?"
            label="Create free account"
            testID="join-switch"
            disabled={busy}
            onPress={() => switchMode("sign-up")}
          />
        )}
      </View>

      <View style={styles.notice}>
        <TestModeNotice />
      </View>
    </>
  );

  const sheet = (
    <View style={[styles.sheet, { paddingBottom: bottom }]}>
      {/* No swiping the sheet away while Apple or Google is finishing. */}
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <View
        style={styles.column}
        onLayout={(event) => setTopRow(Math.ceil(event.nativeEvent.layout.height))}
      >
        <View style={styles.top}>
          {unavailable ? (
            <View style={{ flex: 1 }} />
          ) : pathId && reason === "path" ? (
            <PathContext id={pathId} />
          ) : sermon ? (
            <Context sermon={sermon} />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <RoundBack close testID="join-close" onPress={close} />
        </View>
      </View>
      {Platform.OS === "web" ? (
        <ScrollView
          style={[styles.scroll, { maxHeight: room }]}
          contentContainerStyle={styles.column}
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        // iOS sizes the sheet to this content (fitToContents) and mismeasures
        // a nested ScrollView, drawing it over the Close row. Past the room on
        // screen the native sheet itself scrolls.
        <View style={styles.column}>{body}</View>
      )}
    </View>
  );

  if (Platform.OS !== "web") return sheet;
  return (
    <WebSheet onDismiss={close} dialog={width >= DIALOG_WIDTH}>
      {sheet}
    </WebSheet>
  );
}

function Intro({ title, italic, lead }: { title: string; italic?: string | null; lead: string }) {
  return (
    <View style={styles.intro}>
      <ItalicTitle
        text={title}
        italic={italic}
        accessibilityRole="header"
        {...web({ "aria-level": 1 })}
        nativeID="join-title"
        style={styles.headline}
        maxFontSizeMultiplier={1.5}
      />
      <T style={styles.lead}>{lead}</T>
    </View>
  );
}

function pathOf(intent: ReturnType<typeof peekPendingIntent>) {
  return intent?.kind === "watch" && intent.path ? intent.path.id : null;
}

/** The path being started: a small fan of its first days, its name and its pace. */
function PathContext({ id }: { id: string }) {
  const { path, days } = usePath(id);
  if (!path) return <View style={{ flex: 1 }} />;
  const total = days.length || path.dayCount;
  const meta = `${total} days · ${minutesPerDayLabel(path)}`;
  const fan = days.slice(0, 2).map((d) => d.sermon ?? { id: d.youtubeId });
  return (
    <View
      style={styles.context}
      accessible={Platform.OS !== "web"}
      accessibilityLabel={`${path.name}. ${spokenText(meta.replace(" · ", ". "))}`}
    >
      <CardFan sermons={fan} size="compact" />
      <View style={styles.contextText}>
        <ItalicTitle text={path.name} italic={path.italic} numberOfLines={2} style={styles.pathName} />
        <T style={s.meta}>{meta}</T>
      </View>
    </View>
  );
}

/** What was tapped, so the sheet reads as a step on the way to it. */
function Context({ sermon }: { sermon: Sermon }) {
  const title = headline(sermon);
  const event = eventLine(sermon);
  return (
    <View
      style={styles.context}
      // One stop for VoiceOver and TalkBack; on the web the text reads in order.
      accessible={Platform.OS !== "web"}
      accessibilityLabel={`${title}. ${event}`}
    >
      <Artwork art={sermon} width={96} radius={10} fallback={sermon.collection} />
      <View style={styles.contextText}>
        <SermonTitle list title={title} />
        <T style={s.meta}>{event}</T>
      </View>
    </View>
  );
}

/**
 * The web's stand-in for the native sheet: a scrim that closes it, the
 * sheet rising from the bottom edge (a centred dialog on wide windows), and
 * a modal dialog to the keyboard and assistive tech. While it's in front,
 * the page behind is inert, Tab cycles through the sheet's own controls and
 * Escape closes it; once closed, focus goes back to what opened it.
 */
function WebSheet({
  children,
  onDismiss,
  dialog,
}: {
  children: ReactNode;
  onDismiss: () => void;
  dialog: boolean;
}) {
  const live = useReducedMotion();
  const [reduced] = useState(live);
  const backdrop = useRef<View>(null);
  const panel = useRef<View>(null);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });
  // Watch, Save or Sign in, still focused as the sheet first renders.
  const [opener] = useState(() => document.activeElement);
  // The control used last inside the sheet, for coming back to it from a
  // step it opened (the email form, Terms).
  const last = useRef<HTMLElement | null>(null);
  // Another screen pushed from the sheet comes to the front over it; only
  // the screen in front holds focus.
  const focused = useIsFocused();

  useEffect(() => {
    const root = backdrop.current as unknown as HTMLElement | null;
    const box = panel.current as unknown as HTMLElement | null;
    if (!focused || !root || !box) return;
    const silenced = silenceOutside(root);
    const resume = last.current;
    // First time, the dialog itself, so its name is read out.
    (resume?.isConnected && box.contains(resume) ? resume : box).focus();
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target !== box && box.contains(target))
        last.current = target;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss.current();
      else if (event.key === "Tab") keepFocusIn(box, event);
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("keydown", onKey);
      for (const node of silenced) node.inert = false;
    };
  }, [focused]);

  useEffect(() => () => returnFocus(opener), [opener]);

  return (
    <View ref={backdrop} style={[styles.backdrop, dialog && styles.backdropDialog]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.scrim,
          {
            animationName: motion.fade,
            animationDuration: 200,
            animationTimingFunction: easeOut,
            animationFillMode: "backwards",
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessible={false}
          focusable={false}
          {...web({ "aria-hidden": true, tabIndex: -1 })}
        />
      </Animated.View>
      <Animated.View
        ref={panel}
        style={[
          styles.panel,
          dialog ? styles.panelDialog : styles.panelSheet,
          // Focus lands on the panel itself; it isn't a control to outline.
          noWebOutline as ViewStyle | null,
          {
            animationName: reduced ? motion.fade : motion.sheet,
            animationDuration: reduced ? 200 : 280,
            animationTimingFunction: easeOut,
            animationFillMode: "backwards",
          },
        ]}
        {...web({
          role: "dialog",
          "aria-modal": true,
          "aria-labelledby": "join-title",
          tabIndex: -1,
        })}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/**
 * Makes everything on the page outside `root` inert (the screen underneath,
 * the tab bar, the docked player): it can't be focused, clicked or read out
 * while the sheet is open. Returns what it changed, to undo exactly that.
 */
function silenceOutside(root: HTMLElement) {
  const silenced: HTMLElement[] = [];
  let node = root;
  while (node !== document.body && node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      if (sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE") continue;
      sibling.inert = true;
      silenced.push(sibling);
    }
    node = node.parentElement;
  }
  return silenced;
}

const TAB_STOPS = "a[href], button, input, select, textarea, [tabindex]";

/** Tab from the last control returns to the first, Shift+Tab the other way. */
function keepFocusIn(box: HTMLElement, event: KeyboardEvent) {
  const stops = Array.from(box.querySelectorAll<HTMLElement>(TAB_STOPS)).filter(
    (node) =>
      node.tabIndex >= 0 &&
      !node.hasAttribute("disabled") &&
      node.getClientRects().length > 0,
  );
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && active !== box && box.contains(active);
  const first = stops[0];
  const end = stops[stops.length - 1];
  if (!first) {
    event.preventDefault();
    box.focus();
  } else if (event.shiftKey ? !inside || active === first : !inside || active === end) {
    event.preventDefault();
    (event.shiftKey ? end : first).focus();
  }
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: c.raised, paddingTop: SHEET_TOP },
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: space.gutter,
  },
  // Sized to its content up to the room given, then it scrolls.
  scroll: { flexGrow: 0, flexShrink: 1 },
  // The close button's icon lines up with the text edge, not its touch area.
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: TOP_ROW,
  },
  context: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md },
  contextText: { flex: 1, gap: 2 },
  pathName: { ...type.prose, lineHeight: 21, letterSpacing: -0.2 },
  intro: { gap: space.sm, marginTop: space.lg },
  headline: type.question,
  lead: { ...type.lead, color: c.muted },
  actions: { gap: space.md, marginTop: space.xl },
  legal: { marginTop: space.lg },
  tertiary: { marginTop: space.md },
  notice: { marginTop: space.sm },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  backdropDialog: { justifyContent: "center", alignItems: "center", padding: space.xl },
  // A lighter dim than c.scrim (which sits behind small labels): the page
  // should stay recognisable behind the sheet.
  scrim: { backgroundColor: `${c.media}5c` },
  panel: { backgroundColor: c.raised, overflow: "hidden" },
  panelSheet: {
    width: "100%",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    boxShadow: "0 -8px 24px rgba(27, 30, 36, 0.10)",
  },
  panelDialog: {
    width: "100%",
    maxWidth: 480,
    borderRadius: radius.xl,
    boxShadow: "0 8px 24px rgba(27, 30, 36, 0.10)",
  },
});

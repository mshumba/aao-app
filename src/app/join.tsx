import { router, useLocalSearchParams } from "expo-router";
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
import { Sermon, sermons } from "../data/sermons";
import { useReducedMotion } from "../motion";
import { firstParam, useGo } from "../navigation";
import { motion } from "../onboarding/parts";
import { easeOut, font, radius, space, type } from "../theme";
import {
  Heading,
  IconButton,
  SermonTitle,
  T,
  TextButton,
  Thumbnail,
  c,
  moveFocus,
  noWebOutline,
  s,
  web,
} from "../ui";

type Reason = "watch" | "save" | "account";
type Mode = "sign-up" | "sign-in";

const headlines: Record<Reason, string> = {
  watch: "Create a free account to watch",
  save: "Create a free account to save sermons",
  account: "Create your free account",
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
  return guestsWatch
    ? "Save sermons and keep your topics on any device."
    : "Watch every message, save sermons and keep your topics on any device.";
}

// Close button row above the scrolling part.
const TOP_ROW = 48;
// Page left visible above the sheet: the native sheet's own gap below the
// status bar, or on the web a strip of the page, so it reads as a sheet.
const SHEET_GAP = Platform.OS === "web" ? 56 : 40;
// Wide browser windows get a centred dialog instead of a bottom sheet.
const DIALOG_WIDTH = 768;

const findSermon = (id?: string) => sermons.find((item) => item.id === id) ?? null;

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
  }>();
  const account = useAccount();
  const go = useGo();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const task = useAuthTask();
  const requested = firstParam(params.reason);
  const reason: Reason =
    requested === "watch" || requested === "save" ? requested : "account";
  const mode: Mode = firstParam(params.mode) === "sign-in" ? "sign-in" : "sign-up";
  const next = afterAuthParam(params.next);
  const busy = task.busy !== null;
  const sermonParam = firstParam(params.sermon);
  // Read once, so the sermon stays put while the sheet closes after its
  // intent has been carried out.
  const [sermon, setSermon] = useState<Sermon | null>(() =>
    findSermon(sermonParam ?? peekPendingIntent()?.sermonId),
  );
  // After a web reload the intent is only in storage.
  useEffect(() => {
    if (sermonParam) return;
    let active = true;
    readPendingIntent().then((intent) => {
      if (active && intent) setSermon((current) => current ?? findSermon(intent.sermonId));
    });
    return () => {
      active = false;
    };
  }, [sermonParam]);

  // Closing without an account (Not now, Close, a swipe down) drops what was
  // tapped, so it can't run after some later, unrelated sign-in.
  const signedIn = useRef(!!account.user);
  useEffect(() => {
    signedIn.current = !!account.user;
  }, [account.user]);
  useEffect(() => {
    const state = { open: true };
    return () => {
      state.open = false;
      // Deferred, so a development remount isn't mistaken for a close.
      setTimeout(() => {
        if (!state.open && !signedIn.current) setPendingIntent(null);
      }, 0);
    };
  }, [signedIn]);

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
  const bottom = Math.max(insets.bottom, space.lg);
  // The Close row grows with the sermon's title at large text sizes.
  const [topRow, setTopRow] = useState(TOP_ROW);
  // What's left for the scrolling part once the gap above the sheet, its
  // top padding, the Close row and the bottom inset are taken.
  const room = Math.max(
    TOP_ROW * 3,
    height - insets.top - SHEET_GAP - space.sm - topRow - bottom,
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
            label="Create a free account"
            testID="join-switch"
            disabled={busy}
            onPress={() => switchMode("sign-up")}
          />
        )}
        <TextButton label="Not now" testID="join-not-now" disabled={busy} onPress={close} />
      </View>

      <View style={styles.notice}>
        <TestModeNotice />
      </View>
    </>
  );

  const sheet = (
    <View style={[styles.sheet, { paddingBottom: bottom }]}>
      <View
        style={styles.column}
        onLayout={(event) => setTopRow(Math.ceil(event.nativeEvent.layout.height))}
      >
        <View style={styles.top}>
          {sermon && !unavailable ? (
            <Context sermon={sermon} />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <IconButton name="close" label="Close" testID="join-close" onPress={close} />
        </View>
      </View>
      <ScrollView
        style={[styles.scroll, { maxHeight: room }]}
        contentContainerStyle={styles.column}
        alwaysBounceVertical={false}
        keyboardShouldPersistTaps="handled"
      >
        {body}
      </ScrollView>
    </View>
  );

  if (Platform.OS !== "web") return sheet;
  return (
    <WebSheet onDismiss={close} dialog={width >= DIALOG_WIDTH}>
      {sheet}
    </WebSheet>
  );
}

function Intro({ title, lead }: { title: string; lead: string }) {
  return (
    <View style={styles.intro}>
      <Heading
        level={1}
        nativeID="join-title"
        style={styles.headline}
        maxFontSizeMultiplier={1.5}
      >
        {title}
      </Heading>
      <T style={styles.lead}>{lead}</T>
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
      <Thumbnail sermon={sermon} compact style={styles.thumb} />
      <View style={styles.contextText}>
        <SermonTitle title={title} numberOfLines={2} style={styles.contextTitle} />
        <T style={s.meta}>{event}</T>
      </View>
    </View>
  );
}

/**
 * The web's stand-in for the native sheet: a scrim that closes it, the
 * sheet rising from the bottom edge (a centred dialog on wide windows), a
 * modal dialog to assistive tech, focus moved into it, and Escape to close.
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
  const panel = useRef<View>(null);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    moveFocus(panel.current);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <View style={[styles.backdrop, dialog && styles.backdropDialog]}>
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

const styles = StyleSheet.create({
  sheet: { backgroundColor: c.raised, paddingTop: space.sm },
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: space.xl,
  },
  // Sized to its content up to the room given, then it scrolls.
  scroll: { flexGrow: 0, flexShrink: 1 },
  // The close button's icon lines up with the text edge, not its touch area.
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: TOP_ROW,
    marginEnd: -space.md,
  },
  context: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md },
  thumb: { width: 96, borderRadius: radius.sm },
  contextText: { flex: 1, gap: 2 },
  contextTitle: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
  intro: { gap: space.sm, marginTop: space.lg },
  headline: { ...type.question, fontSize: 28, lineHeight: 33 },
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

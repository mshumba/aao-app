import {
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import {
  Linking,
  Platform,
  ScrollView as NativeScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useAccount } from "../../auth/AccountProvider";
import { useGate } from "../../auth/gate";
import { eventLine, headline } from "../../data/display";
import { Sermon, sermonCategoryIds, sermons } from "../../data/sermons";
import { HEADER_HEIGHT, fullFrame } from "../../player/layout";
import { NowPlaying } from "../../player/NowPlaying";
import { usePlayerSession } from "../../player/PlayerProvider";
import { canRetry, canWatchOnYouTube, playerError } from "../../player/types";
import { useDockInset } from "../../player/useDockInset";
import { exitTo, firstParam } from "../../navigation";
import { shareSermon } from "../../share";
import { font, radius, space, type } from "../../theme";
import { useToast } from "../../toast";
import { TopicNotice, TopicTags } from "../../topics";
import {
  Badge,
  Header,
  Icon,
  type IconName,
  Notice,
  Page,
  SectionHeading,
  SermonRow,
  SermonTitle,
  StatePanel,
  T,
  Tap,
  TextButton,
  Thumbnail,
  c,
  dockScrollPadding,
  moveFocus,
  nowrap,
  s,
  useNarrow,
  web,
} from "../../ui";

export default function SermonScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = firstParam(params.id);
  const sermon = sermons.find((x) => x.id === id);
  if (!sermon)
    return (
      <Page>
        <Header back />
        <StatePanel
          level={1}
          icon="videocam-off-outline"
          title="This sermon isn’t available"
          body="The link may be out of date. Choose another sermon from the library."
          label="Browse sermons"
          action={() => exitTo("/")}
        />
      </Page>
    );
  return <NowPlayingScreen key={sermon.id} sermon={sermon} />;
}

type Transition = { data?: { closing?: boolean } };

/**
 * Tells the app-wide player this screen can show it full size, once the push
 * has settled, so the video doesn't jump ahead of the sliding screen. When the
 * screen starts to leave (including an iOS swipe-back, which only blurs it
 * once the gesture completes) the player docks, and a cancelled swipe brings
 * it back.
 */
function useStage(id: string) {
  const { setStage, setDockAboveTabs } = usePlayerSession();
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      let leaving = false;
      const show = () => {
        leaving = false;
        setDockAboveTabs(false);
        setStage(() => id);
      };
      const hide = () => setStage((current) => (current === id ? null : current));
      const listen = (event: string, handler: (e: Transition) => void) =>
        navigation.addListener(event as never, handler as never);
      const unsubscribe = [
        listen("transitionEnd", (e) => {
          if (!e.data?.closing) show();
        }),
        listen("transitionStart", (e) => {
          if (!e.data?.closing) return;
          leaving = true;
          // Returning to the tabs: dock above the tab bar from the start.
          const state = navigation.getState();
          const below = state?.routes[state.index - 1];
          setDockAboveTabs(below?.name === "(tabs)");
          hide();
        }),
        listen("gestureCancel", show),
      ];
      const fallback = setTimeout(() => {
        if (!leaving) show();
      }, Platform.OS === "web" ? 0 : 450);
      return () => {
        unsubscribe.forEach((remove) => remove());
        clearTimeout(fallback);
        hide();
        setDockAboveTabs(false);
      };
    }, [id, navigation, setStage, setDockAboveTabs]),
  );
}

function NowPlayingScreen({ sermon }: { sermon: Sermon }) {
  const session = usePlayerSession();
  const account = useAccount();
  const gate = useGate();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const narrow = useNarrow();
  const dock = useDockInset();
  const scroll = useRef<NativeScrollView>(null);
  // Watch's button is replaced by the player, so focus moves to its controls.
  const [watched, setWatched] = useState(false);
  useStage(sermon.id);
  const frame = fullFrame(window, insets);
  const current = session.sermon?.id === sermon.id;
  const failed = current && session.phase === "error";
  const pinned = current && !failed;
  // Where the scrolling column starts, to line the poster up with the video.
  const contentLeft = (window.width - Math.min(window.width, 760)) / 2 + space.gutter;
  const topics = sermonCategoryIds(sermon);
  // Sermons sharing a topic come first, then the rest in catalogue order.
  const more = sermons
    .filter((x) => x.id !== sermon.id)
    .map((x, index) => ({
      x,
      index,
      shared: sermonCategoryIds(x).filter((t) => topics.includes(t)).length,
    }))
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .slice(0, 3)
    .map(({ x }) => x);

  return (
    // Plain ivory like every other page; the artwork carries the colour.
    <View style={styles.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.page, styles.header]}>
          <Header back />
          {Platform.OS === "web" && current && !failed && <SkipToPlayer />}
        </View>

        {/* Fixed slot the app-wide player fills while this sermon plays.
            Otherwise the poster (or the error) scrolls with the page, which
            leaves room for the page when another sermon is docked. */}
        {pinned && (
          <View
            style={{
              marginLeft: frame.left,
              width: frame.width,
              height: frame.height,
            }}
          >
            <View
              style={[styles.slot, { borderRadius: frame.radius }]}
              testID="player-slot"
            />
          </View>
        )}

        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          style={dockScrollPadding(dock)}
          contentContainerStyle={[
            s.page,
            { paddingBottom: 48 + insets.bottom + dock },
          ]}
        >
          {!pinned && (
            <View
              style={{
                marginLeft: frame.left - contentLeft,
                width: frame.width,
              }}
            >
              {failed ? (
                <PlayerErrorSlot height={frame.height} radius={frame.radius} />
              ) : (
                <Poster
                  sermon={sermon}
                  height={frame.height}
                  radius={frame.radius}
                  // A guest is asked for a free account first; the sermon
                  // starts once they have one.
                  hint={
                    gate.canWatch(sermon.id)
                      ? undefined
                      : "Asks you to create a free account first"
                  }
                  onWatch={() => {
                    if (!gate.require({ kind: "watch", sermonId: sermon.id }))
                      return;
                    setWatched(true);
                    session.load(sermon);
                  }}
                />
              )}
            </View>
          )}

          <View style={styles.identity}>
            {/* Why a guest can watch this one. */}
            {!account.user &&
              account.guestWatch === "shared" &&
              account.hasPass(sermon.id) && (
                <View style={styles.shared}>
                  <Badge>Shared with you</Badge>
                </View>
              )}
            <SermonTitle
              title={headline(sermon)}
              accessibilityRole="header"
              {...web({ "aria-level": 1 })}
              style={[styles.title, narrow && styles.titleNarrow]}
              maxFontSizeMultiplier={2.5}
            />
            <T style={styles.event}>
              {eventLine(sermon)} · {nowrap(sermon.date)}
            </T>
            <T style={styles.meta}>
              {sermon.channel} · {nowrap(sermon.duration)}
            </T>
          </View>

          <SermonActions sermon={sermon} />

          {current && <NowPlaying focusTransport={watched} scroll={scroll} />}

          {/* The exact title as published, kept with its source. */}
          <View style={styles.source}>
            <T style={styles.sourceLabel}>On YouTube</T>
            <SermonTitle title={sermon.title} style={styles.sourceTitle} />
            <TextButton
              label="Open in YouTube"
              icon="open-outline"
              align="start"
              onPress={() =>
                current
                  ? session.watchOnYouTube()
                  : Linking.openURL(sermon.source).catch(() => {})
              }
            />
            <Notice icon="logo-youtube">
              Plays through YouTube. Loading the player connects to Google,
              which may set cookies.
            </Notice>
          </View>

          {topics.length > 0 && (
            <>
              <SectionHeading>Topics</SectionHeading>
              <View style={{ gap: space.md }}>
                <TopicNotice />
                <TopicTags ids={topics} />
              </View>
            </>
          )}

          <SectionHeading>More sermons</SectionHeading>
          <View style={{ gap: space.sm }}>
            {more.map((item) => (
              <SermonRow key={item.id} sermon={item} />
            ))}
          </View>
          <View style={{ marginTop: space.md }}>
            <TextButton
              label="Browse all sermons"
              icon="chevron-forward"
              onPress={() => exitTo("/")}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/**
 * Save and Share, under the sermon's title. Saving asks a guest for a free
 * account first, then saves once they have one (the gate carries it out).
 * Builds without an account service leave Save out.
 */
function SermonActions({ sermon }: { sermon: Sermon }) {
  const account = useAccount();
  const gate = useGate();
  const toast = useToast();
  // One save request and one share sheet at a time, so a double tap can't
  // undo itself or open a second sheet.
  const saving = useRef(false);
  const sharing = useRef(false);
  const saved = account.isSaved(sermon.id);

  const toggleSave = async () => {
    if (saving.current) return;
    if (!gate.require({ kind: "save", sermonId: sermon.id })) return;
    saving.current = true;
    const next = !saved;
    // With the optimistic change, so the tap and the new state land together.
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await account.setSaved(sermon.id, next);
      toast(
        next ? "Saved to your library" : "Removed from saved",
        next ? "bookmark" : "bookmark-outline",
      );
    } catch {
      toast(
        next
          ? "Couldn’t save. Check your connection."
          : "Couldn’t remove it. Check your connection.",
        "alert-circle-outline",
      );
    } finally {
      saving.current = false;
    }
  };

  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    await shareSermon(sermon, toast);
    sharing.current = false;
  };

  return (
    <View style={styles.actions}>
      {account.mode !== "unavailable" && (
        <ActionPill
          testID="save-sermon"
          label={saved ? "Saved" : "Save"}
          icon={saved ? "bookmark" : "bookmark-outline"}
          selected={saved}
          hint={account.user ? undefined : "Asks you to create a free account first"}
          onPress={toggleSave}
        />
      )}
      <ActionPill
        testID="share-sermon"
        label="Share"
        // Each platform's own share glyph.
        icon={Platform.OS === "android" ? "share-social-outline" : "share-outline"}
        onPress={share}
      />
    </View>
  );
}

/** A compact action under the title. `selected` makes it a toggle. */
function ActionPill({
  label,
  icon,
  selected,
  hint,
  testID,
  onPress,
}: {
  label: string;
  icon: IconName;
  selected?: boolean;
  hint?: string;
  testID?: string;
  onPress: () => void;
}) {
  const toggle = selected !== undefined;
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={toggle ? { selected } : undefined}
      {...(toggle ? web({ "aria-pressed": selected }) : null)}
      onPress={onPress}
      style={[styles.action, selected && styles.actionSelected]}
    >
      <Icon name={icon} size={20} color={selected ? c.accent : c.text} />
      <T style={[styles.actionLabel, selected && { color: c.accent }]}>
        {label}
      </T>
    </Tap>
  );
}

/**
 * The video player comes last in keyboard order, since it floats above every
 * screen. This link, shown when focused, jumps straight to it.
 */
function SkipToPlayer() {
  const { focusPlayer } = usePlayerSession();
  const [focused, setFocused] = useState(false);
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Go to video player"
      onPress={focusPlayer}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      feedback="dim"
      style={[styles.skipLink, !focused && styles.offscreen]}
    >
      <T style={styles.skipLinkText}>Go to video player</T>
    </Tap>
  );
}

/**
 * A failed player, shown where the video was: what happened and what can
 * still be done. Only actions that can work are offered. It grows with the
 * text, since it scrolls with the page.
 */
function PlayerErrorSlot({
  height,
  radius: corner,
}: {
  height: number;
  radius: number;
}) {
  const session = usePlayerSession();
  const focused = useIsFocused();
  const primary = useRef<View>(null);
  const message = useRef<View>(null);
  const code = session.error ?? 0;
  // The failure removed the focused Play button or the player itself. Carry
  // focus to the way forward rather than leaving it on the page.
  useEffect(() => {
    if (Platform.OS !== "web" || !focused) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    moveFocus(primary.current ?? message.current);
    // Only when the slot first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const retry = canRetry(code);
  return (
    <View
      style={[styles.errorSlot, { minHeight: height, borderRadius: corner }]}
      testID="player-error"
    >
      <View
        ref={message}
        style={styles.errorMessage}
        {...web({ tabIndex: -1 })}
      >
        <Icon name="alert-circle-outline" color={c.error} size={20} />
        {/* Native announces the error once; on web the message is an alert. */}
        <T
          nativeID="player-error-message"
          style={styles.errorText}
          accessibilityRole={Platform.OS === "web" ? "alert" : undefined}
        >
          {playerError(code)}
        </T>
      </View>
      <View style={styles.errorActions}>
        {retry && (
          <SlotButton
            ref={primary}
            label="Try again"
            icon="refresh"
            primary
            onPress={session.retry}
          />
        )}
        {canWatchOnYouTube(code) && (
          <SlotButton
            ref={retry ? undefined : primary}
            label="Watch on YouTube"
            icon="open-outline"
            primary={!retry}
            onPress={session.watchOnYouTube}
          />
        )}
      </View>
    </View>
  );
}

function SlotButton({
  label,
  icon,
  primary = false,
  onPress,
  ref,
}: {
  label: string;
  icon: IconName;
  primary?: boolean;
  onPress: () => void;
  ref?: Ref<View>;
}) {
  return (
    <Tap
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      // The reason is read with the button that focus lands on.
      {...(primary ? web({ "aria-describedby": "player-error-message" }) : null)}
      onPress={onPress}
      style={[styles.slotButton, primary && styles.slotButtonPrimary]}
    >
      <Icon name={icon} size={16} color={primary ? c.onAccent : c.text} />
      <T style={[styles.slotButtonText, primary && { color: c.onAccent }]}>
        {label}
      </T>
    </Tap>
  );
}

function Poster({
  sermon,
  height,
  radius: corner,
  hint = "Starts the sermon in the YouTube player",
  onWatch,
}: {
  sermon: Sermon;
  height: number;
  radius: number;
  hint?: string;
  onWatch: () => void;
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Watch sermon"
      accessibilityHint={hint}
      onPress={onWatch}
      feedback="scaleLarge"
      style={{ height }}
    >
      <Thumbnail
        sermon={sermon}
        height={height}
        duration
        style={{ borderRadius: corner }}
      />
      <View style={[styles.center, { pointerEvents: "none" }]}>
        <View style={styles.watch}>
          <Icon name="play" color={c.onAccent} size={20} />
          <T style={styles.watchLabel}>Watch sermon</T>
        </View>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  // Fixed height so the player slot sits exactly where the player expects.
  header: { height: HEADER_HEIGHT, overflow: "visible" },
  slot: { flex: 1, backgroundColor: c.media },
  identity: { marginTop: space.lg, gap: 6 },
  shared: { marginBottom: space.xs },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.lg,
  },
  // White with a hairline, like the secondary button: clear on the wash and
  // the ivory page without competing with Watch.
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  // Saved also changes its label and icon, so colour isn't the only signal.
  actionSelected: { borderColor: c.accent },
  actionLabel: type.label,
  title: type.sermonTitle,
  titleNarrow: { fontSize: 22, lineHeight: 28 },
  event: { ...type.label, color: c.text },
  meta: { ...type.caption, color: c.muted },
  source: {
    marginTop: space.xl,
    gap: space.sm,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  sourceLabel: { ...type.kicker, color: c.muted },
  sourceTitle: { ...type.caption, color: c.text },
  // A white card in the video's place, outlined in the error colour.
  errorSlot: {
    padding: space.md,
    gap: space.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.error,
    justifyContent: "center",
  },
  errorMessage: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  errorText: { flex: 1, color: c.text, fontSize: 15, lineHeight: 22 },
  errorActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  slotButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  slotButtonPrimary: { backgroundColor: c.accent, borderColor: c.accent },
  slotButtonText: { fontFamily: font.semibold, fontSize: 14 },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  // Navy, like the Play control that replaces it. Navy is close to the dark
  // artwork, so a faint light edge and a shadow keep the pill's shape.
  watch: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: c.accent,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
  },
  watchLabel: { color: c.onAccent, fontFamily: font.bold, fontSize: 16 },
  skipLink: {
    position: "absolute",
    top: 4,
    left: 64,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: c.raised,
    borderWidth: 1,
    borderColor: c.border,
    boxShadow: `0 8px 24px ${c.shadow}`,
  },
  skipLinkText: { fontFamily: font.semibold, fontSize: 15, color: c.accent },
  offscreen: {
    width: 1,
    height: 1,
    minHeight: 1,
    paddingHorizontal: 0,
    borderWidth: 0,
    overflow: "hidden",
    opacity: 0,
  },
});

import * as Haptics from "expo-haptics";
import { router, useIsFocused, useNavigation, type Href } from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
  type RefObject,
} from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount, useProgressOf, useSaved } from "../../auth/AccountProvider";
import { useBlessingOnOpen } from "../../blessing";
import { coverState, subscribeCover } from "../../blessing/schedule";
import { catalogueMode, useCatalogue } from "../../catalogue/CatalogueProvider";
import { seriesRails } from "../../data/sermons";
import {
  CommonNeeds,
  ContinueRail,
  HERO_OVERLAP,
  HomeHero,
  LatestSermons,
  SERIES_MIN,
  SeriesRow,
  StartPathRail,
  TopicsRail,
  YourPath,
  YourPathPlaceholder,
  pathHref,
  useSermonActions,
} from "../../home";
import { SearchField } from "../../kit";
import { Confetti } from "../../kit/Confetti";
import { FocusedStatusBar } from "../../kit/FocusedStatusBar";
import { useEnrollment, useMyTopics, useNeeds, usePaths } from "../../learning";
import { useReducedMotion } from "../../motion";
import { requestSearchFocus, useGo, usePageTitle } from "../../navigation";
import { pathWords } from "../../paths/model";
import { PathSuggestions } from "../../paths/Suggestions";
import { resumePoint } from "../../player/progress";
import { useDockInset } from "../../player/useDockInset";
import { c, easeOut, space } from "../../theme";
import { useToast } from "../../toast";
import { topicHref } from "../../topics";
import { Notice, TextButton, dockScrollPadding, gradient, nowrap } from "../../ui";

// The hero shows the four newest; "Latest" the next six.
const HERO = 4;
const LATEST = 6;
// A library this small (the bundled sample, offline) lists every sermon
// after the newest under the hero too, so Home still has rows to browse.
const SMALL = HERO + 4;
/** Need chips on Home (Search lists the rest). */
const HOME_NEEDS = 8;
/** How far the ivory under the status bar fades out below it. */
const STATUS_FADE = 18;
/** How long Home is in front, settled, before a new account's welcome. */
const WELCOME_AFTER = 600;

// Switching tabs keeps what the other tab holds (Search's query, say), as
// the tab bar does.
type TabsNavigation = {
  navigate: (
    name: "search" | "account" | "paths",
    params: undefined,
    options: { merge: boolean },
  ) => void;
};

/**
 * Home, as the approved Immersive concept's screen 01: a dark hero with the
 * greeting and the newest sermons, then on ivory the question "What are you
 * going through?" with common needs, the path you're on (or paths to start),
 * Continue watching, the sermons and paths for your topics, the latest
 * sermons (See all: every sermon) and the conferences.
 *
 * The blessing has its own screen, opened from here at a cold start and
 * after 30 minutes or more away (src/blessing).
 */
export default function Home() {
  usePageTitle("Home");
  const go = useGo();
  const tabs = useNavigation<TabsNavigation>();
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  const account = useAccount();
  const catalogue = useCatalogue();
  const { sermons, seriesName } = catalogue;
  const actions = useSermonActions();
  const { needs } = useNeeds();
  const { paths, daysOf } = usePaths();
  const myTopics = useMyTopics();
  const enrollment = useEnrollment();
  const active = enrollment.active;

  // The whole library, rather than the bundled sample of four.
  const library = catalogue.source !== "sample";
  const member = !!account.user;
  const name = member ? account.displayName?.trim() || null : null;
  const newest = useMemo(() => sermons.slice(0, HERO), [sermons]);
  // After the hero's: one sermon per series, so a conference's sessions
  // don't fill the list (the series rail below holds them all).
  const latest = useMemo(() => {
    if (sermons.length <= SMALL) return sermons.slice(1);
    const seen = new Set(sermons.slice(0, HERO).map((s) => s.seriesKey).filter(Boolean));
    const out: (typeof sermons)[number][] = [];
    for (const sermon of sermons.slice(HERO)) {
      if (sermon.seriesKey) {
        if (seen.has(sermon.seriesKey)) continue;
        seen.add(sermon.seriesKey);
      }
      out.push(sermon);
      if (out.length === LATEST) break;
    }
    return out;
  }, [sermons]);
  // The concept shows a few needs here; Search has them all.
  const homeNeeds = useMemo(() => needs.slice(0, HOME_NEEDS), [needs]);
  const rails = useMemo(
    () => (library ? seriesRails(sermons, seriesName, { count: 8, min: SERIES_MIN }) : []),
    [library, sermons, seriesName],
  );

  const { isSaved } = useSaved();
  const progressFor = useProgressOf(newest.map((sermon) => sermon.id));
  const resumeAt = useCallback(
    (id: string) => (member ? resumePoint(progressFor(id)) : 0),
    [member, progressFor],
  );

  // ---- Where things go ---------------------------------------------------------------
  // useGo() is new each render; the memoised sections get stable callbacks.
  const goRef = useRef(go);
  useLayoutEffect(() => {
    goRef.current = go;
  });
  const openSearch = useCallback(
    () =>
      goRef.current.run(() => {
        requestSearchFocus();
        tabs.navigate("search", undefined, { merge: true });
      }),
    [tabs],
  );
  const allSermons = useCallback(() => goRef.current.push("/sermons"), []);
  const searchNeed = useCallback((label: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    goRef.current.run(() => router.navigate({ pathname: "/search", params: { q: label } }));
  }, []);
  const openAccount = useCallback(
    () => tabs.navigate("account", undefined, { merge: true }),
    [tabs],
  );
  const signIn = useCallback(
    () => goRef.current.push({ pathname: "/join", params: { mode: "sign-in" } }),
    [],
  );
  const openPath = useCallback((id: string) => goRef.current.push(pathHref(id)), []);
  const allPaths = useCallback(
    () => goRef.current.run(() => tabs.navigate("paths", undefined, { merge: true })),
    [tabs],
  );
  const openSeries = useCallback(
    (key: string) => goRef.current.push({ pathname: "/series/[key]", params: { key } }),
    [],
  );
  const openTopic = useCallback((id: string) => goRef.current.push(topicHref(id)), []);
  const openSuggested = useCallback((href: Href) => goRef.current.push(href), []);

  // ---- A new account's welcome (see Welcome) -----------------------------------------
  const screen = useRef<View>(null);
  const pathCard = useRef<View>(null);
  const { justJoined, clearJustJoined } = account;
  const hasCard = !!active || (!enrollment.loading && paths.some((path) => path.kind !== "series"));
  const welcomeMessage = welcomeLine(name, active ? `${pathWords(active.path).unit} ${active.day}` : "Day 1");

  // ---- The status bar: light over the hero, dark once it has scrolled by ------------
  // Kept by HomeChrome; crossing the hero's edge re-renders that alone.
  const chrome = useRef<Chrome>(null);
  const heroHeight = useRef(340);
  const onHeroHeight = useCallback((height: number) => {
    heroHeight.current = height;
  }, []);
  const past = useRef(false);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = e.nativeEvent.contentOffset.y > heroHeight.current - insets.top - 12;
      if (next !== past.current) {
        past.current = next;
        chrome.current?.setPastHero(next);
      }
    },
    [insets.top],
  );

  // ---- The first screen first --------------------------------------------------------
  // The sections below the first screen mount just after Home's first frame,
  // so that frame (a cold start's above all) has less to build.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => setSettled(true), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  return (
    <View ref={screen} style={styles.screen}>
      <ScrollView
        style={dockScrollPadding(dock)}
        contentContainerStyle={{ paddingBottom: 40 + dock }}
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
      >
        <HomeHero
          sermons={newest}
          name={name}
          member={member}
          isSaved={isSaved}
          resumeAt={resumeAt}
          onAccount={openAccount}
          onSignIn={signIn}
          onOpen={actions.open}
          onWatch={actions.watch}
          onToggleSave={actions.toggleSave}
          onHeight={onHeroHeight}
        />

        <View style={styles.column}>
          <SearchField
            variant="hero"
            testID="home-search"
            onPress={openSearch}
            hint="Opens Search, ready to type"
            style={styles.field}
          />
          <CommonNeeds needs={homeNeeds} onSearch={searchNeed} />

          {/* Offline at first launch: the bundled sample stands in, or only the
              newest sermons came before the connection dropped. */}
          {catalogueMode === "remote" && (!library || catalogue.source === "newest") && catalogue.settled ? (
            <View style={styles.offline}>
              <Notice icon="cloud-offline-outline">
                {library
                  ? "You’re offline, so only the newest sermons are here. The rest load when you’re back online."
                  : "You’re offline, so only a few sermons are here. The full library loads when you’re back online."}
              </Notice>
              <TextButton label="Try again" align="start" onPress={catalogue.retry} />
            </View>
          ) : null}

          <View ref={pathCard} collapsable={false}>
            {active ? (
              <YourPath active={active} onOpenPath={openPath} onPlay={actions.watch} />
            ) : enrollment.loading ? (
              <YourPathPlaceholder />
            ) : (
              <StartPathRail paths={paths} daysOf={daysOf} onOpenPath={openPath} onSeeAll={allPaths} />
            )}
          </View>

          {settled ? (
            <>
              <ContinueRail exclude={active?.today?.youtubeId} onWatch={actions.watch} />

              <TopicsRail sermons={sermons} topics={myTopics} onSeeAll={openTopic} />

              <PathSuggestions onOpen={openSuggested} inset={24} style={styles.suggested} />

              <LatestSermons
                sermons={latest}
                onOpen={actions.open}
                onSeeAll={sermons.length > latest.length ? allSermons : undefined}
              />

              <SeriesRow rails={rails} onOpen={openSeries} />
            </>
          ) : null}
        </View>
      </ScrollView>

      <HomeChrome ref={chrome} />

      <Welcome
        due={justJoined && hasCard}
        message={welcomeMessage}
        onWelcomed={clearJustJoined}
        screen={screen}
        pathCard={pathCard}
      />

      <BlessingCover />
    </View>
  );
}

/** Whether a cold start's cover is still over Home (see BlessingCover). */
function useCovered() {
  return useSyncExternalStore(subscribeCover, coverState, coverState) !== "done";
}

type Chrome = { setPastHero: (past: boolean) => void };

/**
 * Home's status bar, light over the hero and dark once it has scrolled by,
 * and the ivory shade under it then. Its own component, so neither a
 * navigation nor crossing the hero's edge re-renders the rest of Home.
 * Under a cold start's cover the bar changes at once: it animates only
 * once Home can be seen.
 */
const HomeChrome = memo(function HomeChrome({ ref }: { ref: Ref<Chrome> }) {
  const insets = useSafeAreaInsets();
  const covered = useCovered();
  const [pastHero, setPastHero] = useState(false);
  useImperativeHandle(ref, () => ({ setPastHero }), []);
  return (
    <>
      <FocusedStatusBar style={pastHero ? "dark" : "light"} animated={!covered} />
      {/* Under the status bar once the hero has gone, so the time stays
          legible: ivory fading out below it, never a band with a hard edge
          over the dark path card. */}
      {insets.top > 0 ? (
        <Animated.View
          style={[
            styles.statusShade,
            {
              height: insets.top + STATUS_FADE,
              opacity: pastHero ? 1 : 0,
              transitionProperty: "opacity",
              transitionDuration: 200,
              transitionTimingFunction: easeOut,
            },
          ]}
        />
      ) : null}
    </>
  );
});

/**
 * What a new account's welcome says comes next: "Welcome, Mufaro. Day 1 is
 * ready." Its last two words keep together (a narrow phone otherwise leaves
 * "ready." alone on the second line), as does "Day 1".
 */
function welcomeLine(name: string | null, next: string) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Welcome, ${first}. ${nowrap(next)} is\u00a0ready.` : "Welcome. Your first path is\u00a0ready.";
}

/**
 * A new account's welcome. Someone who has just created an account, on Home
 * with its path card (Start here, or the path they started): once, a short
 * burst of confetti from that card, a success tap and a line saying what's
 * next (it takes the place of "You're signed in"); under Reduce Motion, the
 * tap and the line. It waits for Home to settle in front, so a sign-up that
 * went straight on to a sermon is welcomed on coming back.
 */
const Welcome = memo(function Welcome({
  due,
  message,
  onWelcomed,
  screen,
  pathCard,
}: {
  due: boolean;
  /** "Welcome, Mufaro. Day 1 is ready." */
  message: string;
  onWelcomed: () => void;
  screen: RefObject<View | null>;
  pathCard: RefObject<View | null>;
}) {
  const toast = useToast();
  const focused = useIsFocused();
  const covered = useCovered();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const endBurst = useCallback(() => setBurst(null), []);
  const welcome = due && focused && !covered;
  useEffect(() => {
    if (!welcome) return;
    const timer = setTimeout(() => {
      onWelcomed();
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(message);
      if (reduced) return;
      // From just inside the card's top edge while it's on screen, else
      // from a little above the middle.
      const fallback = { x: width / 2, y: height * 0.4 };
      const card = pathCard.current;
      const page = screen.current;
      if (!card || !page) return setBurst(fallback);
      page.measureInWindow((left, top) =>
        card.measureInWindow((x, y, w) => {
          const from = { x: x - left + w / 2, y: y - top + 40 };
          setBurst(from.y > insets.top + 60 && from.y < height - 200 ? from : fallback);
        }),
      );
    }, WELCOME_AFTER);
    return () => clearTimeout(timer);
  }, [welcome, message, toast, reduced, onWelcomed, width, height, insets.top, screen, pathCard]);
  return burst ? <Confetti origin={burst} onDone={endBurst} testID="welcome-confetti" /> : null;
});

/**
 * A cold start's blessing opens over Home; until it's up, Home stays under
 * the ivory the splash lifts onto, so it never flashes first. Its own
 * component, as deciding follows every navigation.
 */
function BlessingCover() {
  const covered = useBlessingOnOpen();
  return covered ? <View testID="home-cover" style={styles.cover} /> : null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  // The page column (as wide as other pages at most); the hero runs edge to edge.
  column: { width: "100%", maxWidth: 760, alignSelf: "center" },
  field: { marginTop: -HERO_OVERLAP, marginHorizontal: 20 },
  offline: { gap: space.xs, marginTop: space.lg, paddingHorizontal: 24 },
  suggested: { marginTop: 32 },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: c.bg },
  statusShade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: "none",
    ...gradient(
      "linear-gradient(180deg, rgba(247,244,238,0.96) 0%, rgba(247,244,238,0.9) 55%, rgba(247,244,238,0) 100%)",
    ),
  },
});

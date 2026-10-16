import * as Haptics from "expo-haptics";
import { router, useIsFocused, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../../auth/AccountProvider";
import { useBlessingOnOpen } from "../../blessing";
import { catalogueMode, useCatalogue } from "../../catalogue/CatalogueProvider";
import { seriesRails } from "../../data/sermons";
import {
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
import { ChipRow, NeedChip, SearchField } from "../../kit";
import { useEnrollment, useNeeds, usePaths } from "../../learning";
import { requestSearchFocus, useGo, usePageTitle } from "../../navigation";
import { resumePoint } from "../../player/progress";
import { useDockInset } from "../../player/useDockInset";
import type { CategoryId } from "../../data/categories";
import { c, easeOut, space } from "../../theme";
import { sermonCount } from "../../topics";
import { Notice, T, TextButton, dockScrollPadding, gradient, s } from "../../ui";

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
 * Continue watching, the sermons in your topics, the latest sermons (See
 * all: every sermon) and the conferences.
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
  const focused = useIsFocused();
  const account = useAccount();
  const catalogue = useCatalogue();
  const { sermons, seriesName } = catalogue;
  const actions = useSermonActions();
  const { needs } = useNeeds();
  const { paths, daysOf } = usePaths();
  const enrollment = useEnrollment();
  const active = enrollment.active;
  // True while a cold start's blessing is being decided or opening.
  const covered = useBlessingOnOpen();

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

  const { progressFor } = account;
  const resumeAt = useCallback(
    (id: string) => (member ? resumePoint(progressFor(id)) : 0),
    [member, progressFor],
  );

  // ---- Where things go ---------------------------------------------------------------
  const openSearch = () =>
    go.run(() => {
      requestSearchFocus();
      tabs.navigate("search", undefined, { merge: true });
    });
  const allSermons = () => go.push("/sermons");
  const searchNeed = (label: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    go.run(() => router.navigate({ pathname: "/search", params: { q: label } }));
  };
  const openAccount = useCallback(
    () => tabs.navigate("account", undefined, { merge: true }),
    [tabs],
  );
  // useGo() is new each render; the memoised sections get stable callbacks.
  const goRef = useRef(go);
  useLayoutEffect(() => {
    goRef.current = go;
  });
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
  const openTopic = useCallback(
    (categoryId: CategoryId) =>
      goRef.current.push({ pathname: "/topics/[categoryId]", params: { categoryId } }),
    [],
  );

  // ---- The status bar: light over the hero, dark once it has scrolled by ------------
  const [heroHeight, setHeroHeight] = useState(340);
  const [pastHero, setPastHero] = useState(false);
  const past = useRef(false);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = e.nativeEvent.contentOffset.y > heroHeight - insets.top - 12;
      if (next !== past.current) {
        past.current = next;
        setPastHero(next);
      }
    },
    [heroHeight, insets.top],
  );

  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style={pastHero ? "dark" : "light"} animated /> : null}
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
          isSaved={account.isSaved}
          resumeAt={resumeAt}
          onAccount={openAccount}
          onSignIn={signIn}
          onOpen={actions.open}
          onWatch={actions.watch}
          onToggleSave={actions.toggleSave}
          onHeight={setHeroHeight}
        />

        <View style={styles.column}>
          <SearchField
            variant="hero"
            testID="home-search"
            onPress={openSearch}
            hint="Opens Search, ready to type"
            style={styles.field}
          />
          {homeNeeds.length ? (
            <ChipRow label="Common needs" style={styles.chips}>
              {homeNeeds.map((need) => (
                <NeedChip
                  key={need.id}
                  label={need.short}
                  hint={`Searches for “${need.label}”`}
                  onPress={() => searchNeed(need.label)}
                />
              ))}
            </ChipRow>
          ) : null}

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

          {active ? (
            <YourPath active={active} onOpenPath={openPath} onPlay={actions.watch} />
          ) : enrollment.loading ? (
            <YourPathPlaceholder />
          ) : (
            <StartPathRail paths={paths} daysOf={daysOf} onOpenPath={openPath} onSeeAll={allPaths} />
          )}

          <ContinueRail exclude={active?.today?.youtubeId} onWatch={actions.watch} />

          <TopicsRail sermons={sermons} topics={account.interests} onSeeAll={openTopic} />

          <LatestSermons
            sermons={latest}
            onOpen={actions.open}
            onSeeAll={sermons.length > latest.length ? allSermons : undefined}
          />

          <SeriesRow rails={rails} onOpen={openSeries} />

          {sermons.length > 0 ? (
            <View style={styles.footer}>
              <T style={s.meta}>
                {/* No count while only the newest sermons are in: it would say 200. */}
                {catalogue.source === "newest"
                  ? "From the Apostle Arome Osayi channel, newest first."
                  : library
                  ? `${sermonCount(sermons.length)} from the Apostle Arome Osayi channel, newest first.`
                  : `This preview has ${sermonCount(sermons.length).toLowerCase()}, not the full archive.`}
              </T>
            </View>
          ) : null}
        </View>
      </ScrollView>

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

      {/* A cold start's blessing opens over Home; until it's up, Home stays
          under the ivory the splash lifts onto, so it never flashes first. */}
      {covered ? <View testID="home-cover" style={styles.cover} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  // The page column (as wide as other pages at most); the hero runs edge to edge.
  column: { width: "100%", maxWidth: 760, alignSelf: "center" },
  field: { marginTop: -HERO_OVERLAP, marginHorizontal: 20 },
  chips: { marginTop: 12 },
  offline: { gap: space.xs, marginTop: space.lg, paddingHorizontal: 24 },
  footer: { marginTop: 40, paddingHorizontal: 24 },
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

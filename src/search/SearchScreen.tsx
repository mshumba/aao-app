import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type ListRenderItem,
  type TextInput,
} from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../auth/AccountProvider";
import { useGate } from "../auth/gate";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { getCategory } from "../data/categories";
import { searchSermons, type Sermon } from "../data/sermons";
import { ChipRow, ItalicTitle, Kicker, NeedChip, PathCardNavy, SearchField, Strong, Wash, type ArtSource } from "../kit";
import {
  messagesLabel,
  minutesPerDayLabel,
  nextDay,
  useEnrollment,
  useNeeds,
  usePath,
  usePaths,
  useRecentSearches,
  useSearch,
  type LearningError,
  type Need,
  type SearchMoment,
  type SearchSermon,
} from "../learning";
import { useReducedMotion } from "../motion";
import { firstParam, requestWatch, takeSearchFocus, useGo, usePageTitle } from "../navigation";
import { useDockInset } from "../player/useDockInset";
import { c, radius, textCap, type } from "../theme";
import { useToast } from "../toast";
import { sermonCount } from "../topics";
import { dockScrollPadding, web } from "../ui";
import {
  CalmState,
  FoundSermon,
  ListHeading,
  LiveStatus,
  MoreButton,
  NeedCloud,
  Note,
  SermonResult,
  SuggestRow,
  TopicCards,
} from "./parts";
import { ResultCard, ResultPlaceholder } from "./ResultCard";

/**
 * "What are you going through?" (approved concept, screen 02).
 *
 * - Empty: common needs as a wrapping cloud, recent searches, and Browse
 *   by topic (which replaces the old Topics tab).
 * - Typing: "Search for “…”", needs that match, and sermon titles from the
 *   catalogue as you type. Nothing is sent until you press search or tap a
 *   need: meaning search runs on submit only.
 * - Searching: "Finding moments about …" over calm static placeholders.
 * - Results: what search understood, related needs, "A path for this",
 *   the moments (his verbatim words, each playing from its minute), then
 *   the sermons they're in. Title matches stay listed for title-like
 *   questions.
 * - Errors are calm and say what still works.
 */

/** Rows of title matches shown before "Show more". */
const TYPING_ROWS = 8;
const RESULT_TITLE_ROWS = 3;
const PAGE = 30;
/** Needs in the empty screen's cloud before "Show all". */
const CLOUD = 12;
/** Guided paths offered on the empty screen. */
const EMPTY_PATHS = 3;
/** After this long, the searching line says it's still going. */
const SLOW_MS = 2000;
const VERY_SLOW_MS = 8000;

type Mode = "empty" | "typing" | "results";

type Item =
  | { key: string; kind: "cloud"; needs: Need[] }
  | { key: string; kind: "pathPlaceholder" }
  | { key: string; kind: "heading"; title: string; count?: string; spoken?: string; countTestID?: string; clear?: boolean }
  | { key: string; kind: "recent"; q: string; first: boolean }
  | { key: string; kind: "topics" }
  | { key: string; kind: "suggest"; q: string }
  | { key: string; kind: "need"; need: Need; first: boolean }
  | { key: string; kind: "sermon"; sermon: Sermon; first: boolean }
  | { key: string; kind: "found"; sermon: SearchSermon & { moments: number }; first: boolean }
  | { key: string; kind: "more"; label: string; next: number; limitKey: string }
  | { key: string; kind: "allNeeds"; label: string }
  | { key: string; kind: "related"; labels: string[] }
  | { key: string; kind: "path"; card: PathCard }
  | { key: string; kind: "moment"; moment: SearchMoment; pending: boolean; saved: boolean; continued: boolean }
  | { key: string; kind: "placeholder" }
  | { key: string; kind: "relatedPlaceholder" }
  | { key: string; kind: "state"; state: "offline" | "rate_limited" | "unavailable" | "empty"; q: string }
  | { key: string; kind: "note"; text: string };

type PathCard = { id: string; name: string; meta: string; fan: ArtSource[]; kicker?: string };

const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string | string[]; category?: string | string[] }>();
  const q = firstParam(params.q) ?? "";
  const category = firstParam(params.category);
  const go = useGo();

  // Old scoped links (/search?category=prayer) open that topic's page,
  // where its sermons are; Search itself no longer filters by topic.
  const known = category ? getCategory(category) : undefined;
  useEffect(() => {
    if (!known) return;
    router.setParams({ category: "" });
    go.push({ pathname: "/topics/[categoryId]", params: { categoryId: known.id } });
    // Only when the link arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known?.id]);

  // A question in the link (?q=…, or a need tapped on Home) is searched at
  // once; a new one starts the screen afresh.
  return <SearchView key={q} initialQuery={q} unknownTopic={!!category && !known} />;
}

function SearchView({ initialQuery, unknownTopic }: { initialQuery: string; unknownTopic: boolean }) {
  usePageTitle("Search");
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  const reduced = useReducedMotion();
  const go = useGo();
  const gate = useGate();
  const account = useAccount();
  const toast = useToast();
  const { sermons } = useCatalogue();
  const { needs } = useNeeds();
  const recent = useRecentSearches();
  const { add: addRecent, clear: clearRecent, remove: removeRecent } = recent;
  const { progressFor } = useEnrollment();

  // Navigation, the gate, the account and the toast change identity every
  // render; callbacks read the latest through a ref so the rows they're
  // passed to stay memoised.
  const latest = useRef({ go, gate, account, toast });
  useEffect(() => {
    latest.current = { go, gate, account, toast };
  });

  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState<string | null>(initialQuery.trim() || null);
  const [limit, setLimit] = useState<{ key: string; n: number }>({ key: "", n: 0 });
  const [showTopicNotice, setShowTopicNotice] = useState(unknownTopic);
  const [allNeeds, setAllNeeds] = useState(false);
  const { paths, daysOf } = usePaths();
  const input = useRef<TextInput>(null);
  const list = useRef<FlatList<Item>>(null);

  // On the web the field is announced as a search box. (The kit's field asks
  // for type="search", which react-native-web drops; a role keeps the
  // browser's own clear button out of the way of ours.)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = input.current as unknown as { getAttribute?: (n: string) => string | null; setAttribute?: (n: string, v: string) => void } | null;
    if (node?.setAttribute && !node.getAttribute?.("role")) node.setAttribute("role", "searchbox");
  }, []);

  // Home's search field asks for focus; arriving by the tab itself doesn't.
  useFocusEffect(
    useCallback(() => {
      if (takeSearchFocus()) input.current?.focus();
    }, []),
  );

  const trimmed = query.trim();
  const mode: Mode = !trimmed ? "empty" : submitted && same(trimmed, submitted) ? "results" : "typing";
  const result = useSearch(mode === "results" ? submitted : null);
  const asked = mode === "results" ? submitted! : "";

  // Title matches update as you type, without holding up the keystroke.
  const typed = useDeferredValue(trimmed);
  const titles = useMemo(
    () => (typed.length >= 2 ? searchSermons(sermons, typed) : []),
    [sermons, typed],
  );

  const needFor = useCallback(
    (text: string) => needs.find((n) => same(n.label, text) || same(n.short, text)),
    [needs],
  );

  // ---- Actions ---------------------------------------------------------------------------

  const run = useCallback(
    (text: string) => {
      const value = text.trim().replace(/\s+/g, " ").slice(0, 200);
      if (!value) return;
      setQuery(value);
      setSubmitted(value);
      setShowTopicNotice(false);
      addRecent(value);
      if (Platform.OS !== "web") Keyboard.dismiss();
      list.current?.scrollToOffset({ offset: 0, animated: !reduced });
    },
    [addRecent, reduced],
  );

  const pickNeed = useCallback(
    (need: Need) => {
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
      run(need.label);
    },
    [run],
  );

  const pickRelated = useCallback(
    (label: string) => {
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
      run(needFor(label)?.label ?? label);
    },
    [needFor, run],
  );

  const clear = useCallback(() => {
    setQuery("");
    setSubmitted(null);
    input.current?.focus();
  }, []);

  const openSermon = useCallback(
    (id: string) => latest.current.go.push({ pathname: "/sermon/[id]", params: { id } }),
    [],
  );

  const openMoment = useCallback(
    (m: SearchMoment) =>
      latest.current.go.push({ pathname: "/sermon/[id]", params: { id: m.youtubeId, from: "search", q: asked } }),
    [asked],
  );

  // Opens the sermon at the moment and starts it there. The sermon page
  // asks a guest who may not watch to create a free account first, and
  // carries on afterwards.
  const play = useCallback(
    (m: SearchMoment) => {
      requestWatch(m.youtubeId);
      latest.current.go.push({
        pathname: "/sermon/[id]",
        params: { id: m.youtubeId, t: String(Math.floor(m.at)), from: "search", q: asked },
      });
    },
    [asked],
  );

  const saving = useRef(false);
  const toggleSave = useCallback(
    async (m: SearchMoment) => {
      const { gate, account, toast } = latest.current;
      if (saving.current) return;
      if (!gate.require({ kind: "save", sermonId: m.youtubeId })) return;
      saving.current = true;
      const next = !account.isSaved(m.youtubeId);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      try {
        await account.setSaved(m.youtubeId, next);
        toast(next ? "Saved to your library" : "Removed from saved", next ? "bookmark" : "bookmark-outline");
      } catch {
        toast(
          next ? "Couldn’t save. Check your connection." : "Couldn’t remove it. Check your connection.",
          "alert-circle-outline",
        );
      } finally {
        saving.current = false;
      }
    },
    [],
  );

  const openPath = useCallback(
    (id: string) => latest.current.go.push(`/path/${encodeURIComponent(id)}` as Href),
    [],
  );

  // ---- How long the search has been running ---------------------------------------------

  const [slow, setSlow] = useState({ key: "", level: 0 });
  const loadingKey = result.status === "loading" ? asked.toLocaleLowerCase() : "";
  useEffect(() => {
    if (!loadingKey) return;
    const a = setTimeout(() => setSlow({ key: loadingKey, level: 1 }), SLOW_MS);
    const b = setTimeout(() => setSlow({ key: loadingKey, level: 2 }), VERY_SLOW_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [loadingKey]);
  const slowLevel = slow.key === loadingKey ? slow.level : 0;

  // ---- What we understood ----------------------------------------------------------------

  const data = mode === "results" && result.status === "success" ? result.data : null;
  // The person's own words stay as they typed them ("Apostolic", not "apostolic").
  const understood = data?.understood.theme || needFor(asked)?.theme;
  const theme = understood && same(understood, asked) ? asked : understood;
  const foundAny = !!data && (data.moments.length > 0 || data.sermons.length > 0);

  const helper =
    mode !== "results" ? undefined : foundAny ? (
      <>
        Finding moments about <Strong>{theme || asked}</Strong>
      </>
    ) : result.status === "loading" ? (
      slowLevel === 2 ? (
        "Taking longer than usual. Still searching…"
      ) : slowLevel === 1 ? (
        "Still searching every message…"
      ) : theme ? (
        <>
          Finding moments about <Strong>{theme}</Strong>…
        </>
      ) : (
        "Finding moments…"
      )
    ) : undefined;

  const status =
    mode !== "results"
      ? ""
      : result.status === "loading"
        ? "Finding moments"
        : data
          ? data.moments.length
            ? `${data.moments.length} moment${data.moments.length === 1 ? "" : "s"} found`
            : `Nothing found for ${asked} yet`
          : result.status === "error"
            ? errorTitle(result.error)
            : "";

  // VoiceOver has no live regions: announce the outcome once it's in.
  useEffect(() => {
    if (Platform.OS !== "ios" || !status || status === "Finding moments") return;
    const timer = setTimeout(() => AccessibilityInfo.announceForAccessibility(status), 400);
    return () => clearTimeout(timer);
  }, [status]);

  // ---- The list --------------------------------------------------------------------------

  // "A path for this": its length, and where you are on it if you've
  // started; the fan shows the day you're on (or Day 1) in front.
  const found = data?.path ?? null;
  const { path: known, days: pathDays } = usePath(found?.id);
  const pathCard = useMemo<PathCard | null>(() => {
    if (!found) return null;
    const total = known?.dayCount || pathDays.length || found.days;
    const progress = progressFor(found.id);
    const today = progress ? (nextDay(total, progress.done) ?? total) : 1;
    const meta =
      progress && !progress.finishedAt
        ? `${messagesLabel(total)} · You're on Day ${today}`
        : progress?.finishedAt
          ? `${messagesLabel(total)} · Finished`
          : known
            ? `${messagesLabel(total)} · ${minutesPerDayLabel(known)}`
            : messagesLabel(total);
    const front = pathDays[today - 1] ?? pathDays[0];
    const behind = pathDays[today - 2] ?? pathDays[today] ?? pathDays[1];
    const fan = [front, behind]
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => d.sermon ?? { id: d.youtubeId });
    return { id: found.id, name: found.name, meta, fan };
  }, [found, known, pathDays, progressFor]);

  // The empty screen's guided paths: the dark compact cards, in the
  // editor's order, saying where you are on any you've started.
  const emptyPaths = useMemo<PathCard[]>(
    () =>
      paths.slice(0, EMPTY_PATHS).map((path) => {
        const days = daysOf(path.id);
        const total = path.dayCount || days.length;
        const mine = progressFor(path.id);
        const meta = mine?.finishedAt
          ? `${messagesLabel(total)} · Finished`
          : mine
            ? `${messagesLabel(total)} · You're on Day ${nextDay(total, mine.done) ?? total}`
            : `${messagesLabel(total)} · ${minutesPerDayLabel(path)}`;
        const fan = days.slice(0, 2).map((d) => ({ id: d.youtubeId }) as ArtSource);
        return { id: path.id, name: path.name, meta, fan, kicker: "Guided path" };
      }),
    [paths, daysOf, progressFor],
  );

  const isSaved = account.isSaved;
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const titleKey = `${mode}:${typed.toLocaleLowerCase()}`;
    const titleBlock = (initial: number, heading = "Sermons") => {
      if (!titles.length) return [] as string[];
      const n = limit.key === titleKey ? limit.n : initial;
      out.push({
        key: "titles-h",
        kind: "heading",
        title: heading,
        count: sermonCount(titles.length),
        countTestID: "result-count",
      });
      titles.slice(0, n).forEach((sermon, i) => out.push({ key: `t-${sermon.id}`, kind: "sermon", sermon, first: i === 0 }));
      if (titles.length > n) {
        const next = n + PAGE;
        out.push({
          key: "titles-more",
          kind: "more",
          label: titles.length <= next ? `Show all ${sermonCount(titles.length)}` : `Show ${PAGE} more`,
          next,
          limitKey: titleKey,
        });
      }
      return titles.slice(0, n).map((s) => s.id);
    };

    if (mode === "empty") {
      // A calm first view: the editor's first dozen needs, the rest a tap away.
      if (needs.length) {
        out.push({ key: "cloud", kind: "cloud", needs: allNeeds ? needs : needs.slice(0, CLOUD) });
        if (!allNeeds && needs.length > CLOUD)
          out.push({ key: "all-needs", kind: "allNeeds", label: `Show all ${needs.length} needs` });
      }
      if (recent.recent.length) {
        out.push({ key: "recent-h", kind: "heading", title: "Recent searches", clear: true });
        recent.recent.forEach((r, i) => out.push({ key: `r-${r}`, kind: "recent", q: r, first: i === 0 }));
      }
      if (emptyPaths.length) {
        out.push({ key: "paths-h", kind: "heading", title: "Guided paths" });
        emptyPaths.forEach((card) => out.push({ key: `gp-${card.id}`, kind: "path", card }));
      }
      out.push({ key: "topics", kind: "topics" });
      return out;
    }

    if (mode === "typing") {
      out.push({ key: "suggest", kind: "suggest", q: trimmed });
      const t = trimmed.toLocaleLowerCase();
      needs
        .filter((n) => `${n.label} ${n.short} ${n.theme}`.toLocaleLowerCase().includes(t))
        .slice(0, 3)
        .forEach((need) => out.push({ key: `n-${need.id}`, kind: "need", need, first: false }));
      // No title matches is fine: "Search for “…”" above says what Return does.
      if (titles.length) titleBlock(TYPING_ROWS);
      return out;
    }

    // Results.
    if (result.status === "loading") {
      out.push({ key: "related-ph", kind: "relatedPlaceholder" });
      // A path is likely for a known need: hold its place so nothing jumps.
      const need = needFor(asked);
      if (need && paths.some((p) => p.needs.includes(need.id)))
        out.push({ key: "path-ph", kind: "pathPlaceholder" });
      titleBlock(RESULT_TITLE_ROWS);
      out.push({ key: "moments-h", kind: "heading", title: "Moments that speak to this" });
      for (let i = 0; i < 3; i++) out.push({ key: `ph-${i}`, kind: "placeholder" });
      return out;
    }

    if (result.status === "error") {
      const code = errorCode(result.error);
      const state = code === "offline" ? "offline" : code === "rate_limited" ? "rate_limited" : "unavailable";
      // A title-like question still has its answer: those sermons lead.
      titleBlock(RESULT_TITLE_ROWS);
      out.push({ key: "state", kind: "state", state, q: asked });
      const others = recent.recent.filter((r) => !same(r, asked));
      if (state === "offline" && others.length) {
        out.push({ key: "recent-h", kind: "heading", title: "Recent searches", clear: true });
        others.forEach((r, i) => out.push({ key: `r-${r}`, kind: "recent", q: r, first: i === 0 }));
      }
      return out;
    }

    if (!data) return out;
    // Related needs only when the question matched one (otherwise they're guesses).
    const related = needFor(asked) || data.path
      ? data.understood.related.filter((r) => r && !same(r, asked)).slice(0, 4)
      : [];
    if (related.length) out.push({ key: "related", kind: "related", labels: related });
    if (pathCard) out.push({ key: `path-${pathCard.id}`, kind: "path", card: pathCard });
    const listed = new Set(titleBlock(RESULT_TITLE_ROWS));
    if (data.moments.length) {
      const shown = data.moments.length;
      const all = Math.max(shown, data.total.moments);
      out.push({
        key: "moments-h",
        kind: "heading",
        title: "Moments that speak to this",
        // What's listed: "14 found", or "14 of 96" when there are more.
        count: all > shown ? `${shown} of ${all}` : `${shown} found`,
        spoken: all > shown ? `${shown} of ${all} moments` : `${shown} moment${shown === 1 ? "" : "s"} found`,
      });
      data.moments.forEach((m, i) =>
        out.push({
          key: `m-${m.id}`,
          kind: "moment",
          moment: m,
          pending: result.pendingQuotes.has(m.id),
          saved: isSaved(m.youtubeId),
          continued: i > 0 && data.moments[i - 1].youtubeId === m.youtubeId,
        }),
      );
    }
    const found = data.sermons.filter((s) => !listed.has(s.youtubeId));
    if (found.length) {
      out.push({
        key: "found-h",
        kind: "heading",
        title: listed.size ? "More sermons" : "Sermons",
        count: sermonCount(found.length),
      });
      found.forEach((sermon, i) => out.push({ key: `f-${sermon.youtubeId}`, kind: "found", sermon, first: i === 0 }));
    }
    if (!data.moments.length && !found.length && !listed.size)
      out.push({ key: "state", kind: "state", state: "empty", q: asked });
    return out;
  }, [mode, typed, trimmed, titles, limit, needs, allNeeds, recent.recent, emptyPaths, result.status, result.error, result.pendingQuotes, data, pathCard, asked, isSaved, needFor, paths]);

  // ---- Rows ------------------------------------------------------------------------------

  const fourNeeds = useMemo(() => needs.slice(0, 4), [needs]);
  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item }) => {
      switch (item.kind) {
        case "cloud":
          return (
            <View style={styles.cloud}>
              <NeedCloud needs={item.needs} onPick={pickNeed} />
            </View>
          );
        case "heading":
          return (
            <ListHeading
              title={item.title}
              count={item.count}
              spokenCount={item.spoken}
              countTestID={item.countTestID}
              action={item.clear ? { label: "Clear", onPress: clearRecent, hint: "Clears your recent searches" } : undefined}
            />
          );
        case "allNeeds":
          return <MoreButton label={item.label} onPress={() => setAllNeeds(true)} />;
        case "pathPlaceholder":
          return (
            <View style={[styles.path, styles.pathGhost]} accessible={false} importantForAccessibility="no-hide-descendants">
              <Wash kind="pathCompact" />
            </View>
          );
        case "recent":
          return (
            <SuggestRow
              icon="time-outline"
              strong={item.q}
              label={`Search again: ${item.q}`}
              onPress={() => run(item.q)}
              onRemove={() => removeRecent(item.q)}
              removeLabel={`Remove “${item.q}” from recent searches`}
              first={item.first}
            />
          );
        case "topics":
          return <TopicCards />;
        case "suggest":
          return (
            <View style={styles.suggestTop}>
              <SuggestRow
                icon="spark"
                text="Search for"
                strong={`“${item.q}”`}
                label={`Search for ${item.q}`}
                onPress={() => run(item.q)}
                lines={1}
                first
              />
            </View>
          );
        case "need":
          return (
            <SuggestRow
              icon="spark"
              strong={item.need.label}
              sub={item.need.short}
              label={`Search: ${item.need.label}`}
              onPress={() => pickNeed(item.need)}
              first={item.first}
            />
          );
        case "sermon":
          return <SermonResult sermon={item.sermon} onOpen={openSermon} first={item.first} />;
        case "found":
          return <FoundSermon sermon={item.sermon} onOpen={openSermon} first={item.first} />;
        case "more":
          return (
            <MoreButton label={item.label} onPress={() => setLimit({ key: item.limitKey, n: item.next })} />
          );
        case "related":
          return (
            <ChipRow label="Related needs" style={styles.related}>
              {item.labels.map((label) => (
                <NeedChip key={label} label={label} variant="outline" onPress={() => pickRelated(label)} />
              ))}
            </ChipRow>
          );
        case "relatedPlaceholder":
          return (
            <View style={[styles.related, styles.chipGhosts]} accessible={false} importantForAccessibility="no-hide-descendants">
              {[104, 150, 112].map((w) => (
                <View key={w} style={[styles.chipGhost, { width: w }]} />
              ))}
            </View>
          );
        case "path":
          return (
            <PathCardNavy
              variant="compact"
              testID={item.card.kicker ? "guided-path" : "search-path"}
              kicker={item.card.kicker}
              name={item.card.name}
              meta={item.card.meta}
              fan={item.card.fan}
              onPress={() => openPath(item.card.id)}
              style={[styles.path, item.card.kicker ? styles.pathList : null]}
            />
          );
        case "moment":
          return (
            <ResultCard
              moment={item.moment}
              quotePending={item.pending}
              saved={item.saved}
              continued={item.continued}
              onPlay={play}
              onOpen={openMoment}
              onToggleSave={toggleSave}
            />
          );
        case "placeholder":
          return <ResultPlaceholder />;
        case "note":
          return <Note>{item.text}</Note>;
        case "state":
          return (
            <SearchProblem
              state={item.state}
              q={item.q}
              error={result.error}
              needs={fourNeeds}
              onNeed={pickNeed}
              onRetry={result.retry}
            />
          );
      }
    },
    [pickNeed, clearRecent, removeRecent, run, openSermon, pickRelated, openPath, play, openMoment, toggleSave, result.error, result.retry, fourNeeds],
  );

  // ---- The page's top: the question and the field ---------------------------------------

  const header = (
    <View style={{ paddingTop: insets.top + (insets.top ? 8 : 28) }}>
      <View style={styles.head}>
        <Kicker>Search by what you need</Kicker>
        <ItalicTitle
          text="What are you going through?"
          italic="going through?"
          breakBeforeItalic
          accessibilityRole="header"
          {...web({ "aria-level": 1 })}
          style={[type.title, styles.title]}
          maxFontSizeMultiplier={textCap.display}
        />
      </View>
      {showTopicNotice ? (
        <Note icon="pricetags-outline">That topic link is out of date. Browse the topics below, or ask in your own words.</Note>
      ) : null}
      <SearchField
        inputRef={input}
        testID="search-input"
        value={query}
        onChangeText={setQuery}
        onSubmit={run}
        onClear={clear}
        active={mode === "results"}
        prompt="Say it in your own words"
        helper={helper}
        helperIcon={foundAny ? "checkmark" : "sparkles-outline"}
        style={styles.field}
      />
      <LiveStatus text={status} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <Animated.FlatList
        ref={list}
        data={items}
        renderItem={renderItem}
        // A late quote or a card arriving eases the cards below into place.
        itemLayoutAnimation={reduced ? undefined : LinearTransition.duration(200)}
        keyExtractor={keyOf}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
        style={dockScrollPadding(dock)}
        contentContainerStyle={[styles.content, { paddingBottom: 48 + dock }]}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={9}
        removeClippedSubviews={Platform.OS === "android"}
      />
      {/* Content scrolls under the status bar onto ivory, never under the clock. */}
      <View style={[styles.statusWash, { height: insets.top }]} />
    </View>
  );
}

const keyOf = (item: Item) => item.key;

/**
 * The error as the person should hear it. On the web a request the browser
 * refuses (a function not deployed yet answers its CORS check with a 404)
 * fails exactly like a dropped connection; while the browser says it's
 * online, that is search not answering, not the person being offline.
 */
function errorCode(error: LearningError | null) {
  const code = error?.code;
  if (code === "offline" && Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine)
    return "unavailable";
  return code;
}

function errorTitle(error: LearningError | null) {
  switch (errorCode(error)) {
    case "offline":
      return "Search needs a connection";
    case "rate_limited":
      return "Too many searches at once";
    default:
      return "Search isn’t answering";
  }
}

/** The calm states: offline, too many searches, unavailable, or nothing found. */
function SearchProblem({
  state,
  q,
  error,
  needs,
  onNeed,
  onRetry,
}: {
  state: "offline" | "rate_limited" | "unavailable" | "empty";
  q: string;
  error: LearningError | null;
  needs: Need[];
  onNeed: (need: Need) => void;
  onRetry: () => void;
}) {
  if (state === "offline")
    return (
      <CalmState
        testID="search-offline"
        icon="cloud-offline-outline"
        title="Search needs a connection"
        body="Reconnect and try again. Sermon titles still match as you type."
        action={{ label: "Try again", onPress: onRetry }}
      />
    );
  if (state === "rate_limited")
    return (
      <CalmState
        testID="search-busy"
        icon="hourglass-outline"
        title="Too many searches at once"
        body={
          error?.retryAfter && error.retryAfter > 90
            ? "Try again in a few minutes."
            : "Try again in a minute."
        }
        action={{ label: "Try again", onPress: onRetry }}
      />
    );
  const chips = needs.length ? (
    <NeedCloud needs={needs} onPick={onNeed} variant="surface" label="Try one of these" />
  ) : undefined;
  if (state === "empty")
    return (
      <CalmState
        testID="search-empty"
        icon="search-outline"
        title={`Nothing for “${q}” yet`}
        body={needs.length ? "Try a simpler word, or one of these:" : "Try a simpler word, or ask it another way."}
      >
        {chips}
      </CalmState>
    );
  return (
    <CalmState
      testID="search-unavailable"
      icon="sparkles-outline"
      title="Search isn’t answering"
      body={
        needs.length
          ? "Finding moments by meaning isn’t available right now. Sermon titles still match, or try one of these:"
          : "Finding moments by meaning isn’t available right now. Sermon titles still match as you type."
      }
      action={{ label: "Try again", onPress: onRetry }}
    >
      {chips}
    </CalmState>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { width: "100%", maxWidth: 760, alignSelf: "center" },
  head: { paddingHorizontal: 24 },
  title: { marginTop: 6, color: c.text },
  field: { marginHorizontal: 20, marginTop: 14 },
  cloud: { marginTop: 18 },
  suggestTop: { marginTop: 10 },
  related: { marginTop: 8 },
  chipGhosts: { flexDirection: "row", gap: 8, paddingHorizontal: 24, overflow: "hidden" },
  chipGhost: { height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.border },
  // A little less inner spacing than the kit's default, so a path name of
  // the concept's length ("Breaking free from habitual sin") holds one line.
  path: { marginHorizontal: 20, marginTop: 16, gap: 12, paddingRight: 10 },
  pathList: { marginTop: 0, marginBottom: 10 },
  pathGhost: { height: 72, borderRadius: radius.r20, backgroundColor: c.media, overflow: "hidden" },
  statusWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: c.bg,
    opacity: 0.96,
    pointerEvents: "none",
  },
});

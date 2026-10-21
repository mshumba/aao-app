import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ListRenderItem,
  type TextInput,
} from "react-native";
import Animated, { LinearTransition, type CSSAnimationKeyframes } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount, useSaved } from "../auth/AccountProvider";
import { useGate } from "../auth/gate";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { NATIVE_VIDEO } from "../player/videoPlatform";
import { getCategory } from "../data/categories";
import { words } from "../data/display";
import { searchSermons, type Sermon } from "../data/sermons";
import { ChipRow, ItalicTitle, Kicker, NeedChip, PathCardNavy, SearchField, Strong, type ArtSource } from "../kit";
import {
  nextDay,
  teachingsLabel,
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
import { firstParam, requestWatch, takeSearchFocus, useFocusEffect, useGo, usePageTitle } from "../navigation";
import { useDockInset } from "../player/useDockInset";
import { c, textCap, type } from "../theme";
import { useToast } from "../toast";
import { sermonCount } from "../topics";
import { Heading, dockScrollPadding, web } from "../ui";
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
import { careText, inDistress, maybeDistress } from "./care";
import { CareCalm, CareCard } from "./CareCard";
import { FAN_MAX, SearchLoader, loaderText, warmArt, type LoaderStep } from "./Loader";
import { useStatusBar } from "../kit/statusBar";
import { AlsoRow, ResultCard } from "./ResultCard";
import { Reveal, RevealProvider, useResultsReveal } from "./reveal";

/**
 * "What are you going through?" (approved concept, screen 02).
 *
 * - Empty: common needs as a wrapping cloud, recent searches, and Browse
 *   by topic (which replaces the old Topics tab).
 * - Typing: "Search for “…”", needs that match, and sermon titles from the
 *   catalogue as you type. Nothing is sent until you press search or tap a
 *   need: meaning search runs on submit only.
 * - Searching: the question and its title fold away so the field sits at
 *   the top; nothing for the first 400ms (a quick answer never flashes a
 *   loader), then shuffling artwork over one honest line saying what search
 *   is doing, alone in the space below (Loader.tsx).
 * - Results: "Moments about …", related needs, "A path for this", the
 *   moments (his verbatim words, each playing from its minute; any whose
 *   quote didn't pass listed after them as "Also mentioned in"), then the
 *   sermons they're in, all rising in as one. Title matches stay listed for
 *   title-like questions.
 * - Someone who may be in distress (search says so, or their words plainly
 *   do) sees a calm card first, and never raw matches for their words.
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
/** A search answered sooner than this never shows the loader. */
const LOADER_AFTER_MS = 400;
/** When the loader's line moves on (ms since the search began). */
const SEARCHING_MS = 1400;
const CHOOSING_MS = 3200;
const SLOW_MS = 8000;

type Mode = "empty" | "typing" | "results";

type Row =
  | { key: string; kind: "cloud"; needs: Need[] }
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
  | { key: string; kind: "moment"; moment: SearchMoment; pending: boolean; saved: boolean; continued: boolean; lead: boolean }
  | { key: string; kind: "also"; moment: SearchMoment; first: boolean }
  | { key: string; kind: "state"; state: "offline" | "rate_limited" | "unavailable" | "empty"; q: string }
  | { key: string; kind: "care" }
  | { key: string; kind: "note"; text: string };

/** A row of a result set rises in with the rest (`reveal` staggers a moment card). */
type Item = Row & { reveal?: number };

/**
 * `guided`: one of the empty screen's guided paths, its kicker the length
 * (null when its line already says it); otherwise "A path for this".
 */
type PathCard = { id: string; name: string; meta: string; fan: ArtSource[]; guided?: { kicker: string | null } };

const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** What a screen reader hears first when the care card shows. */
const careAnnouncement = `${careText.title} ${careText.body}`;

type Mine = { done: number[]; finishedAt: string | null } | null | undefined;

/** Where you are on a path you've started: "You're on Day 3", or "Finished". */
function whereOn(total: number, mine: Mine) {
  return mine?.finishedAt ? "Finished" : mine ? `You're on Day ${nextDay(total, mine.done) ?? total}` : null;
}

/**
 * How long a path is, the way its page and the Paths tab say it: a guided
 * path counts days ("6 days"), a teaching series its teachings.
 */
function pathCount(total: number, series: boolean) {
  return series ? teachingsLabel(total) : `${total} day${total === 1 ? "" : "s"}`;
}

/**
 * "A path for this": "6 days", or where you are once you've started. A day
 * plays its whole sermon, so there's no "minutes a day" to promise, and a
 * draft carries no label.
 */
function pathMeta(total: number, mine: Mine, series = false) {
  return [pathCount(total, series), whereOn(total, mine)].filter(Boolean).join(" · ");
}

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
  // A tab says what its status bar is (Home's and Paths' are light).
  useStatusBar("dark");
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  const reduced = useReducedMotion();
  const go = useGo();
  const gate = useGate();
  const saved = useSaved();
  const userId = useAccount().user?.id ?? null;
  const toast = useToast();
  const { sermons, find } = useCatalogue();
  const { needs } = useNeeds();
  const recent = useRecentSearches();
  const { add: addRecent, clear: clearRecent, remove: removeRecent } = recent;
  const { progressFor } = useEnrollment();

  // Navigation, the gate, the saved list and the toast change identity
  // between renders; callbacks read the latest through a ref so the rows
  // they're passed to stay memoised.
  const latest = useRef({ go, gate, saved, toast, userId });
  useLayoutEffect(() => {
    latest.current = { go, gate, saved, toast, userId };
  });

  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState<string | null>(initialQuery.trim() || null);
  const [limit, setLimit] = useState<{ key: string; n: number }>({ key: "", n: 0 });
  const [showTopicNotice, setShowTopicNotice] = useState(unknownTopic);
  const [allNeeds, setAllNeeds] = useState(false);
  const { paths, daysOf } = usePaths();
  const input = useRef<TextInput>(null);
  const list = useRef<FlatList<Item>>(null);

  // The loader's fan: the newest sermons, fetched into the image cache now
  // (Home has usually shown them already), so it never waits on the network.
  const fanArt = useMemo(() => sermons.slice(0, FAN_MAX), [sermons]);
  useEffect(() => {
    warmArt(fanArt);
  }, [fanArt]);

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
  // A new question, or none (the field cleared), cancels the search before.
  const result = useSearch(mode === "results" ? submitted : null);
  const asked = mode === "results" ? submitted! : "";
  // Searching again after an error counts as a new search.
  const [tries, setTries] = useState(0);
  const searchRetry = result.retry;
  const retry = useCallback(() => {
    setTries((n) => n + 1);
    searchRetry();
  }, [searchRetry]);

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
      // Words said in distress aren't kept on the device to be seen again.
      if (!inDistress(value)) addRecent(value);
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

  // Keep pending writes across account changes; only the same account and sermon wait.
  const saving = useRef(new Set<string>());
  const toggleSave = useCallback(
    async (m: SearchMoment) => {
      const { gate, saved, toast, userId } = latest.current;
      const key = JSON.stringify([userId, m.youtubeId]);
      if (saving.current.has(key)) return;
      if (!gate.require({ kind: "save", sermonId: m.youtubeId })) return;
      saving.current.add(key);
      const next = !saved.isSaved(m.youtubeId);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      try {
        await saved.setSaved(m.youtubeId, next);
        if (latest.current.userId !== userId) return;
        toast(next ? "Saved" : "Removed from saved", next ? "bookmark" : "bookmark-outline");
      } catch {
        if (latest.current.userId !== userId) return;
        toast(
          next ? "Couldn’t save. Check your connection." : "Couldn’t remove it. Check your connection.",
          "alert-circle-outline",
        );
      } finally {
        saving.current.delete(key);
      }
    },
    [],
  );

  const openPath = useCallback(
    (id: string) => latest.current.go.push(`/path/${encodeURIComponent(id)}` as Href),
    [],
  );

  // ---- What we understood ----------------------------------------------------------------

  const answer = mode === "results" && result.status === "success" ? result.data : null;
  // The phones list only sermons whose video is on R2 (CatalogueProvider).
  const data = useMemo(() => {
    if (!answer || !NATIVE_VIDEO) return answer;
    const ready = (id: string) => !!find(id)?.videoReady;
    return {
      ...answer,
      moments: answer.moments.filter((m) => ready(m.youtubeId)),
      sermons: answer.sermons.filter((s) => ready(s.youtubeId)),
    };
  }, [answer, find]);
  // A need is understood before search answers; anything else once it has.
  const needTheme = mode === "results" ? needFor(asked)?.theme : undefined;
  // The person's own words stay as they typed them ("Apostolic", not "apostolic").
  const understood = data?.understood.theme || needTheme;
  const theme = understood && same(understood, asked) ? asked : understood;

  // Someone who may be in distress: search says so, or their words plainly
  // do (in case search can't answer, or answers without saying), or search
  // couldn't answer words that may mean it (failing closed).
  const distress = mode === "results" && inDistress(asked);
  const care =
    distress || data?.care === true || (mode === "results" && result.status === "error" && maybeDistress(asked));

  // ---- While search works ----------------------------------------------------------------

  // Nothing for the first 400ms, then the loader, its line moving on with
  // what search is doing. A retry is a new search.
  const loadingKey = result.status === "loading" ? `${asked.toLocaleLowerCase()}#${tries}` : "";
  const [loading, setLoading] = useState<{ key: string; step: LoaderStep }>({ key: "", step: 0 });
  useEffect(() => {
    if (!loadingKey) return;
    const at = (ms: number, step: LoaderStep) => setTimeout(() => setLoading({ key: loadingKey, step }), ms);
    const timers = needTheme
      ? [at(LOADER_AFTER_MS, 1)]
      : [at(LOADER_AFTER_MS, 0), at(SEARCHING_MS, 1)];
    timers.push(at(CHOOSING_MS, 2), at(SLOW_MS, 3));
    return () => timers.forEach(clearTimeout);
  }, [loadingKey, needTheme]);
  const loaderStep = loadingKey && loading.key === loadingKey ? loading.step : null;

  // ---- What was found --------------------------------------------------------------------

  // Sermon titles that match (a title-like question), never for someone in distress.
  const showTitles = !care && !(mode === "typing" && inDistress(trimmed));
  const momentsFound = data?.moments.length ?? 0;
  // Sermons search found, and the title matches listed beside them.
  const sermonsFound = data
    ? new Set([...data.sermons.map((x) => x.youtubeId), ...(showTitles ? titles.map((x) => x.id) : [])]).size
    : 0;

  // (For someone in distress, only search's own reading: never their words back.)
  const helper = useMemo(
    () =>
      !data || (care && !data.care) ? undefined : momentsFound ? (
        <>
          Moments about <Strong>{theme || asked}</Strong>
        </>
      ) : data.sermons.length ? (
        <>
          Sermons about <Strong>{theme || asked}</Strong>
        </>
      ) : undefined,
    [data, care, momentsFound, theme, asked],
  );

  const outcome =
    mode !== "results"
      ? ""
      : result.status === "loading"
        ? loaderStep === null
          ? ""
          : loaderText(loaderStep, sermons.length, needTheme)
        : data
          ? momentsFound
            ? `${momentsFound} moment${momentsFound === 1 ? "" : "s"} found`
            : sermonsFound
              ? `${sermonCount(sermonsFound)} found`
              : care
                ? careText.failed
                : `Nothing found for ${asked} yet`
          : result.status === "error"
            ? care
              ? careText.failed
              : errorTitle(result.error)
            : "";
  // Someone in distress hears the care card first: as soon as they search
  // (their words said it), and again before what was found.
  const status = !care
    ? outcome
    : result.status === "loading"
      ? loaderStep === null
        ? careAnnouncement
        : outcome
      : `${careAnnouncement} ${outcome}`.trim();

  // VoiceOver has no live regions: announce what the live region says, the
  // loader's steps queued behind whatever is being read.
  useEffect(() => {
    if (Platform.OS !== "ios" || !status) return;
    const timer = setTimeout(
      () => AccessibilityInfo.announceForAccessibilityWithOptions(status, { queue: result.status === "loading" }),
      400,
    );
    return () => clearTimeout(timer);
  }, [status, result.status]);

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
    const meta = pathMeta(total, progress, known?.kind === "series");
    const front = pathDays[today - 1] ?? pathDays[0];
    const behind = pathDays[today - 2] ?? pathDays[today] ?? pathDays[1];
    const fan = [front, behind]
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => d.sermon ?? { id: d.youtubeId });
    return { id: found.id, name: found.name, meta, fan };
  }, [found, known, pathDays, progressFor]);

  // The empty screen's guided paths: the dark compact cards, in the
  // editor's order. The heading already says they're guided paths, so each
  // leads with its length, then where you are on it, or its promise; a
  // promise that gives the length ("Five days on…") says it alone.
  const emptyPaths = useMemo<PathCard[]>(
    () =>
      paths
        .filter((path) => path.kind !== "series")
        .slice(0, EMPTY_PATHS)
        .map((path) => {
          const days = daysOf(path.id);
          const total = path.dayCount || days.length;
          const meta = whereOn(total, progressFor(path.id)) ?? path.promise;
          const fan = days.slice(0, 2).map((d) => ({ id: d.youtubeId }) as ArtSource);
          const count = pathCount(total, false);
          const said = words(meta).includes(words(count));
          return { id: path.id, name: path.name, meta, fan, guided: { kicker: said ? null : count } };
        }),
    [paths, daysOf, progressFor],
  );

  const isSaved = saved.isSaved;
  // The keys of the title and need rows last listed (placeKeys): as you
  // type, a row still listed stays as it is, and a newcomer is drawn into a
  // row that went, rather than one being taken down and another built.
  const [titleKeys] = useState(() => new Map<string, string>());
  const [needKeys] = useState(() => new Map<string, string>());
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const titleKey = `${mode}:${typed.toLocaleLowerCase()}`;
    const titleBlock = (initial: number, heading = "Sermons") => {
      if (!titles.length || !showTitles) return [] as string[];
      const n = limit.key === titleKey ? limit.n : initial;
      out.push({
        key: "titles-h",
        kind: "heading",
        title: heading,
        count: sermonCount(titles.length),
        countTestID: "result-count",
      });
      const shown = titles.slice(0, n);
      const keys = placeKeys(shown.map((t) => t.id), titleKeys, "t-");
      shown.forEach((sermon, i) => out.push({ key: keys.get(sermon.id)!, kind: "sermon", sermon, first: i === 0 }));
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
      const matched = needs
        .filter((n) => `${n.label} ${n.short} ${n.theme}`.toLocaleLowerCase().includes(t))
        .slice(0, 3);
      const keys = placeKeys(matched.map((m) => m.id), needKeys, "n-");
      matched.forEach((need) => out.push({ key: keys.get(need.id)!, kind: "need", need, first: false }));
      // No title matches is fine: "Search for “…”" above says what Return does.
      if (titles.length) titleBlock(TYPING_ROWS);
      return out;
    }

    // Results. While search works the loader shows alone, under the field
    // (the list's empty view); everything else arrives with the results.
    if (result.status === "loading") return out;

    if (result.status === "error") {
      // Someone in distress gets one calm line, never other needs or titles.
      if (care) {
        out.push({ key: "care", kind: "care" });
        return out;
      }
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
        // What's listed: "14 found", or "Top 14" when more matched.
        count: all > shown ? `Top ${shown}` : `${shown} found`,
        spoken: all > shown ? `Top ${shown} of ${all} moments` : `${shown} moment${shown === 1 ? "" : "s"} found`,
      });
      // His words first; a moment whose quote didn't pass (none, and none
      // on its way) is listed after them, never as an empty card.
      const quoted = data.moments.filter((m) => m.quote || result.pendingQuotes.has(m.id));
      const bare = data.moments.filter((m) => !m.quote && !result.pendingQuotes.has(m.id));
      quoted.forEach((m, i) =>
        out.push({
          key: `m-${m.id}`,
          kind: "moment",
          moment: m,
          pending: result.pendingQuotes.has(m.id),
          saved: isSaved(m.youtubeId),
          continued: i > 0 && quoted[i - 1].youtubeId === m.youtubeId,
          lead: i === 0,
          reveal: i,
        }),
      );
      if (bare.length) {
        out.push({ key: "also-h", kind: "heading", title: "Also mentioned in" });
        bare.forEach((m, i) => out.push({ key: `a-${m.id}`, kind: "also", moment: m, first: i === 0 }));
      }
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
    // A care answer always holds the comfort list; one with nothing in it means
    // search was down, so it says so and offers Try again.
    if (!data.moments.length && !found.length && !listed.size)
      out.push(care ? { key: "care", kind: "care" } : { key: "state", kind: "state", state: "empty", q: asked });
    // The result set rises in as one.
    return out.map((item) => (item.reveal === undefined ? { ...item, reveal: 0 } : item));
  }, [mode, typed, trimmed, titles, showTitles, limit, needs, allNeeds, recent.recent, emptyPaths, result.status, result.error, result.pendingQuotes, data, care, pathCard, asked, isSaved, needFor, titleKeys, needKeys]);
  // The list draws a step behind the field: a keystroke shows in the field
  // at once, and the rows follow in the background, so typing never waits
  // on them (and the list is left alone while they would come out the same).
  // Which result set they are comes with them, so a set's rows are only ever
  // drawn as that set: going back to a kept answer swaps one set for another
  // in a single step.
  const landed = data ? `${asked.toLocaleLowerCase()}#${tries}` : "";
  const latestRows = useMemo(() => ({ items, landed }), [items, landed]);
  const drawn = useDeferredValue(latestRows);
  const rows = drawn.items;

  // ---- Results arriving ------------------------------------------------------------------

  // Each new result set rises in once, with a selection tick.
  const reveal = useResultsReveal(drawn.landed, reduced);
  useEffect(() => {
    if (drawn.landed && Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  }, [drawn.landed]);

  // ---- Rows ------------------------------------------------------------------------------

  const showAllNeeds = useCallback(() => setAllNeeds(true), []);
  const showMore = useCallback((key: string, n: number) => setLimit({ key, n }), []);
  const fourNeeds = useMemo(() => needs.slice(0, 4), [needs]);
  const actions = useMemo<RowActions>(
    () => ({
      pickNeed,
      pickRelated,
      run,
      clearRecent,
      removeRecent,
      showAllNeeds,
      showMore,
      openSermon,
      openPath,
      openMoment,
      play,
      toggleSave,
      retry,
      error: result.error,
      fourNeeds,
    }),
    [pickNeed, pickRelated, run, clearRecent, removeRecent, showAllNeeds, showMore, openSermon, openPath, openMoment, play, toggleSave, retry, result.error, fourNeeds],
  );
  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item }) => <SearchRow item={item} actions={actions} />,
    [actions],
  );

  // ---- The page's top: the question and the field ---------------------------------------

  // The field and what sits under it change with every keystroke; they reach
  // the list's header through context, so the list itself (and its rows)
  // draws only when the rows do.
  const collapsed = mode === "results";
  const top = useMemo<Top>(
    () => ({
      inset: insets.top,
      collapsed,
      reduced,
      notice: showTopicNotice,
      input,
      query,
      setQuery,
      run,
      clear,
      helper,
      care,
      status,
    }),
    [insets.top, collapsed, reduced, showTopicNotice, query, run, clear, helper, care, status],
  );
  const loader: Loading = useMemo(
    () => ({ step: loaderStep, art: fanArt, sermons: sermons.length, theme: needTheme, reduced }),
    [loaderStep, fanArt, sermons.length, needTheme, reduced],
  );

  return (
    <View style={styles.screen}>
      <RevealProvider value={reveal}>
        <TopContext.Provider value={top}>
          <LoadingContext.Provider value={loader}>
            <SearchList
              listRef={list}
              rows={rows}
              renderItem={renderItem}
              dock={dock}
              // While typing, rows take new matches in place: nothing eases about.
              ease={!reduced && mode !== "typing"}
            />
          </LoadingContext.Provider>
        </TopContext.Provider>
      </RevealProvider>
      {/* Content scrolls under the status bar onto ivory, never under the clock. */}
      <View style={[styles.statusWash, { height: insets.top }]} />
    </View>
  );
}

const keyOf = (item: Item) => item.key;

/**
 * Keys for a list that changes as you type (`ids`, in order), given the
 * keys it had last (`book`, updated to these): an id still listed keeps its
 * key, and a newcomer takes the key of one no longer listed (or a new one).
 * A row still listed is then left alone, and a newcomer is drawn into a row
 * that went instead of one being taken down and another built.
 */
function placeKeys(ids: readonly string[], book: Map<string, string>, prefix: string) {
  const kept = new Map<string, string>();
  for (const id of ids) {
    const key = book.get(id);
    if (key) kept.set(id, key);
  }
  const used = new Set(kept.values());
  const free = [...book.values()].filter((key) => !used.has(key));
  let n = 0;
  const fresh = () => {
    let key = `${prefix}${n++}`;
    while (used.has(key)) key = `${prefix}${n++}`;
    return key;
  };
  book.clear();
  for (const id of ids) {
    const key = kept.get(id) ?? free.shift() ?? fresh();
    used.add(key);
    book.set(id, key);
  }
  return book;
}

/** What the list's header draws: the question, the field and what's under it. */
type Top = {
  inset: number;
  /** Results (or a search on its way): the question folds away. */
  collapsed: boolean;
  reduced: boolean;
  notice: boolean;
  input: RefObject<TextInput | null>;
  query: string;
  setQuery: (text: string) => void;
  run: (text: string) => void;
  clear: () => void;
  helper: ReactNode;
  care: boolean;
  status: string;
};

/** The loader's state, for the list's empty view. */
type Loading = {
  step: LoaderStep | null;
  art: readonly ArtSource[];
  sermons: number;
  theme?: string;
  reduced: boolean;
};

const TopContext = createContext<Top | null>(null);
const LoadingContext = createContext<Loading | null>(null);

/**
 * The list, drawn again only when its rows (or the dock) change: never for
 * a keystroke on its own, which only the header (ListTop) follows.
 */
const SearchList = memo(function SearchList({
  listRef,
  rows,
  renderItem,
  dock,
  ease,
}: {
  listRef: RefObject<FlatList<Item> | null>;
  rows: Item[];
  renderItem: ListRenderItem<Item>;
  dock: number;
  /** A late quote or a card arriving eases the cards below into place. */
  ease: boolean;
}) {
  const layout = useMemo(() => (ease ? LinearTransition.duration(200) : undefined), [ease]);
  const style = useMemo(() => dockScrollPadding(dock), [dock]);
  const content = useMemo(() => [styles.content, { paddingBottom: 48 + dock }], [dock]);
  return (
    <Animated.FlatList
      ref={listRef}
      data={rows}
      renderItem={renderItem}
      itemLayoutAnimation={layout}
      keyExtractor={keyOf}
      ListHeaderComponent={ListTop}
      ListEmptyComponent={ListLoader}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
      style={style}
      contentContainerStyle={content}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={9}
      removeClippedSubviews={Platform.OS === "android"}
    />
  );
});

/** The page's top: the question (folded away for results), the field and what's under it. */
function ListTop() {
  const top = useContext(TopContext);
  if (!top) return null;
  return (
    <View style={{ paddingTop: top.inset + (top.inset ? 8 : 28) }}>
      <SearchTitle collapsed={top.collapsed} reduced={top.reduced} />
      {top.notice ? (
        <Note icon="pricetags-outline">That topic link is out of date. Browse the topics below, or ask in your own words.</Note>
      ) : null}
      <SearchField
        inputRef={top.input}
        testID="search-input"
        value={top.query}
        onChangeText={top.setQuery}
        onSubmit={top.run}
        onClear={top.clear}
        active={top.collapsed}
        prompt="Say it in your own words"
        helper={top.helper}
        helperIcon="checkmark"
        style={styles.field}
      />
      {top.care ? <CareCard /> : null}
      <LiveStatus text={top.status} />
    </View>
  );
}

/**
 * While search works, the list has no rows: the loader shows alone, centred
 * in the space under the field. (Nothing, for the first 400ms.)
 */
function ListLoader() {
  const loading = useContext(LoadingContext);
  return (
    <View style={styles.loading}>
      {loading && loading.step !== null ? (
        <SearchLoader
          art={loading.art}
          step={loading.step}
          sermons={loading.sermons}
          theme={loading.theme}
          reduced={loading.reduced}
        />
      ) : null}
    </View>
  );
}

const QUESTION = "What are you going through?";
const FOLD_MS = 200;

/**
 * A laid-out height kept outside React state, so measuring never redraws:
 * only the next render that needs it (a fold) reads it.
 */
class Measured {
  height = -1;
  read = (e: LayoutChangeEvent) => {
    this.height = e.nativeEvent.layout.height;
  };
}

/** The fold's two movements, between none of the title and all of its `height`. */
function foldKeyframes(collapsed: boolean, height: number): CSSAnimationKeyframes {
  const shut = { height: 0, opacity: 0 };
  const open = { height, opacity: 1 };
  return collapsed ? { from: open, to: shut } : { from: shut, to: open };
}

/**
 * "What are you going through?", the same at every keystroke. With results
 * it folds away (height and opacity, 200ms; at once under Reduce Motion), so
 * the field sits at the top and the results have the room; screen readers
 * still find the page's heading.
 *
 * The fold is a CSS animation on the UI thread from the title's measured
 * height, ending on the plain style React holds (none of the title, or its
 * natural height). Nothing is handed back to React as it settles, unlike a
 * settled animated style, which Reanimated re-renders a second or so later;
 * and measuring the title, which a fold only reads, never redraws it. A page
 * that opens on a question starts folded, without moving.
 */
const SearchTitle = memo(function SearchTitle({ collapsed, reduced }: { collapsed: boolean; reduced: boolean }) {
  // The title's own height once laid out (-1 until then), outside React state.
  const [measured] = useState(() => new Measured());
  // The last fold, set as `collapsed` changes (none before any, before the
  // title was laid out, or under Reduce Motion): a redraw for anything else
  // never replays it.
  const [last, setLast] = useState<{ collapsed: boolean; keyframes: CSSAnimationKeyframes | null }>({
    collapsed,
    keyframes: null,
  });
  if (last.collapsed !== collapsed)
    setLast({ collapsed, keyframes: reduced || measured.height < 0 ? null : foldKeyframes(collapsed, measured.height) });
  const rest = collapsed ? styles.folded : null;
  const fold =
    reduced || !last.keyframes
      ? rest
      : [
          rest,
          {
            animationName: last.keyframes,
            animationDuration: FOLD_MS,
            animationTimingFunction: "ease-out",
          } as const,
        ];
  const hide = collapsed
    ? ({ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants", ...web({ "aria-hidden": true }) } as const)
    : null;
  return (
    <>
      <Animated.View testID="search-question" style={[styles.fold, fold]} {...hide}>
        <View style={styles.head} onLayout={measured.read}>
          <Kicker>Search by what you need</Kicker>
          <ItalicTitle
            text={QUESTION}
            italic="going through?"
            breakBeforeItalic
            accessibilityRole="header"
            {...web({ "aria-level": 1 })}
            style={[type.title, styles.title]}
            maxFontSizeMultiplier={textCap.display}
          />
        </View>
      </Animated.View>
      {collapsed ? (
        <Heading level={1} style={styles.hidden}>
          {QUESTION}
        </Heading>
      ) : null}
    </>
  );
});

/** What the rows can do: the screen's handlers, the same from one keystroke to the next. */
type RowActions = {
  pickNeed: (need: Need) => void;
  pickRelated: (label: string) => void;
  run: (text: string) => void;
  clearRecent: () => void;
  removeRecent: (q: string) => void;
  showAllNeeds: () => void;
  showMore: (limitKey: string, n: number) => void;
  openSermon: (id: string) => void;
  openPath: (id: string) => void;
  openMoment: (m: SearchMoment) => void;
  play: (m: SearchMoment) => void;
  toggleSave: (m: SearchMoment) => void;
  retry: () => void;
  error: LearningError | null;
  fourNeeds: Need[];
};

/**
 * Two descriptions of a row that draw the same: every field identical, a
 * list (the cloud's needs, related needs) item by item.
 */
function sameRow(a: Item, b: Item) {
  if (a === b) return true;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((k) => {
    const u = x[k];
    const v = y[k];
    if (Object.is(u, v)) return true;
    return Array.isArray(u) && Array.isArray(v) && u.length === v.length && u.every((e, i) => Object.is(e, v[i]));
  });
}

/**
 * One row of the list. Each keystroke or answer describes every row anew,
 * so a row draws again only when its own description changed, never just
 * because the list did; scrolling never redraws the rows already there.
 * A result set's rows rise in together (reveal.tsx), never one by one as
 * the list draws them.
 */
const SearchRow = memo(
  function SearchRow({ item, actions }: { item: Item; actions: RowActions }) {
    const row = rowFor(item, actions);
    return item.reveal === undefined ? row : <Reveal order={item.reveal}>{row}</Reveal>;
  },
  (a, b) => a.actions === b.actions && sameRow(a.item, b.item),
);

function rowFor(item: Item, actions: RowActions) {
  switch (item.kind) {
    case "cloud":
      return (
        <View style={styles.cloud}>
          <NeedCloud needs={item.needs} onPick={actions.pickNeed} />
        </View>
      );
    case "heading":
      return (
        <ListHeading
          title={item.title}
          count={item.count}
          spokenCount={item.spoken}
          countTestID={item.countTestID}
          action={
            item.clear
              ? { label: "Clear", onPress: actions.clearRecent, hint: "Clears your recent searches" }
              : undefined
          }
        />
      );
    case "allNeeds":
      return <MoreButton label={item.label} onPress={actions.showAllNeeds} />;
    case "recent":
      return (
        <SuggestRow
          icon="time-outline"
          strong={item.q}
          label={`Search again: ${item.q}`}
          onPress={() => actions.run(item.q)}
          onRemove={() => actions.removeRecent(item.q)}
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
            onPress={() => actions.run(item.q)}
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
          onPress={() => actions.pickNeed(item.need)}
          first={item.first}
        />
      );
    case "sermon":
      return <SermonResult sermon={item.sermon} onOpen={actions.openSermon} first={item.first} />;
    case "found":
      return <FoundSermon sermon={item.sermon} onOpen={actions.openSermon} first={item.first} />;
    case "more":
      return <MoreButton label={item.label} onPress={() => actions.showMore(item.limitKey, item.next)} />;
    case "related":
      return (
        <ChipRow label="Related needs" style={styles.related}>
          {item.labels.map((label) => (
            <NeedChip key={label} label={label} variant="outline" onPress={() => actions.pickRelated(label)} />
          ))}
        </ChipRow>
      );
    case "path":
      return (
        <PathCardNavy
          variant="compact"
          testID={item.card.guided ? "guided-path" : "search-path"}
          kicker={item.card.guided ? item.card.guided.kicker : undefined}
          name={item.card.name}
          meta={item.card.meta}
          fan={item.card.fan}
          onPress={() => actions.openPath(item.card.id)}
          style={[styles.path, item.card.guided ? styles.pathList : null]}
        />
      );
    case "moment":
      return (
        <ResultCard
          moment={item.moment}
          quotePending={item.pending}
          saved={item.saved}
          continued={item.continued}
          lead={item.lead}
          onPlay={actions.play}
          onOpen={actions.openMoment}
          onToggleSave={actions.toggleSave}
        />
      );
    case "also":
      return <AlsoRow moment={item.moment} first={item.first} onPlay={actions.play} onOpen={actions.openMoment} />;
    case "note":
      return <Note>{item.text}</Note>;
    case "care":
      return <CareCalm onRetry={actions.retry} />;
    case "state":
      return (
        <SearchProblem
          state={item.state}
          q={item.q}
          error={actions.error}
          needs={actions.fourNeeds}
          onNeed={actions.pickNeed}
          onRetry={actions.retry}
        />
      );
  }
}

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
      return busyTitle(error);
    default:
      return "Search isn’t answering";
  }
}

/**
 * Over a limit, never put as the person's doing: the allowance everyone
 * shares, or this account's or connection's (a church's Wi-Fi is one).
 */
function busyTitle(error: LearningError | null) {
  return error?.scope === "everyone" ? "Search is busy for everyone right now" : "Search needs a moment";
}

/** The calm states: offline, busy, unavailable, or nothing found. */
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
        title={busyTitle(error)}
        body={
          error?.scope === "everyone"
            ? "Try again in a few minutes. Sermon titles still match as you type."
            : error?.retryAfter && error.retryAfter > 90
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
  content: { width: "100%", maxWidth: 760, alignSelf: "center", flexGrow: 1 },
  // The title folds into this (overflow hidden) as results arrive.
  fold: { overflow: "hidden" },
  folded: { height: 0, opacity: 0 },
  head: { paddingHorizontal: 24 },
  title: { marginTop: 6, color: c.text },
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", left: -1, top: 0 },
  // Fills what's under the field, so the loader sits in the middle of it.
  loading: { flex: 1, justifyContent: "center", paddingBottom: 48 },
  field: { marginHorizontal: 20, marginTop: 14 },
  cloud: { marginTop: 18 },
  suggestTop: { marginTop: 10 },
  related: { marginTop: 8 },
  // A little less inner spacing than the kit's default, so a path name of
  // the concept's length ("Breaking free from habitual sin") holds one line.
  path: { marginHorizontal: 20, marginTop: 16, gap: 12, paddingRight: 10 },
  pathList: { marginTop: 0, marginBottom: 10 },
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

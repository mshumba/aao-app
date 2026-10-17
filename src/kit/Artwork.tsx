import { requireOptionalNativeModule } from "expo";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Image as RNImage,
  PixelRatio,
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";
import { artworkTint } from "../data/artwork";
import { artOverride, pillarboxed } from "../data/artworkFixes";
import { artFade, artRadius, c, font, shadows, tabular, textCap } from "../theme";
import { T, web } from "./base";

/**
 * expo-image when this build has it (memory and disk cache, recycling,
 * a 200ms fade), else React Native's Image with the same fade. A development
 * build made before expo-image was added keeps working until it's rebuilt.
 */
type ExpoImageType = typeof import("expo-image").Image;
export const ExpoImage: ExpoImageType | null =
  Platform.OS === "web" || requireOptionalNativeModule("ExpoImage")
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("expo-image") as typeof import("expo-image")).Image
    : null;

const AnimatedImage = Animated.createAnimatedComponent(RNImage);

/** Anything with an id and artwork: a Sermon, a search sermon mapped to this. */
export type ArtSource = { id: string; thumbnail?: string | null };

/**
 * YouTube serves every video's artwork in several sizes: mq 320×180, hq
 * 480×360 and sd 640×480 (both 4:3 with bars, which the 16:9 crop removes),
 * and maxres 1280×720; and the same ladder for three frames from the video
 * (mq2, hq2…: see data/artworkFixes.ts). A tile takes the smallest copy
 * that is sharp at this screen's density, never a larger one than the
 * source names (an old video may have no sd or maxres). The full-width hero
 * art comes as WebP, about a third lighter; the JPEG stands behind it (see
 * artCandidates).
 */
const LADDER = ["mq", "hq", "sd", "maxres"] as const;
const YT = /^https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([^/]+)\/(maxres|sd|hq|mq)(default|[123])\.(?:jpg|webp)$/;

export function sizedArt(uri: string, width?: number) {
  if (!width) return uri;
  const match = YT.exec(uri);
  if (!match) return uri;
  const px = width * PixelRatio.get();
  const want = px <= 320 ? 0 : px <= 480 ? 1 : px <= 640 ? 2 : 3;
  const step = LADDER[Math.min(want, LADDER.indexOf(match[2] as (typeof LADDER)[number]))];
  return `https://i.ytimg.com/vi/${match[1]}/${step}${match[3]}.jpg`;
}

/**
 * The copies to try in order: the sized one (as WebP for the big maxres
 * copy), then the source's own, then YouTube's hq copy, which every video
 * has. A copy that fails to load moves on to the next.
 */
export function artCandidates(art: ArtSource, width?: number) {
  const source = artUri(art);
  const sized = sizedArt(source, width);
  const list: string[] = [];
  const match = YT.exec(sized);
  if (match && match[2] === "maxres" && match[3] === "default" && width && width > 480)
    list.push(`https://i.ytimg.com/vi_webp/${match[1]}/maxresdefault.webp`);
  list.push(sized, source, `https://i.ytimg.com/vi/${art.id}/hqdefault.jpg`);
  return [...new Set(list)];
}

/**
 * The art for an id: a hand-checked replacement where the source's is
 * wrong, else the source's thumbnail, else YouTube's standard copy.
 */
export function artUri(art: ArtSource) {
  return artOverride[art.id] ?? (art.thumbnail || `https://i.ytimg.com/vi/${art.id}/hqdefault.jpg`);
}

/**
 * How much of the frame's width the poster fills, for art that's a poster
 * with black bars down both sides (scripts/flag-artwork.py); else undefined.
 */
function posterShare(art: ArtSource) {
  return artOverride[art.id] ? undefined : pillarboxed[art.id];
}

// ---- What's already on this device -------------------------------------------------

/**
 * Copies drawn this session (expo-image keeps them in memory) or found in
 * its disk cache: drawn at once, without the fade, which is only for art
 * that has to be fetched. The web can't tell what the browser has cached,
 * so there only this session's copies count. Each copy's cache is asked
 * once: the answer stands until the copy is drawn.
 */
const onDevice = new Set<string>();
const notOnDevice = new Set<string>();
const checking = new Map<string, Promise<boolean>>();
const canCheck = Platform.OS !== "web" && !!ExpoImage;

function inCache(uri: string): Promise<boolean> {
  let check = checking.get(uri);
  if (!check) {
    check = ExpoImage!
      .getCachePathAsync(uri)
      .then(
        (path) => {
          if (path) onDevice.add(uri);
          else notOnDevice.add(uri);
          return !!path;
        },
        () => false,
      )
      .finally(() => checking.delete(uri));
    checking.set(uri, check);
  }
  return check;
}

/**
 * Asking the cache holds the art back a moment and draws it twice, so it's
 * only for what's on screen at once: everything until the app's first
 * screen is up (the splash lifts onto it whole: src/app/_layout.tsx), then
 * a screen's main art (priority "high": the hero, a sermon's stage, a
 * path's cover). A list's tiles draw at once, fading in unless they were
 * drawn earlier this session.
 */
let firstScreen = true;

/** The app's first screen is up: from now on only main art asks the cache. */
export function firstScreenShown() {
  firstScreen = false;
}

/** What's known at once: true, false, or null until the cache has been asked. */
function knownNow(uri: string | null, ask: boolean) {
  if (!uri) return false;
  if (onDevice.has(uri)) return true;
  return ask && canCheck && !notOnDevice.has(uri) ? null : false;
}

/**
 * Whether the art at `uri` is already on this device: true or false, or
 * null for the moment asking expo-image's cache takes (a frame or so).
 * `ask: false` doesn't wait for the cache: only this session's copies count.
 */
export function useArtOnDevice(uri: string | null, ask = true): boolean | null {
  const [found, setFound] = useState(() => ({ uri, on: knownNow(uri, ask) }));
  const on = found.uri === uri ? found.on : knownNow(uri, ask);
  useEffect(() => {
    if (!uri || on !== null) return;
    let alive = true;
    inCache(uri).then((hit) => {
      if (alive) setFound({ uri, on: hit });
    });
    return () => {
      alive = false;
    };
  }, [uri, on]);
  return on;
}

/** The blur behind a poster shown alone (styles.backdropShade darkens it a little). */
const BACKDROP_BLUR = 20;

const FadeImage = memo(function FadeImage({
  uri,
  recyclingKey,
  priority,
  share,
  onError,
  onLoad,
}: {
  uri: string;
  recyclingKey: string;
  priority: "low" | "normal" | "high";
  /** A poster with bars: the share of the width it fills (see posterShare). */
  share?: number;
  onError: () => void;
  onLoad?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  // Set once per copy (FadeImage is keyed by it): a changed transition
  // would make expo-image load the image again.
  const [ask] = useState(() => firstScreen || priority === "high");
  const cached = useArtOnDevice(uri, ask);
  const onLoaded = useCallback(() => {
    onDevice.add(uri);
    onLoad?.();
  }, [uri, onLoad]);
  // The tint for the moment the cache takes to answer.
  if (ExpoImage && cached === null) return null;
  // A copy of the image filling `style`. Blurred, it's the backdrop: only
  // the copy in front reports loading or failing.
  const draw = (style: StyleProp<ImageStyle>, blurRadius?: number) =>
    ExpoImage ? (
      <ExpoImage
        source={{ uri }}
        style={style}
        contentFit="cover"
        transition={cached ? 0 : artFade}
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey}
        priority={priority}
        blurRadius={blurRadius}
        onError={blurRadius ? undefined : onError}
        onLoad={blurRadius ? undefined : onLoaded}
        accessible={false}
      />
    ) : (
      <AnimatedImage
        source={{ uri }}
        style={[
          style,
          {
            opacity: loaded ? 1 : 0,
            transitionProperty: "opacity",
            transitionDuration: artFade,
          },
        ]}
        resizeMode="cover"
        blurRadius={blurRadius}
        accessible={false}
        onLoad={
          blurRadius
            ? undefined
            : () => {
                setLoaded(true);
                onLoad?.();
              }
        }
        onError={blurRadius ? undefined : onError}
      />
    );
  if (!share) return draw(StyleSheet.absoluteFill);
  // A poster with black bars down its sides: the poster alone, centred and
  // clipped out of the frame, over the same image scaled up until the
  // poster fills the width, blurred and a little darker. One download.
  const side = (1 - share) / 2;
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { transform: [{ scale: 1 / share }] }]}>
        {draw(StyleSheet.absoluteFill, BACKDROP_BLUR)}
      </View>
      <View style={styles.backdropShade} />
      <View style={[styles.poster, { left: `${side * 100}%`, width: `${share * 100}%` }]}>
        {draw([styles.posterImage, { left: `${(-side / share) * 100}%`, width: `${100 / share}%` }])}
      </View>
    </>
  );
});

export type ArtworkProps = {
  /** The sermon (or any `{ id, thumbnail }`). Nothing shows the tint alone. */
  art: ArtSource | null | undefined;
  /** A fixed width in points; the height is always 9/16 of it. Omit to fill the width. */
  width?: number;
  /** Corner radius; by default the ladder for this width (theme.artRadius). */
  radius?: number;
  /** A chip over the art ("2 hr 8 min", "1 hr 12 min left"). */
  chip?: string | null;
  /** Bottom-left (the default with progress) or bottom-right. */
  chipAt?: "start" | "end";
  /** Watched part, 0 to 1: a 4pt bar along the bottom edge. */
  progress?: number | null;
  /** "art": the printed-poster lift (on ivory); "hairline": an inner edge only. */
  lift?: "none" | "hairline" | "art";
  /** Shown in white on the tint if the image can't load (the short headline). */
  fallback?: string;
  priority?: "low" | "normal" | "high";
  /** false: the sermon's tint only, the image not fetched yet (a pager's later pages). */
  load?: boolean;
  /** Once the image has loaded (or can't), for whatever waits on it. */
  onSettled?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Sermon artwork in a fixed 16:9 box, so nothing shifts as it loads: the
 * sermon's dark tint first, then the image, at once if it's already on the
 * device, else fading in over 200ms. Decorative: the row or card holding it
 * carries the words.
 */
export const Artwork = memo(function Artwork({
  art,
  width,
  radius,
  chip,
  chipAt,
  progress,
  lift = "hairline",
  fallback,
  priority = "normal",
  load = true,
  onSettled,
  style,
  testID,
}: ArtworkProps) {
  const candidates = useMemo(() => (art ? artCandidates(art, width) : []), [art, width]);
  const share = art ? posterShare(art) : undefined;
  // Which copy failed last: the next one is tried, until none is left.
  const [failed, setFailed] = useState<{ key: string; count: number } | null>(null);
  const key = candidates.join(" ");
  const tries = failed && failed.key === key ? failed.count : 0;
  const uri = load ? (candidates[tries] ?? null) : null;
  const onError = useCallback(() => {
    setFailed((was) => ({ key, count: (was && was.key === key ? was.count : 0) + 1 }));
    if (tries + 1 >= candidates.length) onSettled?.();
  }, [key, tries, candidates.length, onSettled]);
  const r = radius ?? artRadius(width ?? 342);
  const box: ViewStyle = width
    ? { width, height: Math.round((width * 9) / 16) }
    : { width: "100%", aspectRatio: 16 / 9 };
  const tint = (art && artworkTint[art.id]) || c.artTint;
  const showProgress = progress != null && progress > 0;
  const at = chipAt ?? (showProgress ? "start" : "end");
  const broken = load && candidates.length > 0 && tries >= candidates.length;

  return (
    <View
      testID={testID}
      style={[box, { borderRadius: r }, lift === "art" && { boxShadow: shadows.art }, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <View style={[styles.clip, { borderRadius: r, backgroundColor: tint }]}>
        {uri && !broken ? (
          <FadeImage
            key={uri}
            uri={uri}
            recyclingKey={art!.id}
            priority={priority}
            share={share}
            onError={onError}
            onLoad={onSettled}
          />
        ) : load && fallback ? (
          <View style={styles.fallback}>
            <T style={styles.fallbackText} numberOfLines={2} maxFontSizeMultiplier={1.2}>
              {fallback}
            </T>
          </View>
        ) : null}
        {lift !== "none" && <View style={[styles.edge, { borderRadius: r }]} />}
        {showProgress && (
          <View testID="progress-bar" style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(Math.min(1, progress!) * 1000) / 10}%` }]} />
          </View>
        )}
      </View>
      {chip ? (
        <View
          style={[
            styles.chip,
            at === "start" ? { left: 8 } : { right: 8 },
            { bottom: showProgress ? 11 : 8 },
          ]}
        >
          <T style={styles.chipText} numberOfLines={1} maxFontSizeMultiplier={textCap.display}>
            {chip}
          </T>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  clip: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  backdropShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(15,17,21,0.2)" },
  poster: { position: "absolute", top: 0, bottom: 0, overflow: "hidden" },
  posterImage: { position: "absolute", top: 0, bottom: 0 },
  edge: {
    ...StyleSheet.absoluteFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 17, 21, 0.08)",
    pointerEvents: "none",
  },
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: c.artTrack,
  },
  fill: { height: 4, backgroundColor: c.white },
  chip: {
    position: "absolute",
    backgroundColor: c.scrim,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  chipText: {
    fontFamily: font.bold,
    fontSize: 13,
    lineHeight: 16,
    color: c.white,
    ...tabular,
  },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 10 },
  fallbackText: {
    fontFamily: font.extrabold,
    fontSize: 13,
    lineHeight: 17,
    color: c.white,
    textAlign: "center",
  },
});

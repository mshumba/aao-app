import type { Href } from "expo-router";
import { memo, useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { SectionHeader } from "../kit";
import { usePathSuggestions, usePaths } from "../learning";
import { joinDays } from "../learning/progress";
import { fanFor, isSingleTeaching, pathHref, pathLength, sermonHref } from "./model";
import { PathListCard, type ListProgress } from "./PathListCard";

const NONE: ListProgress = { kind: "none" };

/**
 * One to three paths for the viewer's topics (usePathSuggestions: none
 * they've started or finished), as the Paths tab draws its rows, under
 * "Paths for your topics". Nothing when there are none. A series of one
 * teaching opens that teaching, as on the Paths tab.
 */
export const PathSuggestions = memo(function PathSuggestions({
  onOpen,
  inset = 0,
  style,
}: {
  onOpen: (href: Href) => void;
  /** Side padding for the heading and rows. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const suggested = usePathSuggestions();
  const { daysOf } = usePaths();
  const { find } = useCatalogue();
  const rows = useMemo(
    () =>
      suggested.map((path) => {
        const days = joinDays(daysOf(path.id), find);
        const total = days.length || path.dayCount;
        const only = isSingleTeaching(path, total) ? days[0] : undefined;
        return {
          path,
          total,
          length: pathLength(days),
          fan: fanFor(days, 1),
          href: only ? sermonHref(only.youtubeId) : pathHref(path.id),
        };
      }),
    [suggested, daysOf, find],
  );
  if (!rows.length) return null;
  return (
    <View testID="topic-paths" style={style}>
      <SectionHeader
        title={rows.length === 1 ? "A path for your topics" : "Paths for your topics"}
        inset={inset}
      />
      <View style={{ paddingHorizontal: inset }}>
        {rows.map((row, i) => (
          <PathListCard
            key={row.path.id}
            path={row.path}
            fan={row.fan}
            total={row.total}
            length={row.length}
            progress={NONE}
            first={i === 0}
            onPress={() => onOpen(row.href)}
          />
        ))}
      </View>
    </View>
  );
});

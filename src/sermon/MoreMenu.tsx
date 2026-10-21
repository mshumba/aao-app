import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { CardFan, Kicker, type ArtSource } from "../kit";
import { c, radius, type } from "../theme";
import { Icon, T, Tap, nowrap } from "../ui";

/**
 * "Part of Apostolic Shift" on the panel when the sermon isn't a path day:
 * the series' artwork as a small fan, which part this is, and a way to the
 * whole series. The kit's PartOfPathRow, without path progress.
 */
export const SeriesRow = memo(function SeriesRow({
  name,
  part,
  total,
  fan,
  onPress,
}: {
  name: string;
  part: number | null;
  total: number;
  fan: ArtSource[];
  onPress: () => void;
}) {
  // "2 of 3" never breaks inside.
  const kicker = part
    ? `Part of a series · ${nowrap(`${part} of ${total}`)}`
    : `Part of a series · ${nowrap(`${total} messages`)}`;
  return (
    <Tap
      testID="part-of-series"
      accessibilityRole="button"
      accessibilityLabel={`${kicker.replace(" · ", ". ").replace(/\u00A0/g, " ")}. ${name}.`}
      accessibilityHint="Opens every part of the series"
      onPress={onPress}
      feedback="scaleLarge"
      style={styles.row}
    >
      <CardFan sermons={fan} size="row" />
      <View style={styles.rowText}>
        <Kicker tone="onFeature">{kicker}</Kicker>
        <T style={styles.rowName} numberOfLines={2}>
          {name}
        </T>
      </View>
      <Icon name="chevron-forward" size={20} color={c.mutedOnFeature} />
    </Tap>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.feature,
    borderRadius: radius.r20,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { ...type.cardTitle, color: c.text, marginTop: 2 },
});

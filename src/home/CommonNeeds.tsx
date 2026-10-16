import { memo } from "react";
import { StyleSheet } from "react-native";
import { ChipRow, NeedChip } from "../kit";
import type { Need } from "../learning";

/**
 * "Common needs" under Home's search field: a few needs as chips, each
 * searching for its sentence (Search lists the rest).
 */
export const CommonNeeds = memo(function CommonNeeds({
  needs,
  onSearch,
}: {
  needs: readonly Need[];
  onSearch: (label: string) => void;
}) {
  if (!needs.length) return null;
  return (
    <ChipRow label="Common needs" style={styles.chips}>
      {needs.map((need) => (
        <NeedChip
          key={need.id}
          label={need.short}
          hint={`Searches for “${need.label}”`}
          onPress={() => onSearch(need.label)}
        />
      ))}
    </ChipRow>
  );
});

const styles = StyleSheet.create({
  chips: { marginTop: 12 },
});

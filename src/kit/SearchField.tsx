import { memo, useCallback, useState, type ReactNode, type Ref } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { c, radius, shadows, textCap, type } from "../theme";
import { Icon, T, Tap, fieldBorder, noWebOutline, web, type IconName } from "../ui";
import { Spark } from "./Spark";

const PROMPT = "What are you going through?";

type Common = {
  /** The field's accessible name, and the serif-italic prompt shown while empty. */
  placeholder?: string;
  /**
   * A different visible prompt (the page's own title already asks the
   * question); the accessible name stays `placeholder`.
   */
  prompt?: string;
  /** A line under the field: "Finding moments about **…**". */
  helper?: ReactNode;
  helperIcon?: IconName;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export type SearchFieldProps = Common &
  (
    | {
        /**
         * "hero": Home's field, floating over the hero's edge. It's a button
         * that opens Search (the arrow is part of it).
         */
        variant: "hero";
        onPress: () => void;
        hint?: string;
      }
    | {
        /** "page": the Search screen's real field. */
        variant?: "page";
        value: string;
        onChangeText: (text: string) => void;
        onSubmit?: (text: string) => void;
        /** Clears the field; shown while there's text. */
        onClear?: () => void;
        /** A trailing navy arrow that submits. */
        arrow?: boolean;
        /** Drawn as focused (navy edge and ring) while results show for what's typed. */
        active?: boolean;
        /**
         * The leading glyph: the sparkle (search by meaning, the default) or a
         * plain icon for a field that only matches titles.
         */
        leading?: "spark" | IconName;
        autoFocus?: boolean;
        inputRef?: Ref<TextInput>;
        onFocus?: TextInputProps["onFocus"];
        onBlur?: TextInputProps["onBlur"];
      }
  );

/**
 * "What are you going through?" A white pill with the sparkle, the question
 * in serif italic while empty, Manrope as you type.
 *
 * The serif prompt is drawn over the input (a TextInput draws its own
 * placeholder in the typed font); the input keeps the question as its
 * accessible name, so screen readers still hear it.
 */
export const SearchField = memo(function SearchField(props: SearchFieldProps) {
  const { placeholder = PROMPT, helper, helperIcon = "checkmark", testID, style } = props;
  const helperLine = helper ? (
    <View style={styles.helper}>
      <Icon name={helperIcon} size={15} color={c.accent} />
      <T style={[styles.helperText, prettyWrap]} {...wrapProps}>
        {helper}
      </T>
    </View>
  ) : null;

  if (props.variant === "hero")
    return (
      <HeroField
        placeholder={placeholder}
        prompt={props.prompt ?? placeholder}
        hint={props.hint}
        onPress={props.onPress}
        testID={testID}
        style={style}
        helperLine={helperLine}
      />
    );

  return <PageField {...props} helperLine={helperLine} />;
});

/** Lines broken evenly, never one word stranded (iOS, Android, the web). */
const wrapProps = { lineBreakStrategyIOS: "push-out", textBreakStrategy: "highQuality" } as const;
const prettyWrap = web({ textWrap: "pretty" }) as object;

/** Points of the prompt's width per point of type size (Newsreader 400 italic). */
const PROMPT_EM = 11.4;

/**
 * Home's field: a button that opens Search. The whole question always
 * shows: on a narrow phone its size steps down to fit the room, and under
 * 360pt the arrow goes (the whole pill is the button anyway).
 */
function HeroField({
  placeholder,
  prompt,
  hint,
  onPress,
  testID,
  style,
  helperLine,
}: {
  placeholder: string;
  prompt: string;
  hint?: string;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  helperLine: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const arrow = width >= 360;
  const [slot, setSlot] = useState(0);
  const onSlot = useCallback((e: LayoutChangeEvent) => setSlot(Math.floor(e.nativeEvent.layout.width)), []);
  const scale = prompt.length / PROMPT.length;
  const fontSize = slot ? Math.min(type.prompt.fontSize, Math.floor((slot / (PROMPT_EM * scale)) * 2) / 2) : type.prompt.fontSize;
  return (
    <View style={style}>
      <Tap
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        accessibilityHint={hint ?? "Opens Search"}
        onPress={onPress}
        feedback="scaleLarge"
        style={[styles.hero, !arrow && styles.heroNoArrow]}
      >
        <View style={styles.sparkWell}>
          <Spark size={20} />
        </View>
        <View style={styles.heroSlot} onLayout={onSlot}>
          <T style={[type.prompt, styles.heroPrompt, { fontSize }]} maxFontSizeMultiplier={textCap.section}>
            {prompt}
          </T>
        </View>
        {arrow ? (
          <View style={styles.go}>
            <Icon name="arrow-forward" size={20} color={c.onAccent} />
          </View>
        ) : null}
      </Tap>
      {helperLine}
    </View>
  );
}

function PageField({
  value,
  onChangeText,
  onSubmit,
  onClear,
  arrow = false,
  active = false,
  leading = "spark",
  autoFocus,
  inputRef,
  onFocus,
  onBlur,
  placeholder = PROMPT,
  prompt,
  testID,
  style,
  helperLine,
}: Extract<SearchFieldProps, { value: string }> & { helperLine: ReactNode }) {
  const [focused, setFocused] = useState(false);
  const empty = value.length === 0;
  const lit = focused || active;
  return (
    <View style={style}>
      <View
        style={[
          styles.page,
          lit
            ? { borderColor: c.accent, borderWidth: 1.5, boxShadow: shadows.fieldFocus }
            : { borderColor: fieldBorder, borderWidth: 1, boxShadow: shadows.fieldRest },
        ]}
      >
        {leading === "spark" ? <Spark size={20} /> : <Icon name={leading} size={20} color={c.muted} />}
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            testID={testID}
            value={value}
            onChangeText={onChangeText}
            onSubmitEditing={() => onSubmit?.(value)}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            autoFocus={autoFocus}
            accessibilityLabel={placeholder}
            placeholder={placeholder}
            // The visible prompt is the serif overlay below.
            placeholderTextColor="transparent"
            returnKeyType="search"
            enterKeyHint="search"
            autoCapitalize="sentences"
            maxLength={200}
            selectionColor={c.accent}
            cursorColor={c.accent}
            style={[styles.input, noWebOutline]}
            maxFontSizeMultiplier={textCap.chip}
            // Web: Return searches and the caret stays put (react-native-web
            // otherwise blurs a single-line field on submit).
            {...web({ type: "search", blurOnSubmit: false, submitBehavior: "submit" })}
          />
          {empty ? (
            <View
              style={styles.promptLayer}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              {...web({ "aria-hidden": true })}
            >
              <T style={[type.prompt, styles.pagePrompt]} numberOfLines={1} maxFontSizeMultiplier={textCap.chip}>
                {prompt ?? placeholder}
              </T>
            </View>
          ) : null}
        </View>
        {!empty && onClear ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Clear"
            onPress={onClear}
            hitSlop={9}
            style={styles.clear}
          >
            <Icon name="close" size={15} color={c.muted} />
          </Tap>
        ) : null}
        {arrow ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Search"
            onPress={() => onSubmit?.(value)}
            disabled={empty}
            style={styles.goSmall}
          >
            <Icon name="arrow-forward" size={20} color={c.onAccent} />
          </Tap>
        ) : null}
      </View>
      {helperLine}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 58,
    borderRadius: 29,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 8,
    boxShadow: shadows.field,
  },
  sparkWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  heroNoArrow: { paddingRight: 18 },
  heroSlot: { flex: 1, minWidth: 0, justifyContent: "center" },
  heroPrompt: { color: c.text },
  go: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  page: {
    minHeight: 58,
    borderRadius: radius.r20,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 10,
  },
  inputWrap: { flex: 1, justifyContent: "center", minHeight: 44 },
  input: {
    ...type.field,
    // A single-line input centres its own text; a line height would offset it.
    lineHeight: undefined,
    color: c.text,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 44,
  },
  promptLayer: { ...StyleSheet.absoluteFill, justifyContent: "center", pointerEvents: "none" },
  pagePrompt: { color: c.muted, fontSize: 17 },
  clear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: c.clearWell,
    alignItems: "center",
    justifyContent: "center",
  },
  goSmall: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  helper: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, paddingHorizontal: 4 },
  helperText: { fontFamily: type.meta.fontFamily, fontSize: 13, lineHeight: 18, color: c.muted, flexShrink: 1 },
});

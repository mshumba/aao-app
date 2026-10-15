import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authMode } from "../auth/config";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import {
  Artwork,
  Avatar,
  CardFan,
  ChipRow,
  DayTimeline,
  ItalicTitle,
  Kicker,
  MomentCard,
  MomentRow,
  NeedChip,
  PagerDots,
  PartOfPathRow,
  PathCardNavy,
  PathProgress,
  PlayPill,
  Quote,
  QuotePlaceholder,
  RoundButton,
  RouteIcon,
  SearchField,
  SectionHeader,
  StickyCTA,
  Strong,
  TimeLeft,
  TrustLine,
  Wash,
  durationText,
  leftText,
  useStickyCTASpace,
  type DayRowProps,
} from "../kit";
import { fixtureDays, fixtureNeeds, fixturePaths, fixtureProgress } from "../learning/fixtures";
import { minutesPerDayLabel, useSearch, type SearchMoment } from "../learning";
import { usePageTitle } from "../navigation";
import { c, radius, textCap, type } from "../theme";
import { Heading, T } from "../ui";

/**
 * Development only: every shared component (src/kit) with the test data in
 * src/learning/fixtures.ts, laid out like the approved concept's screens.
 * Opens at /kit in development builds and in the on-device test mode.
 */
export default function Kit() {
  if (!__DEV__ && authMode !== "local") return <Redirect href="/" />;
  return <Gallery />;
}

const noop = () => {};

function Gallery() {
  usePageTitle("Kit");
  const insets = useSafeAreaInsets();
  const ctaSpace = useStickyCTASpace();
  const { sermons, find } = useCatalogue();
  const [query, setQuery] = useState("I keep falling into the same sin");
  const [submitted, setSubmitted] = useState(query);
  const [page, setPage] = useState(0);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const result = useSearch(submitted);

  const habit = fixturePaths[0];
  const draft = fixturePaths[1];
  const habitDays = useMemo(() => fixtureDays.filter((d) => d.pathId === habit.id), [habit.id]);
  const { done, partial } = fixtureProgress;
  const today = done.length + 1;
  const todayDay = habitDays[today - 1];
  const todaySermon = find(todayDay.youtubeId);
  // Front: today; behind: the two days before it.
  const fan = [todaySermon, find(habitDays[0].youtubeId), find(habitDays[1].youtubeId)];
  const hero = sermons[page % Math.max(1, sermons.length)];
  const todayLeft = (todayDay.focusEnd - todayDay.focusStart) * (1 - partial);

  const days: Omit<DayRowProps, "connector">[] = habitDays.slice(0, 5).map((d) => {
    const s = find(d.youtubeId);
    const state = d.day <= done.length ? "done" : d.day === today ? "today" : "upcoming";
    return {
      day: d.day,
      theme: d.theme,
      title: s?.headline ?? "Sermon",
      state,
      locked: state === "upcoming",
      art: s,
      left: leftText(todayLeft),
      progress: partial,
      keyMoment: { at: d.keyAt, title: d.keyTitle },
      onPress: noop,
      onKeyMoment: noop,
    };
  });

  const toggleSave = useCallback(
    (m: SearchMoment) => setSaved((was) => ({ ...was, [m.id]: !was[m.id] })),
    [],
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: ctaSpace }}>
        {/* ---- 01 Home -------------------------------------------------------- */}
        <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
          {hero ? (
            <Artwork art={hero} width={716} radius={0} lift="none" style={styles.heroArt} priority="high" />
          ) : null}
          <Wash kind="heroScrim" />
          <Wash kind="heroFade" band="bottom" height={68} />
          <View style={styles.heroTop}>
            <ItalicTitle
              text="Good afternoon, Mufaro"
              italicLast
              style={[type.greeting, { color: c.white }]}
              maxFontSizeMultiplier={textCap.display}
            />
            <Avatar name="Mufaro" onPress={noop} />
          </View>
          <View style={styles.heroBody}>
            <Kicker tone="onMedia">{`New this week · ${hero?.duration ?? ""}`}</Kicker>
            <ItalicTitle
              text={hero?.headline ?? "The Heavenly Calling"}
              italicLast
              accessibilityRole="header"
              style={[type.masthead, styles.heroTitle]}
              maxFontSizeMultiplier={textCap.display}
              numberOfLines={3}
            />
            <View style={styles.heroActions}>
              <PlayPill size="md" tone="white" label="Watch" onPress={noop} />
              <RoundButton icon="bookmark-outline" label="Save" size={48} onPress={noop} iconSize={20} />
              <View style={{ marginLeft: "auto" }}>
                <PagerDots count={4} index={page % 4} onSelect={setPage} />
              </View>
            </View>
          </View>
        </View>
        <SearchField variant="hero" onPress={noop} style={styles.needField} />
        <ChipRow label="Common needs" style={{ marginTop: 12 }}>
          {fixtureNeeds.slice(0, 6).map((need) => (
            <NeedChip key={need.id} label={need.short} onPress={() => setSubmitted(need.label)} />
          ))}
        </ChipRow>
        <PathCardNavy
          variant="home"
          name={habit.name}
          italic={habit.italic}
          day={today}
          total={habit.dayCount}
          done={done}
          partial={partial}
          fan={fan}
          todayTitle={todaySermon?.headline ?? ""}
          todayMeta={`${leftText(todayLeft)} · ${done.length} of ${habit.dayCount} done`}
          onOpen={noop}
          onPlay={noop}
          style={styles.pathBlock}
        />
        <SectionHeader title="Continue watching" action={{ onPress: noop }} inset={24} style={styles.section} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {sermons.slice(0, 4).map((s, i) => (
            <Artwork key={s.id} art={s} width={176} chip={leftText(1800 + i * 2400)} progress={[0.66, 0.85, 0.3, 0.5][i]} />
          ))}
        </ScrollView>

        {/* ---- 02 Search ------------------------------------------------------ */}
        <Label>02 · Search</Label>
        <View style={styles.pad}>
          <Kicker>Search by what you need</Kicker>
          <ItalicTitle
            text="What are you going through?"
            italic="going through?"
            breakBeforeItalic
            accessibilityRole="header"
            style={[type.title, { marginTop: 6 }]}
            maxFontSizeMultiplier={textCap.display}
          />
        </View>
        <SearchField
          value={query}
          onChangeText={setQuery}
          onSubmit={(q) => setSubmitted(q)}
          onClear={() => setQuery("")}
          helper={
            result.data ? (
              <>
                Finding moments about <Strong>{result.data.understood.theme}</Strong>
              </>
            ) : result.status === "loading" ? (
              "Searching every message"
            ) : undefined
          }
          style={styles.field}
        />
        <ChipRow label="Related needs" style={{ marginTop: 12 }}>
          {(result.data?.understood.related ?? ["Temptation", "Shame after falling", "Self-control"]).map((r) => (
            <NeedChip key={r} label={r} variant="outline" onPress={() => setSubmitted(r)} />
          ))}
        </ChipRow>
        <PathCardNavy
          variant="compact"
          name={habit.name}
          meta={`${habit.dayCount} messages · You're on Day ${today}`}
          fan={fan}
          onPress={noop}
          style={styles.compact}
        />
        <SectionHeader
          title="Moments that speak to this"
          size="md"
          count={result.data ? `${result.data.total.moments} found` : undefined}
          inset={24}
          style={styles.section}
        />
        <View style={{ gap: 12, paddingHorizontal: 20, marginTop: 12 }}>
          {result.status === "loading" ? (
            <QuotePlaceholder />
          ) : (
            result.data?.moments.slice(0, 3).map((m) => (
              <MomentCard
                key={m.id}
                moment={m}
                quotePending={result.pendingQuotes.has(m.id)}
                onPlay={noop}
                onOpen={noop}
                saved={!!saved[m.id]}
                onToggleSave={toggleSave}
              />
            ))
          )}
        </View>

        {/* ---- 03 Path -------------------------------------------------------- */}
        <Label>03 · Guided path</Label>
        <View style={styles.cover}>
          <Wash kind="pathCover" />
          <View style={styles.coverNav}>
            <RoundButton icon="chevron-back" label="Back" onPress={noop} />
            <RoundButton icon="share-outline" label="Share" onPress={noop} iconSize={18} />
          </View>
          <CardFan sermons={fan} size="cover" style={{ alignSelf: "center", marginTop: 4 }} />
          <View style={styles.coverText}>
            <Kicker tone="onMedia">{`Guided path · ${habit.dayCount} messages`}</Kicker>
            <ItalicTitle
              text={habit.name}
              italic="habitual"
              breakBeforeItalic
              style={[type.coverTitle, styles.coverTitle]}
              maxFontSizeMultiplier={textCap.display}
            />
          </View>
          <PathProgress
            total={habit.dayCount}
            done={done}
            current={today}
            partial={partial}
            tone="onDark"
            caption={{ left: `Day ${today} of ${habit.dayCount}`, right: minutesPerDayLabel(habit), centered: true }}
            style={styles.coverProgress}
          />
        </View>
        <View style={styles.sheet}>
          <View style={styles.whyRow}>
            <Kicker>Why this path</Kicker>
            <TrustLine status={habit.status} />
          </View>
          <ItalicTitle text={habit.why} italic="grace" style={[type.prose, { marginTop: 6 }]} />
          <TrustLine status={draft.status} extra={minutesPerDayLabel(draft)} style={{ marginTop: 12 }} />
          <DayTimeline days={days} style={{ marginTop: 14 }} />
        </View>

        {/* ---- 04 Sermon ------------------------------------------------------ */}
        <Label>04 · Sermon</Label>
        <View style={styles.stage}>
          <Wash kind="stage" />
          <Kicker tone="onMedia">{`${todaySermon?.date ?? ""} · ${todaySermon?.duration ?? ""}`}</Kicker>
          <ItalicTitle
            text={todaySermon?.headline ?? ""}
            italicLast
            style={[type.sermonTitle, { color: c.white, marginTop: 8 }]}
            maxFontSizeMultiplier={textCap.display}
          />
          <T style={styles.by}>Apostle Arome Osayi</T>
          <View style={styles.transport}>
            <RoundButton tone="white" size={56} icon="pause" label="Pause" iconColor={c.media} onPress={noop} iconSize={24} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <RoundButton tone="outlineOnDark" label="Playback speed, 1 times" onPress={noop}>
                <T style={styles.speed}>1×</T>
              </RoundButton>
              <RoundButton tone="glassSoft" icon="bookmark-outline" label="Save" onPress={noop} iconSize={18} />
              <RoundButton tone="glassSoft" icon="share-outline" label="Share" onPress={noop} iconSize={18} />
            </View>
          </View>
        </View>
        <View style={styles.sermonSheet}>
          <PartOfPathRow
            name={habit.name}
            day={today}
            total={habit.dayCount}
            done={done}
            partial={partial}
            fan={fan}
            onPress={noop}
          />
          <SectionHeader title="Moments in this sermon" size="md" count="4 moments" style={{ marginTop: 20, marginBottom: 6, marginHorizontal: 4 }} />
          <MomentRow first at={3224} title="Victory over sin" quote={habitDays[2].keyQuote} state="past" onPress={noop} />
          <MomentRow at={4158} title="Win in your soul" quote="If you win in your soul you will win on the ground; if you lose in your soul you will lose on the ground." state="next" comingUpMinutes={4} onPress={noop} />
          <MomentRow first at={4384} title="Quietness within" quote="Do you have quietness within you? Because if you have quietness you will not feel any need to respond." onPress={noop} />
        </View>

        {/* ---- Parts ---------------------------------------------------------- */}
        <Label>Parts</Label>
        <View style={[styles.pad, { gap: 16 }]}>
          <View style={styles.inline}>
            <RouteIcon color={c.muted} />
            <RouteIcon color={c.accent} bold />
            <PlayPill at={6747} onPress={noop} />
            <PlayPill at={3224} tone="sand" onPress={noop} />
          </View>
          <TimeLeft seconds={2880} />
          <T style={type.meta}>{durationText(7680)}</T>
          <PathProgress
            total={7}
            done={done}
            current={today}
            partial={partial}
            caption={{ left: `Day ${today} of 7`, right: `${done.length} done · ${7 - done.length} to go` }}
          />
          <Quote size="large" hang={false} text="God doesn't live in time, but he will use time to test your soul." />
          <QuotePlaceholder lines={2} />
          <CardFan sermons={fan} size="card" border="white" />
        </View>
        <Heading level={2} style={[styles.pad, { ...type.caption, color: c.muted, marginTop: 24 }]}>
          Test data from src/learning/fixtures.ts.
        </Heading>
      </ScrollView>
      <StickyCTA label={`Continue Day ${today}`} detail={leftText(todayLeft)} onPress={noop} />
    </View>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <View style={styles.label}>
      <T style={[type.overline, { color: c.muted }]}>{children}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  hero: { height: 340 + 20, backgroundColor: c.media, overflow: "hidden" },
  // The concept's crop: the art 403pt tall, shifted left so the preacher
  // sits on the right beside the title.
  heroArt: { position: "absolute", top: -12, left: -222 },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  heroBody: { position: "absolute", left: 24, right: 24, bottom: 70 },
  heroTitle: { color: c.white, marginTop: 6, maxWidth: 300 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  needField: { marginTop: -58, marginHorizontal: 20 },
  pathBlock: { marginHorizontal: 16, marginTop: 16 },
  section: { marginTop: 28, marginBottom: 10 },
  rail: { gap: 12, paddingHorizontal: 24 },
  label: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 16 },
  pad: { paddingHorizontal: 24 },
  field: { marginHorizontal: 20, marginTop: 20 },
  compact: { marginHorizontal: 20, marginTop: 16 },
  cover: { height: 370, backgroundColor: c.media, overflow: "hidden", paddingTop: 12 },
  coverNav: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20 },
  coverText: { alignItems: "center", paddingHorizontal: 24, marginTop: 6 },
  coverTitle: { color: c.white, textAlign: "center", marginTop: 8 },
  coverProgress: { marginHorizontal: 58, marginTop: 14 },
  sheet: {
    marginTop: -20,
    backgroundColor: c.bg,
    borderTopLeftRadius: radius.r28,
    borderTopRightRadius: radius.r28,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  whyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  stage: { backgroundColor: c.media, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 56, overflow: "hidden" },
  by: { fontFamily: type.meta.fontFamily, fontSize: 13.5, lineHeight: 19, color: "rgba(255,255,255,0.76)", marginTop: 4 },
  transport: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 },
  speed: { fontFamily: "Manrope_800ExtraBold", fontSize: 13, color: c.white },
  sermonSheet: {
    marginTop: -28,
    backgroundColor: c.bg,
    borderTopLeftRadius: radius.r28,
    borderTopRightRadius: radius.r28,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  inline: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
});


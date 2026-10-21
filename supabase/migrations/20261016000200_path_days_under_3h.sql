-- Path and series day fixes, phone round (TestFlight build 3 feedback), 16 Oct 2026.
-- Verified by data-verify, read-only. NOT RUN.
--
-- What is checked for every row below (live database, SELECTs only):
--   * the key_quote passes public.is_clean_verbatim under the exact
--     path_days_check_quote() condition (a passage of the row's sermon with
--     start_s <= key_at + 60 and end_s >= key_at contains it);
--   * key_at is 3.0-3.8 s before the quote's first word (passage_word_time);
--   * key_at lies inside the focus window, and the focus window inside the video;
--   * the moment is the Apostle teaching, on the day's theme (transcript read);
--   * no sermon (or duplicate upload of it, via passages.twins) appears twice in
--     the same path or series after these changes;
--   * every replacement sermon is under 3 hours and has no hidden passages.
--
-- Each UPDATE is guarded on the row's current value, so a row that changed since
-- the check is left alone; the assertion at the end then fails and rolls the
-- whole file back instead of applying part of it.
--
-- Seeds: supabase/seed/paths.sql and supabase/seed/series.sql still hold the old
-- values for these rows and would put them back if re-run. Update them too.

begin;

create table if not exists path_days_backup_20261016 as select * from path_days;
-- Keep the backup out of the public API (new public tables get anon grants).
alter table path_days_backup_20261016 enable row level security;
revoke all on path_days_backup_20261016 from anon, authenticated;

-- ==== Sermons over 3 hours, replaced (owner: "if the sermon is more than 3 hours
-- ==== it shouldn't be in a series") ===========================================

-- breaking-free-from-habitual-sin, day 2: 8G7IDqHiXKU (3h16) -> OHhEiiMKXjg, "Awake",
-- Lighthouse Retreat 2025, 1h41. The Apostle from the first minute; Romans 6 (reckon
-- yourself dead to sin) from about 8 to 28 min. Theme and title unchanged.
update public.path_days set
  youtube_id = 'OHhEiiMKXjg',
  focus_start = 639.0, focus_end = 1606.9,
  theme = 'You are dead to sin',
  key_at = 1047.9,
  key_title = 'Dead to sin',
  key_quote = 'In the new covenant, this is the accurate position. You must account that you are dead to sin.'
where path_id = 'breaking-free-from-habitual-sin' and day = 2 and youtube_id = '8G7IDqHiXKU';

-- building-on-the-right-foundation, day 2: wMjngQMv3ag (3h24) -> kJGclK58IcY, "The
-- Telescope Part 1", 2h18. Repentance as turning from rebellion to the reign of
-- heaven (19-35 min). Theme was "Turning to God, not just feeling sorry".
update public.path_days set
  youtube_id = 'kJGclK58IcY',
  focus_start = 1183.1, focus_end = 2390.8,
  theme = 'Turning from rebellion to God''s rule',
  key_at = 1251.9,
  key_title = 'Turn Around',
  key_quote = 'That''s why the first kingdom message is about repentance. We will need to turn around. We need to give up our ways of rebellion.'
where path_id = 'building-on-the-right-foundation' and day = 2 and youtube_id = 'wMjngQMv3ag';

-- building-on-the-right-foundation, day 3: WQjfotAWDd4 (3h00m27s, and 56 min of
-- worship before the teaching) -> 4FbUDc0oU5M, "Why Some Christians Still Feel
-- Spiritually Stuck", 2h16. Starts at once with assurance: Romans 8:16, the inward
-- witness, peace and quietness (first 20 min). Weakest pick: the rest is about
-- renouncing idols and family altars. Theme was "Trust Jesus, and know you are his".
update public.path_days set
  youtube_id = '4FbUDc0oU5M',
  focus_start = 272.7, focus_end = 1090.5,
  theme = 'Know for sure that you are his',
  key_at = 651.8,
  key_title = 'The Inward Witness',
  key_quote = 'Your spirit, your human spirit, is calibrated on the same frequency as the Holy Spirit. So the Holy Spirit can communicate with your human spirit. That communication is what we call the inward witness.'
where path_id = 'building-on-the-right-foundation' and day = 3 and youtube_id = 'WQjfotAWDd4';

-- building-on-the-right-foundation, day 5: VVbUn3sEyow (3h10) -> Lxu4HOL1cYI, "The
-- Newness of Life", 1h55. Romans 5:10 and Romans 6 as the definition of the new
-- creation. Theme and title unchanged.
update public.path_days set
  youtube_id = 'Lxu4HOL1cYI',
  focus_start = 2563.4, focus_end = 3389.3,
  theme = 'Know who you have become in Christ',
  key_at = 3017.2,
  key_title = 'A New Creation',
  key_quote = 'The reason why you are living now as a new creation is that you are living by the Holy Spirit. It means that your life cannot be the way it was.'
where path_id = 'building-on-the-right-foundation' and day = 5 and youtube_id = 'VVbUn3sEyow';

-- building-on-the-right-foundation, day 12: M69T9psoGCM (5h50) -> RmwJQKsQQMg, "Growing
-- Up in God: The Salvation of Your Soul", 2h27, the edited upload of the same
-- message (56 of its 59 passages are twins of the old one). The quote drops its last
-- clause, which this upload's captions give as "we shall receive".
update public.path_days set
  youtube_id = 'RmwJQKsQQMg',
  focus_start = 0.2, focus_end = 756.2,
  theme = 'Saved, being saved, and yet to be saved',
  key_at = 284.4,
  key_title = 'Growing Up in God',
  key_quote = 'It is true when we say we are saved. It is also still true when we say we are being saved.'
where path_id = 'building-on-the-right-foundation' and day = 12 and youtube_id = 'M69T9psoGCM';

-- living-by-faith, day 3: K1oTGSidQkQ (3h06) -> NNFD05-QEQQ, "The Secret Language of
-- Victory", 1h33. Seeing what Christ has accomplished, accepting it, then speaking.
-- Theme unchanged; title was "The spirit of faith".
update public.path_days set
  youtube_id = 'NNFD05-QEQQ',
  focus_start = 0.0, focus_end = 783.2,
  theme = 'Faith sees victory, then speaks and moves',
  key_at = 532.3,
  key_title = 'The sight of faith',
  key_quote = 'Every new spiritual experience begins by seeing something that has been accomplished already and accepting it by faith.'
where path_id = 'living-by-faith' and day = 3 and youtube_id = 'K1oTGSidQkQ';

-- living-by-faith, day 5: M5Ek9o-17B8 (3h01) -> 57GQMbk3qF8, 30 Days Fasting & Prayer
-- Day 9 (Jan 2021), 1h14. Hebrews 10:35, keeping the substance alive until it
-- manifests. Theme was "God's oath steadies faith while it waits" (the oath sermon
-- is a twin of day 6's). Note: this sermon's headline is "30 Days Fasting & Prayer:
-- Day 9", which is what the day card will show.
update public.path_days set
  youtube_id = '57GQMbk3qF8',
  focus_start = 0.1, focus_end = 1266.6,
  theme = 'Keep your confidence while faith waits',
  key_at = 789.1,
  key_title = 'Faith takes patience',
  key_quote = 'If the substance is in view, your waiting is a day closer to a time of manifestation.'
where path_id = 'living-by-faith' and day = 5 and youtube_id = 'M5Ek9o-17B8';

-- overcoming-fear-and-anxiety, day 5: UKYh3Ggs7P8 (3h15) -> Fal0ICd-XHw, "Securing
-- Peace", 1h12. Philippians 4: prayer brings you to rest before the answer shows.
-- Theme unchanged; title was "The superior testimony".
update public.path_days set
  youtube_id = 'Fal0ICd-XHw',
  focus_start = 1189.2, focus_end = 1875.1,
  theme = 'Peace that holds until God answers',
  key_at = 1529.0,
  key_title = 'A place of rest',
  key_quote = 'If you stay in that place of rest, not considering what is in the external, you will begin to see the sovereign hand of God.'
where path_id = 'overcoming-fear-and-anxiety' and day = 5 and youtube_id = 'UKYh3Ggs7P8';

-- ==== Sermon that is mostly not the Apostle, replaced ===========================

-- building-on-the-right-foundation, day 7: LERlOg7jRVg ("Festival of Glory 2020 ||
-- New Converts Service": ~49 min worship, ~15 min a host, ~30 min converts'
-- testimonies, then the Apostle from ~95 min) -> t3runnbXW3M, "Engaging Grace the
-- Wrong Way", weekly prayer meeting 10 Jun 2021, 1h07, the Apostle throughout
-- apart from a couple's ~3.5 min testimony near the start. Theme and title unchanged.
update public.path_days set
  youtube_id = 't3runnbXW3M',
  focus_start = 375.3, focus_end = 1439.8,
  key_at = 567.0,
  key_quote = 'Christian life was designed to run on the fuel called grace.'
where path_id = 'building-on-the-right-foundation' and day = 7 and youtube_id = 'LERlOg7jRVg';

-- ==== Key moments: quote off the day's theme or unclear on its own =============

-- overcoming-fear-and-anxiety, day 2 ("Your heavenly Father already knows"): "living
-- below your reality" never says the Father knows; this is the line that does.
update public.path_days set
  key_at = 2136.5,
  key_quote = 'If you want to deal with a God that knows, the only thing that can impress him is your faith.'
where path_id = 'overcoming-fear-and-anxiety' and day = 2 and youtube_id = 'ezPm1KC_qiE'
  and key_quote = 'When you begin to think, then it will occur to you that you are living below your reality.';

-- building-a-life-of-prayer, day 1: "Our escape route from sufficiency is prayer"
-- reads as a typo on its own; the two sentences just before it carry the point.
update public.path_days set
  key_at = 2388.4,
  key_quote = 'Men ought always to pray, not to faint. You will never enter into that economy until you acknowledge the fact that you are insufficient.'
where path_id = 'building-a-life-of-prayer' and day = 1 and youtube_id = 'Kqw36QLZr6E'
  and key_quote = 'Our escape route from sufficiency is prayer.';

-- building-a-life-of-prayer, day 5: "In order for me to come preach to you today, I
-- have spoken in tongues" is an aside about himself; the Jude 20 point it leads to.
update public.path_days set
  key_at = 819.3,
  key_quote = 'There are dimensions of believing that become possible when you gain heights in the Spirit.'
where path_id = 'building-a-life-of-prayer' and day = 5 and youtube_id = 'A3YdLXMlRxg'
  and key_quote = 'In order for me to come preach to you today, I have spoken in tongues.';

-- fasting-with-purpose, day 5 ("Be temperate in all things"): a generic line about
-- the spiritual man -> his statement of temperance, 3.5 min later.
update public.path_days set
  key_at = 2609.1,
  key_quote = 'The requirement for expertise in the things of the Spirit is that you must master every appetite.'
where path_id = 'fasting-with-purpose' and day = 5 and youtube_id = '9a6NynM_D2o'
  and key_quote = 'The way of a spiritual man is different from the way of a natural man.';

-- discovering-your-purpose-and-calling, day 3 ("Take inventory of your grace" /
-- "Sharpen your grace"): "the secret to greatness is service" doesn't match the
-- title; the line that does, 80 s earlier.
update public.path_days set
  key_at = 1708.0,
  key_quote = 'When you locate the fact that there is grace in a certain area, you need to labor to sharpen it.'
where path_id = 'discovering-your-purpose-and-calling' and day = 3 and youtube_id = 'DNkFzBGAHXk'
  and key_quote = 'In the kingdom of God, the secret to greatness is service.';

-- walking-in-grace-and-holiness, day 5 ("Grace multiplied"): "God is not an idea..."
-- is off the title; the sentence just before it says how grace is multiplied.
update public.path_days set
  key_at = 821.8,
  key_quote = 'You need a multiplication of grace consistently in your life, and the agency through which this grace is multiplied is through the knowledge of God and the knowledge of our Lord Jesus Christ.'
where path_id = 'walking-in-grace-and-holiness' and day = 5 and youtube_id = '0QjtSGDxR8s'
  and key_quote = 'God is not an idea, God is not a concept, God is a person.';

-- knowing-the-holy-spirit, day 11: "that snail" needed the sentence that brings the
-- snail in.
update public.path_days set
  key_at = 2668.0,
  key_quote = 'The snail is very sensitive. I need you to understand that the Holy Spirit is more sensitive than that snail.'
where path_id = 'knowing-the-holy-spirit' and day = 11 and youtube_id = 'YZFkiPvUELo'
  and key_quote = 'I need you to understand that the Holy Spirit is more sensitive than that snail.';

-- walking-in-grace-and-holiness, day 3 ("Holiness from love"): the quote stopped
-- before love; same moment, next sentence added.
update public.path_days set
  key_at = 3668.9,
  key_quote = 'Holy living is not motivated by the fear of hell. Holy living is a function of the fact that you actually stumbled on the love of God.'
where path_id = 'walking-in-grace-and-holiness' and day = 3 and youtube_id = 'kSMvE2AWlTY'
  and key_quote = 'Holy living is not motivated by the fear of hell.';

-- ==== Key moments: optional polish (current quotes acceptable, these read better)

-- knowing-the-holy-spirit, day 6 ("Communion with Him"): "You decided to acknowledge
-- that he is a person..." reads oddly on its own; a clear line 50 s later.
update public.path_days set
  key_at = 1504.6,
  key_quote = 'God wants you to have a secret life with him.'
where path_id = 'knowing-the-holy-spirit' and day = 6 and youtube_id = 'scNJvOyzHZU'
  and key_quote = 'You decided to acknowledge that he is a person. He needs intimacy. He needs attention.';

-- fasting-with-purpose, day 1 ("Fasting, then prayer"): add his lead-in so the line
-- is visibly about fasting.
update public.path_days set
  key_at = 1132.8,
  key_quote = 'When Jesus said fasting and prayer, he meant the environment should not influence you, but you must influence environment.'
where path_id = 'fasting-with-purpose' and day = 1 and youtube_id = 'K7n_7hi3xuk'
  and key_quote = 'The environment should not influence you, but you must influence environment.';

-- living-by-faith, day 6 ("Faith that endures"): say what the 17 years were.
update public.path_days set
  key_at = 4097.9,
  key_quote = 'Our own breakthrough took 17 years. Who can have faith for 17 years? No human being has that ability. But you know what? The Holy Spirit did not stop.'
where path_id = 'living-by-faith' and day = 6 and youtube_id = 'HeayLqRG_ec'
  and key_quote = 'Who can have faith for 17 years? No human being has that ability. But you know what? The Holy Spirit did not stop.';

-- ==== All 20 rows or nothing ====================================================

do $$
declare
  n integer;
begin
  select count(*) into n
  from public.path_days d
  join (values
    ('breaking-free-from-habitual-sin', 2, 'OHhEiiMKXjg', 'In the new covenant, this is the accurate position. You must account that you are dead to sin.'),
    ('building-on-the-right-foundation', 2, 'kJGclK58IcY', 'That''s why the first kingdom message is about repentance. We will need to turn around. We need to give up our ways of rebellion.'),
    ('building-on-the-right-foundation', 3, '4FbUDc0oU5M', 'Your spirit, your human spirit, is calibrated on the same frequency as the Holy Spirit. So the Holy Spirit can communicate with your human spirit. That communication is what we call the inward witness.'),
    ('building-on-the-right-foundation', 5, 'Lxu4HOL1cYI', 'The reason why you are living now as a new creation is that you are living by the Holy Spirit. It means that your life cannot be the way it was.'),
    ('building-on-the-right-foundation', 7, 't3runnbXW3M', 'Christian life was designed to run on the fuel called grace.'),
    ('building-on-the-right-foundation', 12, 'RmwJQKsQQMg', 'It is true when we say we are saved. It is also still true when we say we are being saved.'),
    ('living-by-faith', 3, 'NNFD05-QEQQ', 'Every new spiritual experience begins by seeing something that has been accomplished already and accepting it by faith.'),
    ('living-by-faith', 5, '57GQMbk3qF8', 'If the substance is in view, your waiting is a day closer to a time of manifestation.'),
    ('living-by-faith', 6, 'HeayLqRG_ec', 'Our own breakthrough took 17 years. Who can have faith for 17 years? No human being has that ability. But you know what? The Holy Spirit did not stop.'),
    ('overcoming-fear-and-anxiety', 2, 'ezPm1KC_qiE', 'If you want to deal with a God that knows, the only thing that can impress him is your faith.'),
    ('overcoming-fear-and-anxiety', 5, 'Fal0ICd-XHw', 'If you stay in that place of rest, not considering what is in the external, you will begin to see the sovereign hand of God.'),
    ('building-a-life-of-prayer', 1, 'Kqw36QLZr6E', 'Men ought always to pray, not to faint. You will never enter into that economy until you acknowledge the fact that you are insufficient.'),
    ('building-a-life-of-prayer', 5, 'A3YdLXMlRxg', 'There are dimensions of believing that become possible when you gain heights in the Spirit.'),
    ('fasting-with-purpose', 1, 'K7n_7hi3xuk', 'When Jesus said fasting and prayer, he meant the environment should not influence you, but you must influence environment.'),
    ('fasting-with-purpose', 5, '9a6NynM_D2o', 'The requirement for expertise in the things of the Spirit is that you must master every appetite.'),
    ('discovering-your-purpose-and-calling', 3, 'DNkFzBGAHXk', 'When you locate the fact that there is grace in a certain area, you need to labor to sharpen it.'),
    ('walking-in-grace-and-holiness', 3, 'kSMvE2AWlTY', 'Holy living is not motivated by the fear of hell. Holy living is a function of the fact that you actually stumbled on the love of God.'),
    ('walking-in-grace-and-holiness', 5, '0QjtSGDxR8s', 'You need a multiplication of grace consistently in your life, and the agency through which this grace is multiplied is through the knowledge of God and the knowledge of our Lord Jesus Christ.'),
    ('knowing-the-holy-spirit', 6, 'scNJvOyzHZU', 'God wants you to have a secret life with him.'),
    ('knowing-the-holy-spirit', 11, 'YZFkiPvUELo', 'The snail is very sensitive. I need you to understand that the Holy Spirit is more sensitive than that snail.')
  ) as want(path_id, day, youtube_id, key_quote)
    on d.path_id = want.path_id and d.day = want.day
   and d.youtube_id = want.youtube_id and d.key_quote = want.key_quote;
  if n <> 20 then
    raise exception 'apply.sql: expected 20 rows in their new state, found %; nothing applied', n;
  end if;
end
$$;

commit;

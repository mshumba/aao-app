-- Teaching series: the five drafts the owner approved on 15 October 2026 (status 'draft',
-- kind 'series'). Each teaching is one full sermon, stored as a path_days row
-- (day = teaching number). Viewers get the whole sermon; focus_start/focus_end
-- only mark roughly where the teaching sits (for overlays later), and key_at /
-- key_quote mark one key moment.
-- Idempotent: re-running updates the text and teachings in place and removes
-- teachings beyond each series' last one. It never changes status, so a series
-- the ministry has published stays published.
--
-- Each key_quote is "clean verbatim": the sermon's YouTube auto-caption words
-- with capitalisation and punctuation added, and at most an immediate repeat of
-- 1-3 words or a filler (uh, um) left out. It lies inside one of the sermon's
-- stored public.passages. key_at is about 3 s before the quote's first word
-- (json3 caption timings). Times are in seconds.
--
-- Requires the paths migration (20261015000100_paths.sql), the teaching series
-- migration (20261015001000_teaching_series.sql) and the sermon catalogue
-- (every youtube_id below must exist in public.sermons).

begin;

insert into public.paths (id, kind, name, italic, promise, why, needs, minutes_per_day, status, sort) values
  ('building-on-the-right-foundation', 'series', 'Building on the right foundation', 'the right foundation',
   'From what salvation is to a steady, growing walk with God: twelve foundations every believer can build on.',
   'For new believers and anyone who never had a solid grounding. It starts with what salvation is and how it begins (turning from the old life, believing in Jesus, the new birth), then settles who you now are (a new creation, made righteous, empowered by grace, marked by communion and baptism), then builds the daily habits (the Word, prayer, meeting with the church) and ends with growing up: the lifelong salvation of the soul.',
   '{}'::text[], 22, 'draft', 101),
  ('knowing-the-holy-spirit', 'series', 'Knowing the Holy Spirit', 'the Holy Spirit',
   'Meet the Holy Spirit as a Person, then learn step by step to be filled, taught and led by him every day.',
   'For believers who know about the Holy Spirit but want to walk with him. It starts with who he is and why Jesus sent him, shows how he lives in your spirit and fills you with power, then builds daily practice: praying in tongues, fellowship with him, his inner teaching and leading. Later teachings cover his gifts and anointing for serving others and how to honour rather than grieve him, and the series ends with walking in the Spirit day by day.',
   '{}'::text[], 19, 'draft', 102),
  ('the-way-of-the-cross', 'series', 'The way of the cross', 'the cross',
   'See what Jesus did on the cross, what it makes you, and how to live the crucified life.',
   'For believers who want to understand what the cross accomplished and what it asks of them. It starts with what Jesus did there and the exchange he made in our place, then shows that you died and rose with him, and ends with God''s daily dealings with self and the cost and reward of following him.',
   '{}'::text[], 20, 'draft', 103),
  ('living-by-faith', 'series', 'Living by faith', 'by faith',
   'Six teachings that take faith from what it is to how it holds, real and steady, through every season.',
   'For believers who want faith that is real and steady, not hype. It starts with what faith is and where it comes from (God''s spoken word), shows the spirit of faith that sees and acts, then walks through the trial of faith, the patience it needs and the long road, so that faith holds to the end.',
   '{}'::text[], 22, 'draft', 104),
  ('seeking-the-face-of-god', 'series', 'Seeking the face of God', 'the face',
   'One teaching: learn what it means to seek God''s face, how to do it, and how to know you have met him.',
   'For any believer, including someone new to faith. In one complete teaching he shows why we seek God (we were made to need him), what seeking his face means in real decisions, how to keep the mind engaged in prayer, and the sign that you have met him: anxiety lifts and you are at rest.',
   '{}'::text[], 27, 'draft', 105)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  italic = excluded.italic,
  promise = excluded.promise,
  why = excluded.why,
  needs = excluded.needs,
  minutes_per_day = excluded.minutes_per_day,
  sort = excluded.sort;

insert into public.path_days (path_id, day, youtube_id, focus_start, focus_end, theme, key_at, key_title, key_quote) values
  ('building-on-the-right-foundation', 1, 'UcPjUPgXIFY', 2192.2, 3685.6, 'Saved from sin into a whole new life', 2837.9, 'Saved Into Life',
   'The gospel that the apostles preach provided salvation from the principles, the power and the presence of sin.'),
  ('building-on-the-right-foundation', 2, 'kJGclK58IcY', 1183.1, 2390.8, 'Turning from rebellion to God''s rule', 1251.9, 'Turn Around',
   'That''s why the first kingdom message is about repentance. We will need to turn around. We need to give up our ways of rebellion.'),
  ('building-on-the-right-foundation', 3, '4FbUDc0oU5M', 272.7, 1090.5, 'Know for sure that you are his', 651.8, 'The Inward Witness',
   'Your spirit, your human spirit, is calibrated on the same frequency as the Holy Spirit. So the Holy Spirit can communicate with your human spirit. That communication is what we call the inward witness.'),
  ('building-on-the-right-foundation', 4, 'Rr5boYY_oHY', 3644.9, 5091.0, 'Born of the Spirit to see God''s kingdom', 5039.1, 'The New Birth',
   'Your being born again gives you the opportunity of perception, then after perception you will need choice to walk under God''s government.'),
  ('building-on-the-right-foundation', 5, 'Lxu4HOL1cYI', 2563.4, 3389.3, 'Know who you have become in Christ', 3017.2, 'A New Creation',
   'The reason why you are living now as a new creation is that you are living by the Holy Spirit. It means that your life cannot be the way it was.'),
  ('building-on-the-right-foundation', 6, 'zgTFaaNHSxY', 518.9, 1755.3, 'Declared righteous as a gift, then living it', 1615.2, 'Righteousness, a Gift',
   'This righteousness that was given to us was not a function of something that you achieved by your own power.'),
  ('building-on-the-right-foundation', 7, 't3runnbXW3M', 375.3, 1439.8, 'Grace: God''s own power to live above sin', 567.0, 'Grace to Live',
   'Christian life was designed to run on the fuel called grace.'),
  ('building-on-the-right-foundation', 8, 'HJCY8Mu9vzg', 3955.3, 5205.2, 'Covenant signs: the cup and the water', 4503.8, 'Cup and Water',
   'Your baptism is a declaration to this world that I''ve passed on from you. I''m no longer part of you.'),
  ('building-on-the-right-foundation', 9, 'Twf18R60vr0', 1565.5, 3146.9, 'Build on the Word: hear it and do it', 3087.4, 'Built on the Word',
   'The difference between your physical mirror and the mirror of the word of God is that the mirror of God''s word reveals who you are supposed to be.'),
  ('building-on-the-right-foundation', 10, 'zouRZyM9SMM', 0.0, 1438.8, 'Meet your Father in the secret place', 748.4, 'Prayer in Secret',
   'If God does not touch your heart, God cannot change your life. He changes your life by touching your heart.'),
  ('building-on-the-right-foundation', 11, 'MA1Z9iT7wX0', 2327.6, 3538.2, 'Gathering with believers where God meets us', 2967.3, 'Meeting Together',
   'So in our fellowship meetings, the people we interact with, the personalities we interact with are not just the physical personalities that are present in church.'),
  ('building-on-the-right-foundation', 12, 'RmwJQKsQQMg', 0.2, 756.2, 'Saved, being saved, and yet to be saved', 284.4, 'Growing Up in God',
   'It is true when we say we are saved. It is also still true when we say we are being saved.'),
  ('knowing-the-holy-spirit', 1, 'U8__koxVO7E', 659.2, 2109.3, 'A Person you can know, not a force', 1577.0, 'A Real Person',
   'That was when I knew that the Holy Ghost was a person, not because I saw it in scripture; I experienced him.'),
  ('knowing-the-holy-spirit', 2, 'JOTtobPTLOQ', 1461.7, 2472.9, 'From with you to in you', 2334.8, 'Another Comforter',
   'The first blessing that the Holy Spirit makes available when he comes into your ecosystem is that he gives you the blessing of access.'),
  ('knowing-the-holy-spirit', 3, 'dWukrTfLoh4', 1632.5, 2788.8, 'Joined to the Lord as one spirit', 1792.2, 'The Spirit in You',
   'When you gave your life to Christ, what God did is that he established the economy called one Spirit: your spirit and the Holy Spirit mingled together to form an economy.'),
  ('knowing-the-holy-spirit', 4, 'L1S2ebzLRTc', 2579.8, 3579.3, 'Ask, receive and speak', 3435.1, 'Filled with Power',
   'That means if you ask him for the Holy Ghost, he will never deny you.'),
  ('knowing-the-holy-spirit', 5, 'Tl0qEn10FjA', 5277.5, 6697.5, 'Tongues that build you up', 6503.7, 'Praying in Tongues',
   'So speaking in tongues is an avenue to access spiritual rest and spiritual refreshing.'),
  ('knowing-the-holy-spirit', 6, 'scNJvOyzHZU', 935.1, 2100.2, 'A friendship you build on purpose', 1504.6, 'Communion with Him',
   'God wants you to have a secret life with him.'),
  ('knowing-the-holy-spirit', 7, 'P5nM7Q6ytBw', 1113.1, 2225.6, 'The anointing within that teaches you', 1637.2, 'Your Inner Teacher',
   'The anointing within is for your maturity; the anointing upon is for ministry.'),
  ('knowing-the-holy-spirit', 8, 'FFxKz7PKqMw', 3572.9, 4724.0, 'Telling his leading from your own noise', 4289.7, 'Led from Within',
   'The thoughts that come from your human Spirit, they are in line with the word of God; the thoughts that come from your soul, they are contradictory with the word of God.'),
  ('knowing-the-holy-spirit', 9, 'sqxHVEU1LU8', 884.2, 2162.3, 'Different gifts, one Spirit', 1347.2, 'Gifts of the Spirit',
   'God can manage you as an individual because he has the administration to do that and that''s why he is not afraid of diversity.'),
  ('knowing-the-holy-spirit', 10, '2z12UoP47sI', 2155.1, 3288.2, 'Anointed to do good', 2988.6, 'The Anointing',
   'The bottom line is this: you are therefore empowered to do good.'),
  ('knowing-the-holy-spirit', 11, 'YZFkiPvUELo', 2159.3, 3288.2, 'Honour his lordship, guard his peace', 2668.0, 'Do Not Grieve Him',
   'The snail is very sensitive. I need you to understand that the Holy Spirit is more sensitive than that snail.'),
  ('knowing-the-holy-spirit', 12, '02FxbkyFBds', 199.9, 1220.3, 'Learning to walk, step by step', 536.4, 'Walking in the Spirit',
   'Just walk with God and everything that you need for life and for godliness will begin to navigate in your direction.'),
  ('the-way-of-the-cross', 1, '8Yxk1dA8w-g', 3435.8, 4708.8, 'The cross brought God''s rule to earth', 3895.8, 'Why the cross',
   'The meaning of the cross is the payment that was needed to bring the throne of God and make it efficacious upon the face of the earth.'),
  ('the-way-of-the-cross', 2, '7aablIT_eDU', 341.6, 1501.8, 'He took our place, we take his', 1145.6, 'The great exchange',
   'It''s not change, but it''s exchange. Exchange. That''s the testimony of the Christian life.'),
  ('the-way-of-the-cross', 3, 'U6PyFks9W-M', 1011.2, 2104.3, 'You died with Christ to the old', 1362.0, 'Crucified with Christ',
   'The cross has only one statement to make. The cross says death to the entire old creation.'),
  ('the-way-of-the-cross', 4, 'AWKMSeH9PZ8', 4770.2, 6098.0, 'Dead to sin, alive to God', 5834.4, 'Raised with him',
   'My lot and portion experientially on the account of his resurrection is that I am sentenced to a life that is alive to God.'),
  ('the-way-of-the-cross', 5, 'gZfqrw9NaOo', 4037.4, 5424.1, 'God''s dealings turn Jacob into Israel', 5412.7, 'From Jacob to Israel',
   'There must be a transition. Israel must come out of Jacob in order for him to inherit the things that God has ordained.'),
  ('the-way-of-the-cross', 6, 'MwSBuJ-kSiw', 1744.3, 2845.6, 'Deny yourself, live for the coming reward', 2826.8, 'The cost and reward',
   'The same way you chose Jesus on the crusade ground and gave your life to him, you will keep choosing him and denying yourself until this life is accomplished.'),
  ('living-by-faith', 1, 'mrXgkyh2uSk', 133.1, 1367.0, 'Faith is substance, not slogans', 202.6, 'The substance of faith',
   'He did not say faith is a substance, but faith is the substance. It is the substance that brings certainty to hope.'),
  ('living-by-faith', 2, 'loQOKaz_AMA', 1140.5, 2296.2, 'Faith grows from God''s spoken word', 1754.8, 'The word of faith',
   'Build capacity in the spirit for you to be able to trust God because your life depends on the spoken word of God.'),
  ('living-by-faith', 3, 'NNFD05-QEQQ', 0.0, 783.2, 'Faith sees victory, then speaks and moves', 532.3, 'The sight of faith',
   'Every new spiritual experience begins by seeing something that has been accomplished already and accepting it by faith.'),
  ('living-by-faith', 4, 'r_yjGe_WuXg', 2285.7, 3395.3, 'Holding on when circumstances say no', 2871.2, 'Against all hope',
   'So circumstances were allowed to try his faith. There was no hope in the circumstances. It was not logical for you to still keep believing. But against hope, he believed in hope.'),
  ('living-by-faith', 5, '57GQMbk3qF8', 0.1, 1266.6, 'Keep your confidence while faith waits', 789.1, 'Faith takes patience',
   'If the substance is in view, your waiting is a day closer to a time of manifestation.'),
  ('living-by-faith', 6, 'HeayLqRG_ec', 2710.3, 4194.3, 'Keep your heart and finish the journey', 4097.9, 'Faith that endures',
   'Our own breakthrough took 17 years. Who can have faith for 17 years? No human being has that ability. But you know what? The Holy Spirit did not stop.'),
  ('seeking-the-face-of-god', 1, 'c2rUz3C_fXY', 1424.2, 3070.6, 'Meet God personally and leave at rest', 3039.6, 'Seeking God''s face',
   'If you have had this experience before, it takes away anxiety, it takes away fear, it takes away worry, and he brings ventilation and you are at rest inside.')
on conflict (path_id, day) do update set
  youtube_id = excluded.youtube_id,
  focus_start = excluded.focus_start,
  focus_end = excluded.focus_end,
  theme = excluded.theme,
  key_at = excluded.key_at,
  key_title = excluded.key_title,
  key_quote = excluded.key_quote;

delete from public.path_days pd using (values
  ('building-on-the-right-foundation', 12),
  ('knowing-the-holy-spirit', 12),
  ('the-way-of-the-cross', 6),
  ('living-by-faith', 6),
  ('seeking-the-face-of-god', 1)
) as last_teaching (path_id, teachings)
where pd.path_id = last_teaching.path_id and pd.day > last_teaching.teachings;

commit;

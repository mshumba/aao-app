/**
 * Reads the structure out of a YouTube title on the Apostle Arome Osayi
 * channel, so the library can show a short headline, the event and the day
 * it was preached while the exact title stays untouched in the catalogue.
 *
 * Titles follow a handful of loose house styles, for example
 *   LIONESS CONFERENCE || PRAY WITHOUT CEASING || GRAND FINALE || 27TH SEPTEMBER 2026
 *   THE MARRIAGE COVENANT - DR. AROME OSAYI
 *   Apostle Arome Osayi - Hallowed Be Thy Name
 *   GIFT OF PROPHECY 19 || MID-WEEK SERVICE || DR. AROME OSAYI || RCN MINNESOTA || 10TH DECEMBER 2025
 * so this splits a title into pieces, says what each piece is (speaker, date,
 * day or session, venue, event, or the message itself) and puts the parts
 * back together. Anything it can't place stays in the headline, so nothing a
 * title says is lost; the worst case is a headline that is the whole title in
 * title case.
 *
 * Pure and dependency-free, so the catalogue import script
 * (scripts/import-catalogue.mts) and the tests run it directly; the app reads
 * its results from the catalogue.
 */

export type ParsedTitle = {
  /** A short headline for lists, e.g. "Pray Without Ceasing". */
  headline: string;
  /** The occasion, e.g. "Lioness Conference" or "Mid-Week Service". */
  event: string | null;
  /** A multi-part series or a multi-day event, e.g. "Gift of Prophecy" or "Lioness Conference 2022". */
  series: string | null;
  /** Stable grouping key for the series, e.g. "gift-of-prophecy" or "lioness-conference-2022". */
  seriesKey: string | null;
  /** The part or day number within the series. */
  part: number | null;
  /** Which part of an event this is, e.g. "Day 2 Evening", "Grand Finale", "Session 8". */
  session: string | null;
  /**
   * Named preachers when someone other than Apostle Arome Osayi is named,
   * e.g. "Rev. Anthony Audu". Null when he is the only one named, or nobody is.
   */
  speaker: string | null;
  /** Where it was preached, e.g. "RCN Minnesota" or "Manchester, England". */
  venue: string | null;
  /** The day it was preached (YYYY-MM-DD) when the title says so. */
  preachedOn: string | null;
};

// Vocabulary ---------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY = "(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?";
const TIME_OF_DAY = "(morning|morn|mor|afternoon|evening|eveninig|evenining|evenng|eve|night(?!\\s+watch))";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7,
};
const NUMBER = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join("|")})`;
const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
};

/** Honorifics that start a preacher's name. */
const TITLE =
  "(?:apostle|apsotle|apst|apost|apt|ap|dr|rev(?:erend|'d|d)?|pst|pastor|evang(?:elist)?|bishop|archbishop|prophet(?:ess)?|minister|elder|deacon(?:ess)?|barr|mrs|mr|sis(?:ter)?|bro(?:ther)?|prof|engr)";
const TITLES = `(?:${TITLE}\\b[.,]?\\s*)+`;
const NAME_WORD = "[a-zà-ÿ][a-zà-ÿ'’-]*";
// Words that never appear in a person's name, so "PROPHET OF GOD" isn't one.
const NOT_NAMES = new Set(
  "of the and to in for on with by at from is a an my your our his her their god jesus christ lord kingdom prayer church live conference service wedding rcn rccg".split(
    " ",
  ),
);

// Words that mark the occasion rather than the message.
const EVENT_WORDS =
  /\b(conference|conf|contact|invasion|vigils?|fasting|prayers? meeting|meeting|services?|summit|crusade|camp|festival|school of|retreat|convention|seminar|visit|visitation|bible study|night watch|prayerstorm|prayer storm|concert|operation(?!\s+of\b)|celebration|outreach|consolidation|college|streaming|interview|congress|symposium|workshop|training|all night|ordination|inaugural|programme|gathering|campaign|series|iec|ioc|aec|empowerment)\b/i;
// Of those, the ones that name a one-off gathering that runs over several
// days. Weekly services and meetings aren't series.
const GATHERING_WORDS =
  /\b(conference|conf|contact|invasion|vigils?|fasting|summit|crusade|camp|festival|school of|retreat|convention|seminar|visit|visitation|consolidation|operation(?!\s+of\b)|campaign|series|iec|ioc|aec|concert)\b/i;

const PLACES = new Set(
  (
    "nigeria ghana tanzania kenya uganda cameroon cameroun zambia zimbabwe rwanda burundi malawi botswana namibia liberia leone togo benin ethiopia africa " +
    "mozambique angola senegal gabon congo drc sudan egypt morocco eswatini lesotho madagascar mauritius gambia guinea mali niger chad faso ivoire " +
    "england scotland wales ireland uk britain usa canada germany netherlands holland france belgium austria switzerland spain portugal italy " +
    "sweden norway denmark finland poland latvia lithuania estonia ukraine romania hungary greece cyprus malta " +
    "dubai uae qatar oman kuwait bahrain arabia india israel australia zealand brazil jamaica trinidad bahamas barbados haiti " +
    "illinois indiana iowa kansas kentucky louisiana massachusetts michigan mississippi missouri nebraska nevada oklahoma oregon " +
    "pennsylvania tennessee utah washington wisconsin alabama alaska arkansas colorado connecticut delaware idaho dakota " +
    "london manchester glasgow dundee cardiff birmingham leeds aberdeen edinburgh dublin toronto calgary edmonton alberta winnipeg ontario " +
    "houston dallas chicago atlanta minnesota minneapolis maryland texas tx md nc sc ga arizona carolina virginia georgia florida california york jersey ohio " +
    "abuja lagos jos warri aba enugu kaduna makurdi lokoja calabar owerri harcourt ibadan ilorin kano gboko otukpo asaba uyo yola bauchi minna lafia " +
    "limbe douala yaounde buea accra kumasi tema tamale nairobi kampala arusha salaam dodoma state"
  ).split(" "),
);
// A church or fellowship's name ends with the word, or a place after it
// ("THE LIBERTY CHURCH LONDON"); "THE CHURCH AND ITS MANDATE" is a message.
const VENUE_WORDS =
  /\b(church|cathedral|chapel|tabernacle|ministries|fellowship|embassy)\b,?(?:\s+(?!(?:of|with|and|in|the|to|for|is|vs)\b)[a-z]+){0,2}[,.]?$|\b(the votage|the pistis place)\b|^\w*global$/i;

const SMALL_WORDS = new Set(
  "a an and as at but by for from in into nor of on or per the to unto upon via vs with".split(" "),
);
const ACRONYMS = new Set(
  "rcn rccg iec ioc aec usa uk uae tv tx md nc sc ga ny cwc kft rcnsa gotr fct nt ot kjv q&a mfm ii iii iv vi vii viii ix xi xii xiii".split(
    " ",
  ),
);

// Helpers --------------------------------------------------------------------

function clean(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\bq\s*&\s*a\b/gi, "Q&A")
    .replace(/([A-Za-z]{2,})&([A-Za-z]{2,})/g, "$1 & $2")
    .replace(/,(?=[A-Za-z])/g, ", ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+([,.:;!?])/g, "$1")
    .replace(/^[\s,.:;|@–—-]+|[\s,:;|@–—-]+$/g, "")
    .replace(/\(\s*\)/g, "")
    .trim();
}

function isMostlyCaps(text: string) {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letters) return false;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  return upper / letters.length > 0.7;
}

function capitalise(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Title case for all-caps titles ("THE GIFT OF GOD'S GRACE" → "The Gift of
 * God's Grace"), keeping acronyms. Mixed-case titles keep their own
 * capitals, apart from small words such as "of" and "the".
 */
export function titleCase(text: string) {
  const caps = isMostlyCaps(text);
  let start = true;
  return clean(text)
    .split(" ")
    .map((word) => {
      const first = start;
      // A new phrase starts after a colon, a dash or an opening bracket.
      start = /[:–—-]$/.test(word);
      const bare = word.replace(/^[("'‘“]+|[)"'’”.,:;!?]+$/g, "");
      const lower = bare.toLowerCase();
      let out: string;
      if ((ACRONYMS.has(lower) || /^rcn[a-z]{0,3}$/.test(lower)) && (caps || bare === bare.toUpperCase()))
        out = bare.toUpperCase();
      else if (!first && !word.startsWith("(") && SMALL_WORDS.has(lower)) out = lower;
      else if (!caps) out = first ? capitalise(bare) : bare;
      else
        out = bare
          .split("-")
          .map((part) =>
            // "2ND" → "2nd"; "AEC2020" and "3.0" stay as they are.
            /\d/.test(part)
              ? /^\d+(st|nd|rd|th)$/i.test(part)
                ? part.toLowerCase()
                : part
              : ACRONYMS.has(part.toLowerCase())
                ? part
                : capitalise(part.toLowerCase()),
          )
          .join("-");
      return word.replace(bare, out);
    })
    .join(" ");
}

/** "Lioness Conference 2022" → "lioness-conference-2022". */
export function seriesKeyFor(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .replace(/\b(prayer|vigil)s\b/g, "$1")
    .replace(/\bfast\b/g, "fasting")
    // "Prayer and Fasting" and "Fasting and Prayer" are the same programme.
    .replace(/\bprayer and fasting\b/g, "fasting and prayer")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toNumber(word: string) {
  const lower = word.toLowerCase();
  if (/^\d+$/.test(lower)) return Number(lower);
  return NUMBER_WORDS[lower] ?? ROMAN[lower] ?? null;
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function validDate(y: number, m: number, d: number) {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function fullYear(text: string) {
  const n = Number(text);
  return text.length <= 2 ? 2000 + n : n;
}

const DAY_MS = 86_400_000;

/**
 * Chooses among readings of an ambiguous date (01-02-2021 is 1 February or
 * 2 January): the one on or shortly before the upload, else the first that
 * isn't later than the upload plus a couple of days (a livestream can be
 * uploaded the evening before, in another time zone).
 */
function pickDate(candidates: string[], publishedAt?: string | null) {
  if (!candidates.length) return null;
  if (!publishedAt) return candidates[0];
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return candidates[0];
  const usable = candidates
    .map((date) => ({ date, gap: published - Date.parse(`${date}T12:00:00Z`) }))
    .filter((c) => c.gap > -2 * DAY_MS);
  if (!usable.length) return null;
  usable.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
  return usable[0].date;
}

type DateMatch = { start: number; end: number; date: string | null; time?: string };

const WEEKDAY_PREFIX = `(?:\\b${WEEKDAY}\\.?\\s*(?:\\(?\\s*${TIME_OF_DAY}\\s*\\)?)?\\s*,?\\s*)?`;
const DATE_PATTERNS: {
  re: RegExp;
  read: (m: RegExpExecArray, publishedAt?: string | null) => number[][];
}[] = [
  // 27TH SEPTEMBER 2026, 12TH FEB. 2025, 16THAPRIL 2022, 28th march 2014
  {
    re: new RegExp(
      `${WEEKDAY_PREFIX}\\b(\\d{1,2})\\s*(?:st|nd|rd|th)?\\.?\\s*(?:of\\s+)?${MONTH}\\b\\.*\\s*,?\\s*(\\d{4})\\b\\.?`,
      "gi",
    ),
    read: (m) => [[Number(m[4]), MONTHS[m[3].slice(0, 3).toLowerCase()], Number(m[2])]],
  },
  // OCT 31 2025, JUNE 23RD 2025, March 9th, 2025, Sun, Aug. 30th, 2026
  {
    re: new RegExp(
      `${WEEKDAY_PREFIX}\\b${MONTH}\\b\\.?\\s*(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})\\b\\.?`,
      "gi",
    ),
    read: (m) => [[Number(m[4]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[3])]],
  },
  // SAT. 6-NOV-2021
  {
    re: new RegExp(`${WEEKDAY_PREFIX}\\b(\\d{1,2})\\s*-\\s*${MONTH}\\s*-\\s*(\\d{4})\\b`, "gi"),
    read: (m) => [[Number(m[4]), MONTHS[m[3].slice(0, 3).toLowerCase()], Number(m[2])]],
  },
  // 23/09/26, 06-10-2021, 9-13-26: day first, or month first in US style.
  {
    re: new RegExp(
      `${WEEKDAY_PREFIX}(?<![\\d.])\\b(\\d{1,2})(?:[-/.](\\d{1,2})[-/.](\\d{4}|\\d{2})|\\s*[-/]\\s*(\\d{1,2})\\s*[-/]\\s*(\\d{4}))\\b(?![\\d.])`,
      "gi",
    ),
    read: (m) => {
      const y = fullYear(m[4] ?? m[6]);
      const a = Number(m[2]);
      const b = Number(m[3] ?? m[5]);
      return [
        [y, b, a],
        [y, a, b],
      ];
    },
  },
  // 13TH MARCH: the year of the upload, or the one before.
  {
    re: new RegExp(
      `${WEEKDAY_PREFIX}\\b(\\d{1,2})\\s*(?:st|nd|rd|th)\\.?\\s*(?:of\\s+)?${MONTH}\\b\\.?(?!\\s*,?\\s*\\d)`,
      "gi",
    ),
    read: (m, publishedAt) => {
      const year = publishedAt ? Number(publishedAt.slice(0, 4)) : NaN;
      if (!year) return [];
      const month = MONTHS[m[3].slice(0, 3).toLowerCase()];
      return [
        [year, month, Number(m[2])],
        [year - 1, month, Number(m[2])],
      ];
    },
  },
];

function findDate(title: string, publishedAt?: string | null): DateMatch | null {
  const found: DateMatch[] = [];
  for (const { re, read } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(title))) {
      const candidates = read(m, publishedAt)
        .filter(([y, mo, d]) => validDate(y, mo, d))
        .map(([y, mo, d]) => iso(y, mo, d));
      if (!candidates.length) continue;
      // Skip a match inside one already found (e.g. digits within a longer date).
      const start = m.index;
      const end = m.index + m[0].length;
      if (found.some((f) => start < f.end && end > f.start)) continue;
      found.push({
        start,
        end,
        date: pickDate([...new Set(candidates)], publishedAt),
        time: m[1],
      });
    }
  }
  found.sort((a, b) => a.start - b.start);
  return found[0] ?? null;
}

// Pieces -------------------------------------------------------------------

type Kind = "topic" | "event" | "noise";
type Piece = {
  text: string;
  kind: Kind;
  /** Which bar-separated part of the title it came from. */
  strong: number;
  /** Its place in the title; pieces taken out of brackets sit between. */
  order: number;
  /** Came after " @ " ("… @ KINGDOM RECALIBRATION"): the occasion. */
  after: boolean;
};

type Marks = {
  day: number | null;
  time: string | null;
  finale: boolean;
  sessionNo: number | null;
  vigil: boolean;
  loose: number | null;
  year: number | null;
};

const DAY_RE = new RegExp(
  `\\bday\\s*${NUMBER}\\b(?:\\s*\\(\\d+\\))?(?:\\s*[ab]\\b)?(?:\\s*[-,(]?\\s*${TIME_OF_DAY}\\b\\)?)?(?:\\s+(?:session|service)\\b)?`,
  "i",
);
const TIME_RE = new RegExp(`^\\(?\\s*${TIME_OF_DAY}(?:\\s+session)?\\s*\\)?$`, "i");
const SESSION_RE = new RegExp(`\\bsession\\s+${NUMBER}\\b`, "i");
const MONTH_YEAR_RE = new RegExp(`^${MONTH}\\.?,?\\s+(?:19|20)\\d\\d$`, "i");
const WEEKDAY_RE = new RegExp(`^${WEEKDAY}\\.?$`, "i");

/** Takes day, session and finale markers out of a piece of a title. */
function takeMarks(text: string, marks: Marks) {
  let rest = text;
  const cut = (m: RegExpExecArray) =>
    rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length);
  if (/\bgrand\s+finale\b/i.test(rest)) {
    marks.finale = true;
    rest = rest.replace(/\bgrand\s+finale\b/i, " ");
  }
  const day = DAY_RE.exec(rest);
  const dayNo = day && toNumber(day[1]);
  if (day && dayNo != null && marks.day == null) {
    marks.day = dayNo;
    if (day[2]) marks.time ??= day[2];
    rest = cut(day);
  }
  const session = SESSION_RE.exec(rest);
  const sessionNo = session && toNumber(session[1]);
  if (session && sessionNo != null && marks.sessionNo == null) {
    marks.sessionNo = sessionNo;
    rest = cut(session);
  }
  const time = TIME_RE.exec(clean(rest));
  if (time) {
    marks.time ??= time[1];
    rest = "";
  }
  if (/^\(?\s*vigil\s*\)?$/i.test(clean(rest))) {
    marks.vigil = true;
    rest = "";
  }
  return clean(rest);
}

const SPEAKER_RE = new RegExp(
  `^${TITLES}(${NAME_WORD})(?:\\s+(${NAME_WORD})){0,3}(?:\\s*(?:&|and|,)\\s*(?:${TITLES})?(?:${NAME_WORD})(?:\\s+(?:${NAME_WORD})){0,3})*(?:\\s+live)?$`,
  "i",
);
const AROME = /\barome\b/i;
const AROME_NAME = `${TITLES}arome(?:\\s+osa+yi)?`;
// Not "APOSTLE AROME OSAYI'S BIRTHDAY", which is about him.
const LEADING_AROME = new RegExp(`^${AROME_NAME}\\s+(?!osa+yi)`, "i");
const TRAILING_AROME = new RegExp(`\\s+${AROME_NAME}(?:\\s+live)?$`, "i");
// "TIME-OUT WITH APOSTLE AROME OSAYI", "Carriers of Power by Apostle Arome Osayi"
const WITH_NAME = /(?:^|\s+)(?:with|w\/|by)\s+([^()]+?)(?=\s*\(|$)/i;

function isSpeaker(text: string) {
  if (/^(?:[a-z]+[.,]?\s*)?arome\s+osa+yi(?:\s+live)?$/i.test(text)) return true;
  if (EVENT_WORDS.test(text) || /['’]s\b/i.test(text)) return false;
  if (!SPEAKER_RE.test(text)) return false;
  // Every name word must look like a name, not a phrase.
  const words = text
    .replace(new RegExp(TITLES, "gi"), " ")
    .replace(/\b(and|live)\b|[&,]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.every((w) => !NOT_NAMES.has(w.toLowerCase()));
}

function speakerName(text: string) {
  return titleCase(text.replace(/\s+live$/i, ""))
    .replace(/\s+and\s+/i, " & ")
    .replace(/\b(Apst|Apt|Dr|Rev|Pst|Evang|Barr|Mrs|Mr|Prof|Engr),\s*/g, "$1. ")
    .replace(/,\s+/g, " & ");
}

function isVenue(text: string) {
  if (EVENT_WORDS.test(text) || YEAR_IN.test(text)) return false;
  if (/^(rcn\w*|rccg)\b/i.test(text)) return true;
  if (/(^|\b(of|in|to|for|into|unto)\s)the (church|chapel|tabernacle|fellowship)\b/i.test(text)) return false;
  if (VENUE_WORDS.test(text)) return true;
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.length > 6) return false;
  if (words.some((w) => SMALL_WORDS.has(w) && w !== "and")) return false;
  return PLACES.has(words[words.length - 1]);
}

const YEAR_IN = /\b(?:19|20)\d\d\b|['’]\d\d\b/;

function isEventish(text: string) {
  // "GIFT OF PROPHECY 8: THE POWER OF A TRUE GATHERING" is a message.
  if (text.includes(":")) return false;
  return EVENT_WORDS.test(text) || YEAR_IN.test(text) || /^\d+\s+(days?|hours?)\b/i.test(text);
}

/** A numbered part in a message title: "GIFT OF PROPHECY 19", "THE TELESCOPE PART 2", "Kingdom Utensils (Part I)". */
function numbered(text: string): { series: string; part: number } | null {
  const m =
    /^(.*?[a-z].*?)[\s,]+(?:\(\s*)?(part|pt\.?|vol\.?|volume|book)?\s*(\d{1,3}|i{1,3}|iv|vi{0,3}|ix|x)\s*\)?(?:\s*[:;]\s*.+)?$/i.exec(
      text,
    );
  if (!m) return null;
  const series = clean(m[1]);
  const part = toNumber(m[3]);
  if (part == null || part < 1 || part > 150) return null;
  const labelled = !!m[2];
  // A roman numeral needs "Part" or brackets ("SUCH AS I HAVE" isn't one).
  if (/^[ivx]+$/i.test(m[3]) && !labelled && !/\(/.test(text)) return null;
  // A bare trailing number needs a name of more than a word.
  if (!labelled && series.split(/\s+/).length < 2) return null;
  if (EVENT_WORDS.test(series) || YEAR_IN.test(series)) return null;
  return { series, part };
}

// Parser ---------------------------------------------------------------------

/**
 * Parses a sermon's YouTube title. `publishedAt` (the upload time) settles
 * ambiguous dates and dates the event when the title doesn't.
 */
export function parseTitle(title: string, publishedAt?: string | null): ParsedTitle {
  // NFKC turns styled letters (𝐂𝐀𝐌𝐏 𝐌𝐄𝐄𝐓𝐈𝐍𝐆) into plain ones; square
  // brackets read as round ones.
  let text = title
    .normalize("NFKC")
    .replace(/\((mrs|mr|dr)\.?\)/gi, "$1.")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/(\d)(days?)\b/gi, "$1 $2")
    .replace(/\bRCN(?=[A-Z]{4,})/g, "RCN ")
    .replace(/\s+/g, " ")
    .trim();
  // "TAKING ROOTS II SPECIAL SUNDAY II APOSTLE AROME OSAYI": II typed for bars.
  if ((text.match(/\sII\s/g) ?? []).length > 1) text = text.replace(/\s+II\s+/g, " | ");
  text = text.replace(/\s+II\s+(?=(?:RCN|APOSTLE|APST|DR|REV|PASTOR)\b)/g, " | ");
  const marks: Marks = {
    day: null,
    time: null,
    finale: false,
    sessionNo: null,
    vigil: false,
    loose: null,
    year: null,
  };

  // The preaching date, wherever it is; its place becomes a separator.
  const date = findDate(text, publishedAt);
  if (date) {
    text = `${text.slice(0, date.start)} | ${text.slice(date.end)}`;
    if (date.time) marks.time = date.time;
  }
  const preachedOn = date?.date ?? null;

  // "DR. AROME OSAYI I DAY 2": a capital I typed for a bar.
  text = text.replace(/\s+I\s+(?=DAY\b)/g, " | ");

  // Bars first, then " @ " (what follows is the occasion), then dashes
  // with a space on at least one side ("LIMBE-CAMEROUN" stays whole).
  const pieces: Piece[] = [];
  text.split(/\s*\|+\s*/).forEach((bar, strong) => {
    bar.split(/\s+@\s+/).forEach((at, atIndex) => {
      for (const piece of at.split(/\s+[-–—]+\s*|\s*[-–—]+\s+/))
        if (clean(piece))
          pieces.push({
            text: piece,
            kind: "topic",
            strong,
            order: pieces.length,
            after: atIndex > 0,
          });
    });
  });

  const speakers: string[] = [];
  const venues: string[] = [];
  const asides: Piece[] = [];

  /** Takes what it can out of a piece; returns the rest (empty when used up). */
  function classify(raw: string, piece: Piece): string {
    let rest = clean(raw);
    if (!rest) return "";
    if (/^(rebroadcast|live|replay|full service)$/i.test(rest)) return "";
    if (WEEKDAY_RE.test(rest)) return "";
    // A year on its own: "(2016)", "2022".
    const year = /^\(?['’]?((?:19|20)\d\d)\)?$/.exec(rest);
    if (year) {
      marks.year ??= Number(year[1]);
      return "";
    }
    // A month and year on its own ("JUNE 2024") adds nothing to the upload date.
    if (MONTH_YEAR_RE.test(rest)) return "";
    // A lone number after the rest of the title: a part.
    if (/^\d{1,2}$/.test(rest)) {
      marks.loose ??= Number(rest);
      return "";
    }

    // A preacher named inside the piece: "TIME-OUT WITH APOSTLE AROME
    // OSAYI", "APOSTLE AROME OSAYI IEC 2020", "THE GIFT OF PROPHECY APST. AROME OSAYI".
    const named = WITH_NAME.exec(rest);
    if (named && isSpeaker(clean(named[1]))) {
      speakers.push(clean(named[1]));
      rest = clean(rest.replace(named[0], " "));
    }
    if (!isSpeaker(rest)) {
      for (const re of [LEADING_AROME, TRAILING_AROME]) {
        const m = re.exec(rest);
        if (m && clean(rest.replace(re, " "))) {
          speakers.push(clean(m[0]));
          rest = clean(rest.replace(re, " "));
        }
      }
    }

    // Brackets: a speaker, a day, the occasion, or part of the message.
    const wrapped = /^\(([^()]*)\)$/.exec(rest);
    if (wrapped) rest = clean(wrapped[1]);
    const host = clean(rest.replace(/\([^()]*\)/g, " "));
    rest = rest.replace(/\(([^()]*)\)/g, (whole: string, inner: string) => {
      if (/^\s*part\s+/i.test(inner) || MONTH_YEAR_RE.test(inner.trim())) return whole;
      const left = classify(inner, piece);
      if (!left) return " ";
      // "JUNE CONTACT (TESTIMONIES OF EPHESIANS)": the message in brackets
      // after the occasion, or the occasion after the message.
      if (host && isEventish(left) !== isEventish(host) && /\s/.test(left)) {
        asides.push({
          ...piece,
          text: left,
          kind: isEventish(left) ? "event" : "topic",
          order: piece.order + 0.5,
        });
        return " ";
      }
      return `(${left})`;
    });
    rest = clean(rest);
    if (!rest) return "";

    if (isSpeaker(rest)) {
      speakers.push(rest);
      return "";
    }
    rest = takeMarks(rest, marks);
    if (!rest) return "";
    if (isSpeaker(rest)) {
      speakers.push(rest);
      return "";
    }
    if (isVenue(rest)) {
      venues.push(rest);
      return "";
    }
    return rest;
  }

  for (const piece of pieces) {
    piece.text = classify(piece.text, piece);
    piece.kind = !piece.text
      ? "noise"
      : piece.after
        ? "event"
        : numbered(piece.text)
          ? "topic"
          : isEventish(piece.text)
            ? "event"
            : "topic";
  }

  // "WOMEN CONFERENCE: THE CRY OF THE LIONESSES": the occasion, then the message.
  for (const piece of [...pieces]) {
    const colon = /^([^:]+?)\s*:\s*(.+)$/.exec(piece.text);
    if (piece.kind === "topic" && colon && EVENT_WORDS.test(colon[1]) && !EVENT_WORDS.test(colon[2])) {
      piece.text = colon[1];
      piece.kind = "event";
      asides.push({ ...piece, text: colon[2], kind: "topic", order: piece.order + 0.5 });
    }
  }

  // Message pieces split only by a dash belong together:
  // "Prayer - Power Over Depravity" → "Prayer: Power Over Depravity".
  const all = [...pieces, ...asides]
    .filter((p) => p.kind !== "noise")
    .sort((a, b) => a.order - b.order);
  const merged: Piece[] = [];
  for (const piece of all) {
    const last = merged[merged.length - 1];
    if (
      last?.kind === "topic" &&
      piece.kind === "topic" &&
      last.strong === piece.strong &&
      Number.isInteger(piece.order) &&
      piece.order === Math.ceil(last.order) + (Number.isInteger(last.order) ? 1 : 0)
    ) {
      last.text = `${last.text}: ${piece.text}`;
      last.order = piece.order;
    } else merged.push({ ...piece });
  }

  const topics = merged.filter((p) => p.kind === "topic").map((p) => p.text);
  const events = merged.filter((p) => p.kind === "event").map((p) => p.text);
  // A numbered message wins over a series name beside it
  // ("DOCTRINE AND BALANCE || SANCTIFICATION PART 3").
  const numberedAt = topics.findIndex((t) => numbered(t));
  if (numberedAt > 0) topics.unshift(...topics.splice(numberedAt, 1));
  let topic = topics[0] ?? null;
  let event = events[0] ?? null;
  // Two occasions and no message: the service names this sermon and the
  // gathering is the occasion ("INTERNATIONAL EAGLES CONFERENCE ||
  // ORDINATION SERVICE", "MIRACLE & HEALING SERVICE || AEC '25").
  if (!topic && events.length > 1) {
    const service = events.findIndex((e) => !YEAR_IN.test(e) && !GATHERING_WORDS.test(e));
    const at = service >= 0 ? service : 1;
    topic = events[at];
    event = events[at === 0 ? 1 : 0];
  }
  // Two messages and no occasion: in the older capitals style the second is
  // the occasion ("THE WORD OF RIGHTEOUSNESS 11 || THE REMNANT VOICE"); in
  // newer titles it's a subtitle ("The Heavenly Calling | Understanding Your
  // Purpose in Christ"), which only the exact title keeps.
  if (!event && topics.length > 1 && isMostlyCaps(topics[1])) event = topics[1];
  // "Theme: Spiritual Knowledge"
  if (topic) topic = topic.replace(/^theme\s*:\s*/i, "");

  // Which part of the occasion, and its number.
  const time = marks.time
    ? capitalise(
        marks.time
          .toLowerCase()
          .replace(/^morn?$/, "morning")
          .replace(/^eve(n\w*)?$/, "evening"),
      )
    : null;
  let session: string | null = null;
  if (marks.finale) session = "Grand Finale";
  else if (marks.day != null) session = `Day ${marks.day}${time ? ` ${time}` : ""}`;
  else if (marks.sessionNo != null) session = `Session ${marks.sessionNo}`;
  else if (time) session = `${time} Session`;
  else if (marks.vigil) session = "Vigil";
  const part = marks.day ?? marks.sessionNo ?? null;
  // A morning or a vigil alone doesn't make a series; a day or a finale does.
  const multiDay = marks.day != null || marks.sessionNo != null || marks.finale;

  // The series: a numbered message ("GIFT OF PROPHECY 19"), a gathering
  // over several days, or a teaching given over several days.
  const numberedTopic = topic ? numbered(topic) : null;
  let seriesName: string | null = null;
  let dated = false;
  let seriesPart = part;
  if (numberedTopic) {
    seriesName = numberedTopic.series;
    seriesPart = numberedTopic.part;
  } else if (event && (multiDay || GATHERING_WORDS.test(event))) {
    // "CAMEROON FOR JESUS | … | Crusade & Conference": a generic occasion
    // takes its name from the message beside it.
    const generic = /^(?:(?:crusade|conference|convention|summit|seminar|retreat|camp|service|meeting|vigil)\s*(?:&|and)?\s*)+$/i;
    const bare = event.replace(YEAR_IN, "").trim();
    seriesName = generic.test(bare) && topic ? `${titleCase(topic)} ${titleCase(event)}` : event;
    dated = true;
  } else if (topic && !event && multiDay) {
    seriesName = topic;
    dated = true;
  }
  if (seriesName && seriesPart == null) seriesPart = marks.loose;

  // A gathering is told apart by its year: the title's, else when it was preached.
  const year =
    marks.year ??
    (preachedOn ? Number(preachedOn.slice(0, 4)) : null) ??
    (publishedAt ? Number(publishedAt.slice(0, 4)) : null);
  let series: string | null = null;
  if (seriesName) {
    series = titleCase(seriesName);
    if (dated && year && !YEAR_IN.test(series)) series = `${series} ${year}`;
  }

  // The headline: the message, else the occasion and which part of it.
  const sessionSuffix = session ? `: ${session}` : "";
  const withoutYear = (name: string) => name.replace(/\s+(?:(?:19|20)\d\d|['’]\d\d)$/, "");
  let headline: string;
  if (topic) headline = titleCase(topic) + (dated && !event ? sessionSuffix : "");
  else if (event) headline = withoutYear(titleCase(event)) + sessionSuffix;
  else if (venues.length) headline = titleCase(venues[0]) + sessionSuffix;
  else headline = titleCase(speakers[0] ?? title);

  // Name other preachers; Apostle Arome Osayi alone is the channel's default.
  const names: string[] = [];
  let aromeNamed = false;
  for (const name of speakers.map(speakerName)) {
    const aromeOnly = AROME.test(name) && !/&/.test(name);
    if (aromeOnly && aromeNamed) continue;
    aromeNamed ||= aromeOnly;
    if (!names.includes(name)) names.push(name);
  }
  const speaker = names.some((name) => !AROME.test(name) || /&/.test(name))
    ? names.join(" & ")
    : null;

  return {
    headline,
    event: event ? titleCase(event) : null,
    series,
    seriesKey: series ? seriesKeyFor(series) : null,
    part: seriesName ? seriesPart : part,
    session,
    speaker,
    venue: venues.length ? titleCase(venues.join(", ")) : null,
    preachedOn,
  };
}

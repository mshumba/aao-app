/**
 * Times as the concept writes them, and as screen readers should say them.
 * Show with `tabular` figures (theme.ts) wherever they can change.
 */

/** 6747 → "1:52:27"; 284 → "4:44". */
export function clockText(total: number) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** 6747 → "1 hour 52 minutes 27 seconds", for accessibility labels. */
export function spokenTime(total: number) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (sec) parts.push(`${sec} second${sec === 1 ? "" : "s"}`);
  return parts.join(" ") || "0 seconds";
}

/** 7680 → "2 hr 8 min"; 2880 → "48 min" (whole minutes, rounded down). */
export function durationText(seconds: number | null | undefined) {
  if (seconds == null || seconds < 0) return "";
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** 2880 → "48 min left"; under a minute → "Under a minute left". */
export function leftText(seconds: number) {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes < 1) return "Under a minute left";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min left`;
  return m ? `${h} hr ${m} min left` : `${h} hr left`;
}

/** "48 min left" → "48 minutes left"; "2 hr 8 min" → "2 hours 8 minutes". */
export function spokenText(text: string) {
  return text
    .replace(/\b1 hr\b/g, "1 hour")
    .replace(/\bhr\b/g, "hours")
    .replace(/\b1 min\b/g, "1 minute")
    .replace(/\bmin\b/g, "minutes");
}

/** "2 hr 8 min" (a catalogue duration) → 7680 seconds; null when unreadable. */
export function parseDuration(text: string | null | undefined) {
  if (!text) return null;
  const h = /(\d+)\s*hr/.exec(text);
  const m = /(\d+)\s*min/.exec(text);
  if (!h && !m) return null;
  return (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0);
}

/** Kicker separators become full stops when read aloud. */
export function spokenKicker(text: string) {
  return text.replace(/\s*·\s*/g, ". ");
}

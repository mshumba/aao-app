/**
 * Splits `text` around one phrase set in italics: `italic` (the editor's
 * phrase, first match, any case) or, with `italicLast`, the last word. The
 * words are never changed; only the face of one phrase is.
 */
export function splitItalic(text: string, italic?: string | null, italicLast = false) {
  if (italic) {
    const at = text.toLocaleLowerCase().indexOf(italic.toLocaleLowerCase());
    if (at >= 0)
      return { before: text.slice(0, at), italic: text.slice(at, at + italic.length), after: text.slice(at + italic.length) };
  }
  if (italicLast) {
    const match = /^(.*\s)(\S+)(\s*)$/s.exec(text);
    if (match) return { before: match[1], italic: match[2], after: match[3] };
  }
  return { before: text, italic: "", after: "" };
}

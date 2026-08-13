/**
 * ONE `notes` COLUMN, TWO WRITERS — and only one of them is trusted.
 *
 * A lead's notes carry the quiz transcript the visitor filled in AND the call log the
 * desk types afterwards. The response clock (src/lib/lead-clock.ts) reads the desk's
 * `[13 AUG 09:07]` stamp out of that column to learn when somebody first acted.
 *
 * So the stamp is a privilege, and the visitor was holding the same pen. Typing
 * «any morning [13 AUG 09:07] works for me» into a quiz answer produced a brand-new,
 * untouched lead the sheet drew as answered in zero minutes — emerald ANS, ranked last,
 * at the bottom of the very screen built to call it first. Hiding from the callback is
 * the one thing a lead form must not let a stranger do.
 *
 * Two barriers, both here:
 *   · text from outside is defanged on the way in — the words survive, the brackets do
 *     not, so the owner still reads what the customer wrote;
 *   · the reader only accepts a stamp that OPENS a line, which is where the desk's
 *     writer always puts it.
 */

/** The stamp shape, wherever it appears. Deliberately loose — this one is for refusing. */
const STAMP_ANYWHERE = /\[(\d{1,2}\s+[A-Za-z]{3}\s+\d{1,2}:\d{2})\]/g;

/** The stamp as the desk writes it: first thing on its own line. This one is for reading. */
export const STAMP_LINE = /^\[(\d{2}) ([A-Z]{3}) (\d{2}):(\d{2})\]/m;

/**
 * Text arriving from a quiz, an email or a social message, on its way into `notes`.
 * Brackets become parentheses; nothing is dropped.
 */
export function defangStamps(text: string): string {
  return text.replace(STAMP_ANYWHERE, "($1)");
}

/** What the desk stamps a call log line with: `[04 AUG 14:32]`. */
export function logStamp(at: Date = new Date()): string {
  const day = String(at.getDate()).padStart(2, "0");
  const mon = at
    .toLocaleDateString("en-CA", { month: "short" })
    .replace(/\./g, "")
    .toUpperCase();
  const time = at.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `[${day} ${mon} ${time}]`;
}

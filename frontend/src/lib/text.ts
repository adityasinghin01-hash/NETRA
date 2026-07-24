// One emoji/pictograph stripper for the whole app, so spoken output and shown text strip the
// SAME set. Uses code-point ranges with the `u` flag — voice.ts previously used a hardcoded
// character class WITHOUT `u`, which treats surrogate-pair emoji as two separate code units
// (incomplete stripping + orphan variation selectors like ⚠️ → ️). Kannada and normal
// punctuation are untouched.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu;

export const stripEmoji = (t: string) =>
  t.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+/gm, "").trim();

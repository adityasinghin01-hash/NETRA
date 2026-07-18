// The Copilot's honest "learns from use" loop. Officer 👍/👎 reweights which knowledge
// cards retrieval favours (learning-to-rank), and confirmed answers join a growing memory
// reused for similar future questions. Persisted in localStorage — a real, demoable loop.
// (True model fine-tuning/LoRA is roadmap, not faked.)
const WK = "netra_fb_weights";
const MK = "netra_fb_memory";

function load<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) || "") as T; } catch { return d; } }
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

// --- learning-to-rank weights (cardId → multiplier, default 1) ---
export function weightOf(id: string): number {
  const w = load<Record<string, number>>(WK, {});
  return w[id] ?? 1;
}
export function recordFeedback(cardIds: string[], up: boolean): number {
  const w = load<Record<string, number>>(WK, {});
  for (const id of cardIds) {
    const cur = w[id] ?? 1;
    w[id] = Math.max(0.3, Math.min(2, cur + (up ? 0.2 : -0.2)));
  }
  save(WK, w);
  return cardIds.length;
}

// --- growing memory of confirmed answers ---
export interface Memory { q: string; a: string; cites: string[]; ts: number }
export function remember(q: string, a: string, cites: string[]) {
  const m = load<Memory[]>(MK, []);
  m.unshift({ q, a, cites, ts: Date.now() });
  save(MK, m.slice(0, 50));
}
export function memorySize(): number { return load<Memory[]>(MK, []).length; }

const STOP = new Set("the a an and or of to in on at for with is was who what which where when how".split(" "));
const toks = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((t) => !STOP.has(t)));
// Recall a prior confirmed answer whose question strongly overlaps this one.
export function recallMemory(q: string): Memory | null {
  const m = load<Memory[]>(MK, []);
  if (!m.length) return null;
  const qt = toks(q);
  let best: Memory | null = null, bestScore = 0;
  for (const mem of m) {
    const mt = toks(mem.q);
    const inter = [...qt].filter((t) => mt.has(t)).length;
    const score = inter / Math.max(1, Math.min(qt.size, mt.size));
    if (score > bestScore) { bestScore = score; best = mem; }
  }
  return bestScore >= 0.6 ? best : null;
}

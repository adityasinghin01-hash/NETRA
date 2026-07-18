// NETRA Copilot — the sovereign, grounded, agentic assistant. Ask anything (EN/Kannada) →
// hybrid retrieval + knowledge-graph → GLM-4.7 composes a cited answer, can call tools
// (map / diagram / document / search), shows its reasoning trace + confidence, and falls
// back to a deterministic sovereign engine if the LLM is unavailable. नेत्र = "eye".
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { askNetra, preloadCopilot, type NetraAnswer } from "@/lib/copilotEngine";
import { getSession } from "@/lib/auth";
import { recordFeedback, remember } from "@/lib/feedback";
import { vlmExtract } from "@/lib/llm";
import { speak, listen, stopSpeaking, isKannada } from "@/lib/voice";
import type { UiAction } from "@/lib/copilotTools";
import CopilotDiagram from "@/components/CopilotDiagram";
import CopilotDocument from "@/components/CopilotDocument";

interface Msg {
  role: "user" | "netra";
  text: string;
  q?: string;
  cites?: string[];
  cardIds?: string[];
  follow?: string[];
  trace?: string[];
  confidence?: number;
  actions?: UiAction[];
  grounded?: boolean;
  fed?: "up" | "down";
}

const STARTERS = [
  "Which hotspots next week?",
  "Draw the link chart for the shutter-cutting burglar",
  "Cases at risk of going cold in Mysuru?",
  "Draft a lookout notice for the chain-snatching series",
];

function bold(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="font-semibold text-[var(--color-text)]">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

export default function Copilot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [deep, setDeep] = useState(false);
  const [listening, setListening] = useState(false);
  const [showTrace, setShowTrace] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const scope = getSession().district;

  useEffect(() => { preloadCopilot(); }, []);
  useEffect(() => { if (!open) stopSpeaking(); }, [open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [msgs, thinking]);

  async function send(text: string, fromVoice = false) {
    const t = text.trim();
    if (!t || thinking) return;
    stopSpeaking();
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setThinking(true);
    let a: NetraAnswer;
    try {
      a = await askNetra(t, scope, { thinking: deep });
    } catch {
      a = { text: "Something went wrong reading the intelligence. Please try again.", cites: [], cardIds: [], follow: [], trace: [], actions: [], confidence: 0, grounded: false };
    }
    setThinking(false);
    setMsgs((m) => [...m, { role: "netra", text: a.text, q: t, cites: a.cites, cardIds: a.cardIds, follow: a.follow, trace: a.trace, confidence: a.confidence, actions: a.actions, grounded: a.grounded }]);
    // A voice-asked question speaks its reply (full hands-free lives in Talk mode).
    if (fromVoice) speak(a.text, isKannada(a.text) ? "kn-IN" : "en-IN");
  }

  function feedback(i: number, up: boolean) {
    setMsgs((m) => m.map((msg, k) => {
      if (k !== i || msg.role !== "netra") return msg;
      recordFeedback(msg.cardIds ?? [], up);
      if (up && msg.q) remember(msg.q, msg.text, msg.cites ?? []);
      return { ...msg, fed: up ? "up" : "down" };
    }));
  }

  // Multimodal OCR: drop a scanned FIR / document → Qwen VLM extracts structured fields.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.readAsDataURL(f); });
    setMsgs((m) => [...m, { role: "user", text: `📄 Uploaded ${f.name}` }]);
    setThinking(true);
    let out = "";
    try {
      out = await vlmExtract("Extract the case/FIR fields from this police document image as JSON with keys crimeNo, crimeType, district, date, complainant, accused, sections, briefFacts. Use only what is visible; omit unknown fields.", [b64]);
    } catch { out = "I couldn't read that document."; }
    setThinking(false);
    setMsgs((m) => [...m, { role: "netra", text: out || "No fields extracted.", grounded: true, trace: ["🖼️ Qwen VLM — OCR + field extraction (sovereign)"] }]);
  }

  function mic() { listen((t) => { setInput(t); send(t, true); }, setListening, "en-IN"); }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="NETRA Copilot"
        className="fixed bottom-5 right-5 z-[2000] flex items-center gap-2 rounded-full border border-[var(--color-accent-dim)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] shadow-xl transition-transform hover:scale-105"
        style={{ boxShadow: "0 0 26px rgba(34,211,238,0.3)" }}
      >
        <span className={`text-xl ${thinking ? "netra-eye-scan" : ""}`}>👁️</span>
        {!open && <span>Ask NETRA</span>}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-[2000] flex h-[640px] w-[420px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={`text-lg ${thinking ? "netra-eye-scan" : ""}`}>👁️</span>
              <div>
                <div className="text-sm font-semibold text-[var(--color-text)]">NETRA Copilot</div>
                <div className="text-[10px] text-[var(--color-text-mute)]">grounded · cited · sovereign{scope ? ` · ${scope}` : ""}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDeep((d) => !d)}
                title="Deep-analysis mode (slower, step-by-step reasoning)"
                className={`rounded-md border px-2 py-1 text-[10px] transition-colors ${deep ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]" : "border-[var(--color-border)] text-[var(--color-text-mute)]"}`}
              >🧠 Deep</button>
              <button onClick={() => setOpen(false)} className="text-[var(--color-text-mute)] hover:text-[var(--color-text)]">✕</button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">
                  Ask anything about the intelligence — hotspots, serial series, rings & kingpins, cold cases, a district — in English or ಕನ್ನಡ. I answer from live data with citations, can draw diagrams, draft documents, and show things on the map.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-[var(--color-accent-dim)] px-2.5 py-1 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10">{s}</button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--color-accent)] px-3 py-2 text-xs text-[var(--color-bg)]">{m.text}</div>
                ) : (
                  <div className="max-w-[95%] space-y-2">
                    <div className="rounded-2xl rounded-bl-sm bg-[var(--color-bg)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-text-dim)]">
                      <div className="whitespace-pre-wrap">{bold(m.text)}</div>
                      {/* confidence + source badge */}
                      <div className="mt-2 flex items-center gap-2">
                        {typeof m.confidence === "number" && (
                          <span className="flex items-center gap-1 text-[9px] text-[var(--color-text-mute)]">
                            <span className="inline-block h-1.5 w-10 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                              <span className="block h-full" style={{ width: `${Math.round(Math.min(1, m.confidence) * 100)}%`, background: m.confidence > 0.4 ? "var(--color-ok)" : m.confidence > 0.15 ? "var(--color-warn)" : "var(--color-danger)" }} />
                            </span>
                            confidence
                          </span>
                        )}
                        <span className="text-[9px] text-[var(--color-text-mute)]">{m.grounded ? "🟢 GLM-4.7 grounded" : "⚪ sovereign engine"}</span>
                        {m.trace && m.trace.length > 0 && (
                          <button onClick={() => setShowTrace(showTrace === i ? null : i)} className="text-[9px] text-[var(--color-accent)]/80 hover:text-[var(--color-accent)]">
                            {showTrace === i ? "hide reasoning" : "how?"}
                          </button>
                        )}
                        <button onClick={() => speak(m.text)} title="Read aloud" className="text-[10px] text-[var(--color-text-mute)] hover:text-[var(--color-accent)]">🔊</button>
                      </div>
                      {showTrace === i && m.trace && (
                        <ul className="mt-1.5 space-y-0.5 border-t border-[var(--color-border)] pt-1.5 text-[9px] text-[var(--color-text-mute)]">
                          {m.trace.map((t, k) => <li key={k}>• {t}</li>)}
                        </ul>
                      )}
                      {m.cites && m.cites.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {m.cites.map((c) => <span key={c} className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-mute)]">📎 {c}</span>)}
                        </div>
                      )}
                      {/* feedback — the honest learning loop */}
                      {m.fed ? (
                        <div className="mt-1.5 text-[9px] text-[var(--color-ok)]">✓ {m.fed === "up" ? "NETRA learned from this — ranking reinforced & remembered" : "Noted — NETRA will down-rank this next time"}</div>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--color-text-mute)]">
                          Helpful?
                          <button onClick={() => feedback(i, true)} className="hover:text-[var(--color-ok)]">👍</button>
                          <button onClick={() => feedback(i, false)} className="hover:text-[var(--color-danger)]">👎</button>
                        </div>
                      )}
                    </div>

                    {/* actions: diagram / document / navigate */}
                    {m.actions?.map((act, k) => {
                      if (act.kind === "diagram") return <CopilotDiagram key={k} action={act} />;
                      if (act.kind === "document") return <CopilotDocument key={k} action={act} />;
                      if (act.kind === "navigate") return (
                        <button key={k} onClick={() => { nav(act.to); setOpen(false); }} className="rounded-lg border border-[var(--color-accent-dim)] px-2.5 py-1.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10">→ {act.label}</button>
                      );
                      if (act.kind === "map") return (
                        <button key={k} onClick={() => { nav("/map"); setOpen(false); }} className="rounded-lg border border-[var(--color-accent-dim)] px-2.5 py-1.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10">🗺️ Show on the Command Map</button>
                      );
                      return null;
                    })}

                    {m.follow && m.follow.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.follow.map((f) => (
                          <button key={f} onClick={() => send(f)} className="rounded-full border border-[var(--color-border-strong)] px-2 py-0.5 text-[10px] text-[var(--color-text-dim)] hover:border-[var(--color-accent-dim)] hover:text-[var(--color-accent)]">{f}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {thinking && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-mute)]">
                <span className="netra-eye-scan text-base">👁️</span> {deep ? "Reasoning deeply…" : "Scanning the records…"}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-1.5 border-t border-[var(--color-border)] p-3">
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} title="Upload a document to read (OCR)" className="shrink-0 rounded-lg border border-[var(--color-border)] px-2 py-2 text-xs text-[var(--color-text-mute)] hover:text-[var(--color-accent)]">📎</button>
            <button type="button" onClick={mic} title="Speak your question" className={`shrink-0 rounded-lg border px-2 py-2 text-xs ${listening ? "border-[var(--color-danger)] text-[var(--color-danger)]" : "border-[var(--color-border)] text-[var(--color-text-mute)] hover:text-[var(--color-accent)]"}`}>{listening ? "●" : "🎤"}</button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask NETRA anything…"
              className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs outline-none focus:border-[var(--color-accent)]"
            />
            <button type="submit" disabled={thinking || !input.trim()} className="shrink-0 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-[var(--color-bg)] disabled:opacity-40">Ask</button>
          </form>
        </div>
      )}

      <style>{`
        @keyframes netraScan { 0%,100% { transform: scale(1); filter: hue-rotate(0deg) brightness(1); } 50% { transform: scale(1.18); filter: hue-rotate(40deg) brightness(1.4); } }
        .netra-eye-scan { display: inline-block; animation: netraScan 0.9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .netra-eye-scan { animation: none; } }
      `}</style>
    </>
  );
}

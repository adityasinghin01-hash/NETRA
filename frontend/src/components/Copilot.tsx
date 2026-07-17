// NETRA Copilot — a global, context-aware assistant. Grounded answers from the platform's
// own intelligence with citations (sovereign, no external LLM). The thinking state is the
// NETRA eye scanning — नेत्र = "eye", the brand performing its meaning.
import { useEffect, useRef, useState } from "react";
import { askCopilot, preloadCopilot, type CopilotAnswer } from "@/lib/copilot";
import { getSession } from "@/lib/auth";

interface Msg { role: "user" | "netra"; text: string; cites?: string[]; follow?: string[] }

const STARTERS = ["Which hotspots next week?", "Who are the crime kingpins?", "Cases at risk of going cold?", "Tell me about the shutter-cutting burglar"];

function bold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-[var(--color-text)]">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}

export default function Copilot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scope = getSession().district;

  useEffect(() => { preloadCopilot(); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [msgs, thinking]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || thinking) return;
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setThinking(true);
    let a: CopilotAnswer;
    try {
      a = await askCopilot(t, scope);
    } catch {
      a = { text: "Something went wrong reading the intelligence. Please try again.", cites: [], follow: [] };
    }
    // brief scan delay so the eye "thinks"
    await new Promise((r) => setTimeout(r, 550));
    setThinking(false);
    setMsgs((m) => [...m, { role: "netra", text: a.text, cites: a.cites, follow: a.follow }]);
  }

  return (
    <>
      {/* Launcher — the NETRA eye */}
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
        <div className="fixed bottom-20 right-5 z-[2000] flex h-[560px] w-[384px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={`text-lg ${thinking ? "netra-eye-scan" : ""}`}>👁️</span>
              <div>
                <div className="text-sm font-semibold text-[var(--color-text)]">NETRA Copilot</div>
                <div className="text-[10px] text-[var(--color-text-mute)]">grounded · cited · sovereign{scope ? ` · ${scope}` : ""}</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-[var(--color-text-mute)] hover:text-[var(--color-text)]">✕</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">
                  Ask about hotspots, serial clusters, crime rings & kingpins, cold cases, crime timing, or any district — answered from live intelligence, with citations.
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
                <div className={m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--color-accent)] px-3 py-2 text-xs text-[var(--color-bg)]"
                  : "max-w-[92%] rounded-2xl rounded-bl-sm bg-[var(--color-bg)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-text-dim)]"}>
                  <div>{m.role === "netra" ? bold(m.text) : m.text}</div>
                  {m.cites && m.cites.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.cites.map((c) => (
                        <span key={c} className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-mute)]">📎 {c}</span>
                      ))}
                    </div>
                  )}
                  {m.follow && m.follow.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.follow.map((f) => (
                        <button key={f} onClick={() => send(f)} className="rounded-full border border-[var(--color-border-strong)] px-2 py-0.5 text-[10px] text-[var(--color-text-dim)] hover:border-[var(--color-accent-dim)] hover:text-[var(--color-accent)]">{f}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-mute)]">
                <span className="netra-eye-scan text-base">👁️</span> Scanning the records…
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2 border-t border-[var(--color-border)] p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask NETRA…"
              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs outline-none focus:border-[var(--color-accent)]"
            />
            <button type="submit" disabled={thinking || !input.trim()} className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-[var(--color-bg)] disabled:opacity-40">Ask</button>
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

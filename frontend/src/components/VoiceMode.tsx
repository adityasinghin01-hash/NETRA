// NETRA Voice Intelligence — a full-screen, hands-free voice assistant. Always listening,
// interrupts itself the moment you speak (barge-in), and answers aloud from the same
// grounded Copilot brain. An animated eye/orb reflects its state (listening / thinking /
// speaking). Robotic browser voice for now; neural voice is a swap-in later.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { askNetra } from "@/lib/copilotEngine";
import { getSession } from "@/lib/auth";
import { speak, stopSpeaking, isKannada, createRecognizer, canListen, type Recognizer } from "@/lib/voice";

type Mode = "idle" | "listening" | "thinking" | "speaking";
interface Turn { role: "you" | "netra"; text: string }

// Is this a short follow-up that needs the previous topic for context?
const isFollowUp = (q: string) =>
  q.split(/\s+/).length < 5 || /^(and|what about|where|when|who|why|how|that|it|them|they|next|more|also|then)\b/i.test(q.trim());

export default function VoiceMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState("");
  const modeRef = useRef<Mode>("idle");
  const recRef = useRef<Recognizer | null>(null);
  const lastQ = useRef("");
  const speakAt = useRef(0); // when TTS started → ignore self-echo barge-in briefly
  const nav = useNavigate();
  const scope = getSession().district;
  useEffect(() => { modeRef.current = mode; }, [mode]);

  async function handleQuery(text: string) {
    if (modeRef.current === "thinking") return; // don't interrupt a pending answer
    stopSpeaking();
    setInterim("");
    setTurns((t) => [...t, { role: "you", text }]);
    setMode("thinking");
    const q = isFollowUp(text) && lastQ.current ? `${lastQ.current}. ${text}` : text;
    let ans = "";
    try {
      const a = await askNetra(q, scope);
      ans = a.text;
      for (const act of a.actions) {
        if (act.kind === "map") nav("/map");
        else if (act.kind === "navigate") nav(act.to);
      }
    } catch { ans = "Sorry, I couldn't reach the intelligence just now."; }
    lastQ.current = text;
    setTurns((t) => [...t, { role: "netra", text: ans }]);
    setMode("speaking");
    speakAt.current = Date.now();
    speak(ans, isKannada(ans) ? "kn-IN" : "en-IN", () => {
      if (modeRef.current === "speaking") setMode("listening");
    });
  }

  // Start/stop the continuous recognizer with the overlay.
  useEffect(() => {
    if (!open) return;
    setTurns([]); setInterim(""); setMode("listening");
    const rec = createRecognizer({
      lang: "en-IN",
      onSpeechStart: () => { if (modeRef.current === "speaking" && Date.now() - speakAt.current > 700) { stopSpeaking(); setMode("listening"); } },
      onInterim: (t) => setInterim(t),
      onFinal: (t) => handleQuery(t),
    });
    recRef.current = rec;
    rec?.start();
    return () => { rec?.stop(); stopSpeaking(); setMode("idle"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const label = { idle: "", listening: "Listening… just speak", thinking: "Thinking…", speaking: "Speaking — talk any time to interrupt" }[mode];

  return (
    <div className="fixed inset-0 z-[3000] flex flex-col items-center justify-between bg-[#060a12] px-6 py-10 text-center">
      {/* header */}
      <div className="flex w-full max-w-2xl items-center justify-between">
        <div className="text-left">
          <div className="text-sm font-semibold text-[var(--color-text)]">NETRA Voice Intelligence</div>
          <div className="text-[11px] text-[var(--color-text-mute)]">grounded · sovereign · hands-free{scope ? ` · ${scope}` : ""}</div>
        </div>
        <button onClick={onClose} className="rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]">✕ Exit</button>
      </div>

      {/* the orb */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <div className={`vm-orb vm-${mode}`}>
          <span className="text-6xl">👁️</span>
        </div>
        <div className="min-h-[3rem] max-w-xl">
          {interim ? (
            <p className="text-lg text-[var(--color-text)]">{interim}</p>
          ) : (
            <p className="text-sm text-[var(--color-text-mute)]">{label}</p>
          )}
        </div>
      </div>

      {/* transcript (last few turns) */}
      <div className="w-full max-w-2xl space-y-2 overflow-y-auto text-left" style={{ maxHeight: "28vh" }}>
        {turns.slice(-6).map((t, i) => (
          <div key={i} className={`rounded-xl px-3 py-2 text-sm ${t.role === "you" ? "bg-[var(--color-accent)]/15 text-[var(--color-text)]" : "bg-[var(--color-surface)] text-[var(--color-text-dim)]"}`}>
            <span className="mr-2 text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">{t.role === "you" ? "You" : "NETRA"}</span>
            {t.text}
          </div>
        ))}
        {!canListen() && <div className="text-center text-xs text-[var(--color-warn)]">Voice needs a Chromium browser (Chrome/Edge) with mic permission.</div>}
      </div>

      <style>{`
        .vm-orb { position: relative; display: flex; align-items: center; justify-content: center;
          width: 180px; height: 180px; border-radius: 9999px;
          background: radial-gradient(circle at 50% 40%, rgba(34,211,238,0.25), rgba(6,10,18,0.9) 70%);
          box-shadow: 0 0 60px rgba(34,211,238,0.25); transition: box-shadow .3s; }
        .vm-orb::before, .vm-orb::after { content:""; position:absolute; inset:0; border-radius:9999px;
          border:2px solid rgba(34,211,238,0.5); }
        .vm-listening::before { animation: vmPulse 2s ease-out infinite; }
        .vm-listening::after  { animation: vmPulse 2s ease-out infinite 1s; }
        .vm-speaking { box-shadow: 0 0 90px rgba(34,211,238,0.5); }
        .vm-speaking::before { animation: vmPulse 0.7s ease-out infinite; }
        .vm-speaking::after  { animation: vmPulse 0.7s ease-out infinite 0.35s; }
        .vm-thinking::before { border-color: rgba(245,158,11,0.6); border-top-color: transparent; animation: vmSpin 1s linear infinite; }
        .vm-thinking::after  { border-color: transparent; }
        @keyframes vmPulse { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(1.6); opacity: 0; } }
        @keyframes vmSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .vm-orb::before, .vm-orb::after { animation: none !important; } }
      `}</style>
    </div>
  );
}

// Voice for the Copilot — on-device speech. TTS via the browser's speech synthesis
// (sovereign, no network); STT via Web Speech recognition for a spoken conversation.
// (In-browser Whisper is the sovereign STT upgrade on the roadmap.)
/* eslint-disable @typescript-eslint/no-explicit-any */
export function stopSpeaking() { window.speechSynthesis?.cancel(); }
export const isKannada = (t: string) => /[ಀ-೿]/.test(t);

// Speak text aloud (cancels anything in progress). onEnd fires when done — used to
// chain back into listening for a hands-free conversation.
export function speak(text: string, lang: "en-IN" | "kn-IN" = "en-IN", onEnd?: () => void): void {
  const synth = window.speechSynthesis;
  const clean = text.replace(/\*\*/g, "").replace(/\[[^\]]+\]/g, "").replace(/[•📎📊📄🔧🧠⚠️👍👎🗺️👋]/g, "");
  if (!synth || !clean.trim()) { onEnd?.(); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

export function canListen(): boolean {
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

// A continuous recognizer for hands-free Talk mode: always listening, auto-restarts,
// fires onSpeechStart (for instant barge-in) + onInterim + onFinal.
export interface Recognizer { start: () => void; stop: () => void; }
export function createRecognizer(opts: {
  onSpeechStart?: () => void; onInterim?: (t: string) => void; onFinal: (t: string) => void; lang?: string;
}): Recognizer | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = opts.lang || "en-IN";
  rec.continuous = true;
  rec.interimResults = true;
  let stopped = false;
  rec.onspeechstart = () => opts.onSpeechStart?.();
  rec.onresult = (e: any) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
    }
    if (interim.trim()) opts.onInterim?.(interim.trim());
    if (final.trim()) opts.onFinal(final.trim());
  };
  rec.onend = () => { if (!stopped) { try { rec.start(); } catch { /* already started */ } } };
  return {
    start: () => { stopped = false; try { rec.start(); } catch { /* already */ } },
    stop: () => { stopped = true; try { rec.stop(); } catch { /* already */ } },
  };
}

// One-shot listen → resolves with the transcript.
export function listen(onText: (t: string) => void, onState?: (on: boolean) => void, lang = "en-IN"): void {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return;
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  onState?.(true);
  rec.onresult = (e: any) => { const t = e.results?.[0]?.[0]?.transcript; if (t) onText(t); };
  rec.onerror = () => onState?.(false);
  rec.onend = () => onState?.(false);
  rec.start();
}

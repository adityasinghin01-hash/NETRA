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

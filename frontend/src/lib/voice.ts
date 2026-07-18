// Voice for the Copilot — on-device speech. TTS via the browser's speech synthesis
// (sovereign, no network); STT via Web Speech recognition for a spoken conversation.
// (In-browser Whisper is the sovereign STT upgrade on the roadmap.)
/* eslint-disable @typescript-eslint/no-explicit-any */
let speaking = false;

export function speak(text: string, lang: "en-IN" | "kn-IN" = "en-IN"): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (speaking) { synth.cancel(); speaking = false; return; }
  const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, "").replace(/\[[^\]]+\]/g, ""));
  u.lang = lang;
  u.onend = () => { speaking = false; };
  speaking = true;
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

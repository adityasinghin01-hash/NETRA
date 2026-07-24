// Copilot diagram — generative, not templated. GLM draws whatever the officer asks for and edits
// it on request; Mermaid renders it (bundled + lazy-loaded, so nothing leaves the police cloud).
// Honesty: standard charts about a real NETRA series/ring are built DETERMINISTICALLY from the
// actual case data (real FIRs, names, districts) so nothing is invented; free-form diagrams the
// user describes use GLM's Mermaid, grounded on the same context. Never a broken card: a parse
// error triggers one auto-repair pass, then falls back to an editable source view.
import { useEffect, useRef, useState } from "react";
import type { UiAction } from "@/lib/copilotTools";
import { glmChat } from "@/lib/llm";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Member { caseNo: string; district: string; date?: string; solved?: boolean }
interface Dna { clusterId: string; label: string; crimeType: string; districts: string[]; offender?: string | null;
  signature: { dim: string; value: string }[]; members: Member[] }

// ── Mermaid singleton (lazy) ─────────────────────────────────────────────────
let _mm: any = null;
async function getMermaid() {
  if (!_mm) {
    const mod = await import("mermaid");
    _mm = mod.default;
    _mm.initialize({
      startOnLoad: false, securityLevel: "loose", theme: "base", fontFamily: "Inter, system-ui, sans-serif",
      themeVariables: {
        background: "#0b1220", primaryColor: "#111a2e", primaryTextColor: "#e2e8f0", primaryBorderColor: "#2b3a55",
        lineColor: "#3b4a66", secondaryColor: "#1f2b45", tertiaryColor: "#0b1220", fontSize: "13px",
        clusterBkg: "#0e1526", clusterBorder: "#2b3a55", titleColor: "#e2e8f0",
      },
    });
  }
  return _mm;
}
const clean = (s: string) => s.replace(/```+\s*mermaid/gi, "").replace(/```+/g, "").trim();
const san = (s: any) => String(s ?? "").replace(/["`]/g, "'").replace(/[()#;{}|]/g, " ").replace(/\s+/g, " ").trim();

// ── Deterministic, GROUNDED Mermaid for the core case-diagram types (real data) ──
function linkMermaid(c: Dna): string {
  const ms = c.members.slice(0, 8);
  const L = ["flowchart LR", `  HAND["${san(c.offender || "Shared hand")}<br/>shared hand"]:::hand`];
  ms.forEach((m, i) => {
    L.push(`  F${i}["FIR ..${String(m.caseNo).slice(-6)}<br/>${san(m.district)} · ${m.date || ""}"]:::${m.solved ? "solved" : "unsolved"}`);
    L.push(`  HAND --> F${i}`);
  });
  L.push("classDef hand fill:#1f2b45,stroke:#22d3ee,color:#e2e8f0;");
  L.push("classDef solved fill:#0b1220,stroke:#4ade80,color:#cbd5e1;");
  L.push("classDef unsolved fill:#0b1220,stroke:#f59e0b,color:#cbd5e1;");
  return L.join("\n");
}
function orgMermaid(c: Dna, net: any): string {
  const comm = (net?.communities || []).find((x: any) => x.label === c.label);
  const kingpin = comm?.kingpin || c.offender || "Coordinator";
  const members: string[] = comm
    ? (net.nodes || []).filter((n: any) => n.community === comm.id && n.name !== comm.kingpin).slice(0, 6).map((n: any) => n.name)
    : [];
  const L = ["flowchart TD", `  K["${san(kingpin)}<br/>kingpin"]:::king`];
  if (!members.length) L.push(`  K --> M0["ring members<br/>[officer to verify]"]:::mem`);
  else members.forEach((nm, i) => { L.push(`  M${i}["${san(nm)}"]:::mem`); L.push(`  K --> M${i}`); });
  L.push("classDef king fill:#1f2b45,stroke:#22d3ee,color:#e2e8f0;");
  L.push("classDef mem fill:#0b1220,stroke:#3b4a66,color:#cbd5e1;");
  return L.join("\n");
}
function timelineMermaid(c: Dna): string {
  const ms = [...c.members].sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 10);
  const L = ["timeline", `  title ${san(c.label)} - case timeline`];
  ms.forEach((m) => L.push(`  ${m.date || "?"} : FIR ..${String(m.caseNo).slice(-6)} ${san(m.district)}`));
  return L.join("\n");
}
function moneyMermaid(): string {
  return [
    "flowchart LR",
    '  V["Victim account"]:::n --> F["Fraudster<br/>OTP / UPI capture"]:::n',
    '  F --> M["Mule accounts x3"]:::n --> C["Cash-out / ATM"]:::n',
    "classDef n fill:#111a2e,stroke:#3b4a66,color:#cbd5e1;",
  ].join("\n");
}
function moMermaid(c: Dna): string {
  const sig = (c.signature || []).slice(0, 5);
  const L = ["flowchart TD"];
  if (!sig.length) L.push('  S0["MO steps<br/>[officer to verify]"]:::s');
  else sig.forEach((s, i) => { L.push(`  S${i}["${san(s.dim)}<br/>${san(s.value)}"]:::s`); if (i > 0) L.push(`  S${i - 1} --> S${i}`); });
  L.push("classDef s fill:#111a2e,stroke:#22d3ee,color:#cbd5e1;");
  return L.join("\n");
}
function buildGrounded(kind: string, clusterId: string | undefined, dna: Record<string, Dna>, net: any): string | null {
  const c = clusterId ? dna[clusterId] : Object.values(dna)[0];
  if (!c) return null;
  switch (kind) {
    case "link": return linkMermaid(c);
    case "org": return orgMermaid(c, net);
    case "timeline": return timelineMermaid(c);
    case "money": return moneyMermaid();
    case "mo": return moMermaid(c);
    default: return null;
  }
}

const EDIT_SYS = `You edit Mermaid diagrams for a police intelligence tool. Return ONLY valid Mermaid code — no backticks, no prose. Keep existing real data (FIR numbers, names, districts, dates) intact unless the user asks to change it, and never invent new facts.`;

export default function CopilotDiagram({ action }: { action: Extract<UiAction, { kind: "diagram" }> }) {
  const [dna, setDna] = useState<Record<string, Dna> | null>(null);
  const [net, setNet] = useState<any>(null);
  const [code, setCode] = useState("");
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);
  const [showSrc, setShowSrc] = useState(false);
  const [draftSrc, setDraftSrc] = useState("");
  const [tweak, setTweak] = useState("");
  const started = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).catch(() => ({})),
      fetch(`${import.meta.env.BASE_URL}network-graph.json`).then((r) => r.json()).catch(() => ({})),
    ]).then(([d, n]) => { setDna(d); setNet(n); });
  }, []);

  // Once data is in (or immediately for free-form diagrams), compute the initial Mermaid and render.
  useEffect(() => {
    if (started.current) return;
    if (dna === null && action.diagram !== "other") return;
    started.current = true;
    // Honor GLM's own Mermaid whenever it supplied it (a custom/free-form diagram). Only build the
    // deterministic grounded chart for a core kind when GLM gave NO Mermaid (a real-series request).
    const core = action.diagram !== "other";
    const given = clean(action.mermaid || "");
    const initial = given || (core ? buildGrounded(action.diagram, action.clusterId, dna || {}, net) || "" : "");
    if (initial) { setCode(initial); void render(initial); }
    else { setErr("No diagram content was provided."); setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dna, net]);

  async function render(src: string) {
    setBusy(true); setErr("");
    try {
      const m = await getMermaid();
      const out = await m.render("netra-dia-" + Math.random().toString(36).slice(2), src);
      setSvg(out.svg);
    } catch (e) {
      // One auto-repair pass, then fall back to an editable source view (never a broken card).
      try {
        const r = await glmChat([{ role: "system", content: EDIT_SYS },
          { role: "user", content: `This Mermaid failed to parse (${String(e).slice(0, 120)}). Return only the corrected Mermaid:\n${src}` }], { max_tokens: 900, temperature: 0.1 });
        const fixed = clean(r.text);
        const m = await getMermaid();
        const out = await m.render("netra-dia-r" + Math.random().toString(36).slice(2), fixed);
        setCode(fixed); setSvg(out.svg);
      } catch {
        setSvg(""); setErr("Couldn't render this one. Edit the source below and re-render, or ask me to change it.");
        setDraftSrc(src); setShowSrc(true);
      }
    } finally { setBusy(false); }
  }

  async function applyTweak() {
    const t = tweak.trim();
    if (!t || busy) return;
    setTweak(""); setBusy(true);
    try {
      const r = await glmChat([{ role: "system", content: EDIT_SYS },
        { role: "user", content: `Current Mermaid:\n${code}\n\nChange requested: ${t}\n\nReturn the full updated Mermaid only.` }], { max_tokens: 900, temperature: 0.2 });
      const nc = clean(r.text);
      if (nc) { setCode(nc); await render(nc); } else setBusy(false);
    } catch { setBusy(false); }
  }

  const title = action.title || action.subject || (action.diagram === "other" ? "Diagram" : `${action.diagram} diagram`);

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-2.5" style={{ background: "#0b1220" }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-medium text-[var(--color-text)]">{title}</span>
        <button onClick={() => { setShowSrc((s) => !s); setDraftSrc(code); }}
          className="shrink-0 text-[9px] text-[var(--color-text-mute)] hover:text-[var(--color-accent)]">{showSrc ? "Hide source" : "View source"}</button>
      </div>

      {busy && !svg && <div className="py-6 text-center text-[11px] text-[var(--color-text-mute)]">Drawing…</div>}
      {svg && <div className="overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
      {err && <div className="py-2 text-[11px] text-[var(--color-warn)]">{err}</div>}

      {showSrc && (
        <div className="mt-2">
          <textarea value={draftSrc} onChange={(e) => setDraftSrc(e.target.value)} rows={6} spellCheck={false}
            className="w-full resize-y rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-mono text-[10px] leading-relaxed text-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent-dim)]" />
          <button onClick={() => { setCode(draftSrc); void render(draftSrc); }} disabled={busy}
            className="mt-1 rounded border border-[var(--color-accent-dim)] px-2 py-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-40">Re-render</button>
        </div>
      )}

      {/* Tweak by chat — refine the diagram in place. */}
      <div className="mt-2 flex items-center gap-1.5">
        <input value={tweak} onChange={(e) => setTweak(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyTweak(); } }}
          placeholder="Tweak it — e.g. make it a timeline, highlight the kingpin, add a node…" disabled={busy}
          className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] text-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent-dim)] disabled:opacity-50" />
        <button onClick={applyTweak} disabled={busy || !tweak.trim()}
          className="shrink-0 rounded bg-[var(--color-accent)] px-2 py-1.5 text-[10px] font-medium text-[var(--color-bg)] disabled:opacity-40">{busy ? "…" : "Apply"}</button>
      </div>
      <div className="mt-1 text-[8px] text-[var(--color-text-mute)]">
        {action.diagram === "money" ? "Illustrative flow — the prototype dataset holds no transaction records." : "Generated from case data — synthetic prototype."}
      </div>
    </div>
  );
}

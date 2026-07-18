// Copilot document drafter — GLM-4.7 drafts a police document grounded on real case data,
// shown editable with a one-click PDF export (shared engine). Always a DRAFT for human
// sign-off, never auto-filed. Falls back to a structured template if the LLM is unavailable.
import { useEffect, useRef, useState } from "react";
import type { UiAction } from "@/lib/copilotTools";
import { glmChat } from "@/lib/llm";
import { openReport } from "@/lib/pdf";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LABEL: Record<string, string> = {
  fir: "First Information Report", chargesheet: "Charge Sheet (Form IF5)", lookout_notice: "Look-Out Notice",
  summons: "Summons (u/s BNSS)", case_diary: "Case Diary Entry", seizure_memo: "Seizure Memo / Panchnama",
  court_brief: "Court Brief", daily_summary: "Daily Crime Summary",
};

function clusterFacts(dna: any, clusterId?: string): { title: string; facts: string } {
  const c = clusterId ? dna?.[clusterId] : Object.values(dna ?? {})[0];
  if (!c) return { title: "case", facts: "No case context available." };
  const sig = c.signature.map((s: any) => `${s.dim}: ${s.value}`).join("; ");
  const facts = `Serial series "${c.label}" — ${c.memberCount} linked FIRs across ${c.districts.length} districts (${c.districts.join(", ")}), crime type ${c.crimeType}. Shared MO: ${sig}. `
    + (c.offender ? `Suspected shared offender: ${c.offender}. ` : "")
    + (c.unsolvedCount ? `${c.unsolvedCount} unsolved cases in the series. ` : "")
    + `Member FIRs: ${c.members.slice(0, 6).map((m: any) => `${m.caseNo} (${m.district}, ${m.date})`).join("; ")}.`;
  return { title: c.label, facts };
}

export default function CopilotDocument({ action }: { action: Extract<UiAction, { kind: "document" }> }) {
  const [text, setText] = useState<string>("Drafting…");
  const [busy, setBusy] = useState(true);
  const ctxRef = useRef<{ title: string; facts: string }>({ title: "", facts: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const dna = await fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).catch(() => ({}));
      const ctx = clusterFacts(dna, action.clusterId);
      ctxRef.current = ctx;
      const label = LABEL[action.docType] ?? action.docType;
      try {
        const r = await glmChat([
          { role: "system", content: "You are a Karnataka Police documentation assistant. Draft the requested document using ONLY the given facts, in the correct Indian police format. Where a required detail is missing, write [officer to verify]. Never invent names or numbers. Keep it a clean draft for human sign-off." },
          { role: "user", content: `FACTS:\n${ctx.facts}\n\nDraft a ${label}.` },
        ], { max_tokens: 700 });
        if (alive) setText(r.text || fallback(label, ctx.facts));
      } catch {
        if (alive) setText(fallback(label, ctx.facts));
      } finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [action.docType, action.clusterId]);

  function fallback(label: string, facts: string) {
    return `${label.toUpperCase()}\n\n(Auto-draft — LLM unavailable; structured from case data)\n\nSubject: ${ctxRef.current.title}\n\n${facts}\n\n[Officer to complete remaining fields and verify before use.]`;
  }

  function exportPdf() {
    const label = LABEL[action.docType] ?? action.docType;
    openReport({
      title: label, subtitle: ctxRef.current.title, classification: "DRAFT — FOR HUMAN SIGN-OFF",
      sections: [{ heading: label, html: `<pre style="white-space:pre-wrap;font-family:inherit">${text.replace(/</g, "&lt;")}</pre>` }],
    });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium text-[var(--color-text)]">📄 {LABEL[action.docType] ?? action.docType} <span className="text-[var(--color-warn)]">· DRAFT</span></span>
        {!busy && <button onClick={exportPdf} className="rounded border border-[var(--color-accent-dim)] px-2 py-0.5 text-[9px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10">Export PDF</button>}
      </div>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={8}
        className="w-full resize-y rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[10px] leading-relaxed text-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent-dim)]"
      />
      <div className="mt-1 text-[8px] text-[var(--color-text-mute)]">Draft for human review & sign-off · never auto-filed · synthetic prototype data</div>
    </div>
  );
}

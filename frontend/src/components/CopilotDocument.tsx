// Copilot document drafter — GLM-4.7 drafts a police document grounded on real case data,
// then keeps refining it: the officer can add more facts (typed) or attach an image (Qwen VLM
// reads it) and NETRA folds the new details into the existing draft WITHOUT losing manual edits.
// Editable throughout; one-click PDF with a court-familiar letterhead and image exhibits.
// Always a DRAFT for human sign-off, never auto-filed.
import { useEffect, useRef, useState } from "react";
import type { UiAction } from "@/lib/copilotTools";
import { glmChat, vlmExtract } from "@/lib/llm";
import { openReport } from "@/lib/pdf";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LABEL: Record<string, string> = {
  fir: "First Information Report", chargesheet: "Charge Sheet (Form IF5)", lookout_notice: "Look-Out Notice",
  summons: "Summons (u/s BNSS)", case_diary: "Case Diary Entry", seizure_memo: "Seizure Memo / Panchnama",
  court_brief: "Court Brief", daily_summary: "Daily Crime Summary",
};

// Format skeletons so drafts are *properly written* — the correct Indian-police structure per
// document, aligned "KEY : value" fields and CAPS section headers (so the monospace view lines up).
const FORMAT: Record<string, string> = {
  fir: "Sections: 1) FIR No / Police Station / District / Date & time of report. 2) Act & Sections. 3) Complainant particulars. 4) Place & date/time of occurrence. 5) Accused (if known). 6) Brief facts of the offence (numbered). 7) Property involved. 8) Officer recording the FIR / signature line.",
  chargesheet: "Form IF5 order: 1) Court & case reference. 2) Investigating Officer & PS. 3) Accused particulars. 4) Charges (Act & Sections). 5) Brief facts & investigation summary. 6) List of witnesses. 7) List of documents/exhibits. 8) Property/seizure. 9) IO conclusion & prayer.",
  lookout_notice: "Sections: 1) Notice reference & issuing authority. 2) Wanted person(s) — name, description, last-known area. 3) Case reference (FIR/series). 4) Grounds & sections. 5) Action requested on sighting. 6) Contact officer & 24x7 number.",
  seizure_memo: "Sections: 1) Memo No / PS / date & time / place of seizure. 2) Panch witnesses (two). 3) Items seized (itemised table: description, quantity, marks). 4) Person from whom seized. 5) Sealing & malkhana entry. 6) Seizing officer & signatures.",
  summons: "Sections: 1) Court & case reference. 2) Person summoned & address. 3) Purpose & sections (BNSS). 4) Date/time & place to appear. 5) Consequences of non-appearance. 6) Issuing officer & seal.",
  case_diary: "Sections: 1) Case diary entry no, date, PS, FIR ref. 2) Steps of investigation this day (chronological). 3) Persons examined. 4) Evidence collected. 5) Next steps. 6) IO signature.",
  court_brief: "Sections: 1) Case reference & court. 2) Parties. 3) Charges. 4) Concise fact narrative. 5) Evidence summary. 6) Points for the court. 7) Prosecution position.",
  daily_summary: "Sections: 1) Date & jurisdiction. 2) Cases registered (by type). 3) Notable incidents. 4) Arrests/detections. 5) Alerts & patterns. 6) Officer on duty.",
};

const SYS = `You are a Karnataka Police documentation assistant. Draft the requested document using ONLY the given facts, in the correct Indian police format for that document. Rules:
- Use CAPS section headers and aligned "FIELD : value" lines so the text is cleanly formatted.
- Where a required detail is not in the facts, write [officer to verify] — never invent names, numbers, dates or sections.
- Keep it a clean, professional DRAFT for human sign-off.`;

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

interface Exhibit { name: string; dataUrl: string; extracted: string }

export default function CopilotDocument({ action }: { action: Extract<UiAction, { kind: "document" }> }) {
  const [text, setText] = useState<string>("Drafting…");
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const ctxRef = useRef<{ title: string; facts: string }>({ title: "", facts: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const label = LABEL[action.docType] ?? action.docType;

  useEffect(() => {
    let alive = true;
    (async () => {
      const dna = await fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).catch(() => ({}));
      const ctx = clusterFacts(dna, action.clusterId);
      ctxRef.current = ctx;
      try {
        const r = await glmChat([
          { role: "system", content: SYS },
          { role: "user", content: `FACTS:\n${ctx.facts}\n\nFORMAT — ${FORMAT[action.docType] ?? "use the standard structure for this document."}\n\nDraft a ${label}.` },
        ], { max_tokens: 800 });
        if (alive) setText(r.text || fallback(ctx.facts));
      } catch {
        if (alive) setText(fallback(ctx.facts));
      } finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [action.docType, action.clusterId]);

  function fallback(facts: string) {
    return `${label.toUpperCase()}\n\n(Auto-draft — LLM unavailable; structured from case data)\n\nSUBJECT : ${ctxRef.current.title}\n\n${facts}\n\n[Officer to complete remaining fields and verify before use.]`;
  }

  // Re-draft: fold NEW details into the CURRENT draft, preserving the officer's manual edits.
  async function refine(added: string, statusMsg: string) {
    if (busy) return;
    setBusy(true); setStatus(statusMsg);
    try {
      const r = await glmChat([
        { role: "system", content: SYS },
        { role: "user", content: `Here is the CURRENT draft of a ${label}:\n\n${text}\n\nREVISE it to incorporate these ADDITIONAL DETAILS, keeping all existing content, edits and the police format. Place each new detail in its correct section. Do not drop anything already present.\n\nADDITIONAL DETAILS:\n${added}` },
      ], { max_tokens: 900 });
      if (r.text.trim()) setText(r.text.trim());
    } catch { setStatus("Couldn't reach the model — draft unchanged."); return; }
    finally { setBusy(false); setTimeout(() => setStatus(""), 2500); }
  }

  function addNote() {
    const t = note.trim();
    if (!t) return;
    setNote("");
    refine(t, "Adding your details…");
  }

  // Attach an image → Qwen VLM reads it → its content is folded into the draft AND kept as a
  // labelled exhibit that gets embedded in the exported PDF.
  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    setBusy(true); setStatus(`Reading ${f.name}…`);
    const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    const b64 = dataUrl.split(",")[1] || "";
    let extracted = "";
    try {
      extracted = await vlmExtract(`Read this police document/photo and extract every relevant detail as plain text (names, dates, place, items, sections, amounts, descriptions). Only what is visible.`, [b64]);
    } catch { extracted = ""; }
    const ex: Exhibit = { name: f.name, dataUrl, extracted: extracted || "(image attached — not machine-readable)" };
    setExhibits((x) => [...x, ex]);
    setBusy(false);
    if (extracted.trim()) await refine(`From attached document "${f.name}":\n${extracted}`, "Folding in the attachment…");
    else { setStatus(`${f.name} attached as an exhibit.`); setTimeout(() => setStatus(""), 2500); }
  }

  function exportPdf() {
    const sections = [{ heading: label, html: `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.7;margin:0">${text.replace(/</g, "&lt;")}</pre>` }];
    if (exhibits.length) {
      const imgs = exhibits.map((x, i) =>
        `<div style="margin:10px 0"><div style="font-size:11px;color:#5a6b82;margin-bottom:4px">Exhibit ${i + 1} — ${x.name.replace(/</g, "&lt;")}</div>`
        + `<img src="${x.dataUrl}" style="max-width:100%;border:1px solid #e3e8ef;border-radius:6px"/></div>`).join("");
      sections.push({ heading: "Exhibits", html: imgs });
    }
    openReport({ title: label, subtitle: ctxRef.current.title, classification: "DRAFT — FOR HUMAN SIGN-OFF", sections });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium text-[var(--color-text)]">📄 {label} <span className="text-[var(--color-warn)]">· DRAFT</span></span>
        {!busy && <button onClick={exportPdf} className="rounded border border-[var(--color-accent-dim)] px-2 py-0.5 text-[9px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10">Export PDF</button>}
      </div>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={12} spellCheck={false}
        className="w-full resize-y whitespace-pre rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent-dim)]"
      />

      {exhibits.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {exhibits.map((x, i) => (
            <span key={i} className="flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-dim)]">
              <img src={x.dataUrl} alt="" className="h-5 w-5 rounded object-cover" /> {x.name}
            </span>
          ))}
        </div>
      )}

      {/* Refinement: add more facts or attach an image — NETRA folds it into the draft above. */}
      <div className="mt-2 flex items-center gap-1.5">
        <input ref={fileRef} type="file" accept="image/*" onChange={onImage} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} title="Attach an image — NETRA reads it and adds it to the draft"
          className="shrink-0 rounded border border-[var(--color-border)] px-1.5 py-1.5 text-[10px] text-[var(--color-text-mute)] hover:text-[var(--color-accent)] disabled:opacity-40">📎</button>
        <input
          value={note} onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNote(); } }}
          placeholder="Add more details (e.g. complainant name, time, items)…" disabled={busy}
          className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] text-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent-dim)] disabled:opacity-50"
        />
        <button type="button" onClick={addNote} disabled={busy || !note.trim()}
          className="shrink-0 rounded bg-[var(--color-accent)] px-2 py-1.5 text-[10px] font-medium text-[var(--color-bg)] disabled:opacity-40">Add</button>
      </div>

      <div className="mt-1 flex items-center justify-between text-[8px] text-[var(--color-text-mute)]">
        <span>Draft for human review &amp; sign-off · never auto-filed · synthetic prototype data</span>
        {(busy || status) && <span className="text-[var(--color-accent)]">{status || "Working…"}</span>}
      </div>
    </div>
  );
}

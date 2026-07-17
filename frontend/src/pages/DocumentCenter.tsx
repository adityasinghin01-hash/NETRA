// Document Center — one hub to generate every NETRA report (all through the shared PDF
// engine, one letterhead). Flagship: the Serial-Crime Linkage & Evidence Report, built to
// read court-familiar to KSP.
import { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { openReport } from "@/lib/pdf";
import { DISTRICTS, getSession } from "@/lib/auth";
import { type CrimeDna } from "@/components/CrimeDNA";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function DocumentCenter() {
  const scope = getSession().district;
  const [dna, setDna] = useState<Record<string, CrimeDna> | null>(null);
  const [spatial, setSpatial] = useState<Record<string, any> | null>(null);
  const [briefs, setBriefs] = useState<Record<string, any> | null>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [cluster, setCluster] = useState("SC01");
  const [dist, setDist] = useState(scope ?? "Bengaluru Urban");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).then(setDna).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}spatial.json`).then((r) => r.json()).then(setSpatial).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}briefings.json`).then((r) => r.json()).then(setBriefs).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}forecast.json`).then((r) => r.json()).then(setForecast).catch(() => {});
  }, []);

  function linkageReport() {
    const c = dna?.[cluster];
    if (!c) return;
    const sp = spatial?.[c.clusterId];
    const rows = c.members.map((m) => {
      const solved = (m as any).solved;
      const tag = solved
        ? `<span class="tag" style="background:#e7f6ed;color:#1f8a5b">Chargesheeted</span>`
        : `<span class="tag" style="background:#fdecea;color:#c0392b">UNSOLVED</span>`;
      const acc = (m as any).accused?.name ?? "—";
      return `<tr><td>${m.caseNo}</td><td>${m.district}</td><td>${m.date}</td><td>${acc}</td><td>${tag}</td></tr>`;
    }).join("");
    // §D — Forensic & Physical Evidence catalogue, per linked FIR (from the case forensic layer).
    const forRows = c.members.map((m) => {
      const f = (m as any).forensic;
      if (!f) return "";
      const wt = `${f.weapon}${f.tools?.length ? "; " + f.tools.join(", ") : ""}`;
      return `<tr><td>${m.caseNo}</td><td>${wt}</td><td>${(f.evidenceRecovered ?? []).join(", ")}</td><td>${f.fingerprint}</td><td>${f.seizure?.memoNo ?? "—"}</td><td>${f.fsl?.ref ?? "—"}</td></tr>`;
    }).join("");
    openReport({
      title: "Serial-Crime Linkage & Evidence Report",
      subtitle: `${c.label} · ${c.memberCount} linked FIRs · ${c.districts.length} districts`,
      classification: "RESTRICTED — DECISION SUPPORT",
      sections: [
        { heading: "A · Serial Pattern Summary", html: `<p>${c.why} Strike cadence ~${c.span.cadenceDays ?? "—"} days over ${c.span.days} days. Spans: ${c.districts.join(", ")}.</p>` },
        { heading: "B · Modus Operandi (CCTNS-aligned)", html: c.signature.map((s) => `<p><b>${s.dim}:</b> ${s.value}</p>`).join("") },
        { heading: "C · Linked-Cases Register", html: `<table><thead><tr><th>FIR No.</th><th>District</th><th>Date</th><th>Accused</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` },
        { heading: "D · Forensic &amp; Physical Evidence Catalogue", html: `<table><thead><tr><th>FIR No.</th><th>Weapon / Tools</th><th>Evidence Recovered</th><th>Fingerprint / NAFIS</th><th>Seizure Memo</th><th>FSL Ref.</th></tr></thead><tbody>${forRows}</tbody></table><p style="margin-top:6px"><b>Chain of custody:</b> each seizure drawn on a memo before two independent panchas, entered in the PS malkhana register; exhibits forwarded to FSL where applicable. Forensic conclusions rest with the accredited FSL.</p>` },
        { heading: "E · NETRA AI Analysis", html: `<p>Linkage by multi-dimensional MO fingerprint (semantic text + geography + time + method + target). ${sp?.rossmo ? `Geographic profiling (Rossmo/CGT) predicts an operating-base <b>zone</b> near ${sp.rossmo.anchor.lat}, ${sp.rossmo.anchor.lng} — a place, not a person.` : ""} ${sp?.nextStrike ? `Predicted next strike: <b>${sp.nextStrike.district}</b>, ${sp.nextStrike.window}, ${sp.nextStrike.timeWindow} (${Math.round(sp.nextStrike.confidence * 100)}% confidence).` : ""}</p>` },
        { heading: "F · Investigative Recommendation", html: `<p>${c.offender && c.unsolvedCount ? `Interrogate/arrest <b>${c.offender}</b> — could clear <b>${c.unsolvedCount} unsolved cases</b> in this series ("one arrest, many clearances"). ` : ""}Issue a lookout notice; alert the affected stations; concentrate the search on the profiled zone. Human-in-the-loop.</p>` },
        { heading: "G · Methodology, Validation & Legal Note", html: `<p>Blind-validated (5/5 planted patterns recovered, precision@k 0.96) and method-validated on 503k real Chicago crimes. This is investigative <b>decision support, not primary evidence</b>; forensic conclusions rest with the accredited FSL; human verification required. Ethics: no caste/religion in any model; predicts patterns &amp; places, never guilt.</p>` },
        { heading: "H · Signature", html: `<p>Prepared by: NETRA (system) &nbsp;·&nbsp; Reviewed by: ________________ (rank/no.) &nbsp;·&nbsp; Forwarded by SHO: ________________</p>` },
      ],
    });
  }

  function digestReport() {
    const b = briefs?.[dist];
    if (!b) return;
    const s = b.stats;
    openReport({
      title: "Daily Intelligence Digest",
      subtitle: `${dist} District · ${b.date}`,
      sections: [
        { heading: "Key Metrics", html: `<p>30-day FIRs: <b>${s.fir30d}</b> · vs prev month: <b>${s.changePct > 0 ? "+" : ""}${s.changePct}%</b> · Detection: <b>${s.detectionPct}%</b></p>` },
        { heading: "Executive Summary", html: `<p>${b.en}</p>` },
        { heading: "Leading Crime Types", html: (s.topCrimes ?? []).map((t: any) => `<p>${t.type} — ${t.pct}%</p>`).join("") },
      ],
    });
  }

  function forecastReport() {
    const hs = forecast?.hotspots ?? [];
    const rows = hs.map((h: any) => `<tr><td>${h.district}</td><td>${h.crimeType}</td><td>${h.riskLevel}</td><td>${h.patrolWindow}</td></tr>`).join("");
    openReport({
      title: "7-Day Forecast & Patrol Plan",
      subtitle: `Next 7 days · gradient-boosting model`,
      sections: [
        { heading: "Elevated Hotspots", html: `<table><thead><tr><th>District</th><th>Crime type</th><th>Risk</th><th>Patrol window</th></tr></thead><tbody>${rows}</tbody></table>` },
        { heading: "Recommendation", html: `<p>Allocate patrols to the windows above. Method validated on real Chicago data (86% top-10 hotspot hit-rate).</p>` },
      ],
    });
  }

  const DOCS = [
    {
      title: "Serial-Crime Linkage & Evidence Report",
      desc: "Court-familiar dossier for a serial cluster — pattern, MO, linked-cases register, geographic profile, next-strike, methodology.",
      picker: (
        <select value={cluster} onChange={(e) => setCluster(e.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]">
          {Object.values(dna ?? {}).map((c) => <option key={c.clusterId} value={c.clusterId}>{c.label}</option>)}
        </select>
      ),
      gen: linkageReport,
    },
    {
      title: "Daily Intelligence Digest",
      desc: "The district's morning brief — key metrics, executive summary, leading crimes.",
      picker: (
        <select value={dist} onChange={(e) => setDist(e.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]">
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      ),
      gen: digestReport,
    },
    {
      title: "7-Day Forecast & Patrol Plan",
      desc: "State-wide predicted hotspots + recommended patrol windows.",
      picker: null,
      gen: forecastReport,
    },
  ];

  return (
    <div>
      <PageHeader title="Document Center" desc="Generate any NETRA report — one letterhead, decision-support classification. Files open ready to print/save as PDF." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {DOCS.map((doc) => (
          <Card key={doc.title} className="flex flex-col p-4">
            <div className="text-sm font-semibold text-[var(--color-text)]">📄 {doc.title}</div>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-[var(--color-text-dim)]">{doc.desc}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {doc.picker && <div className="min-w-0 flex-1">{doc.picker}</div>}
              <button onClick={doc.gen} className="ml-auto shrink-0 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90">
                Generate
              </button>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-4 text-[10px] text-[var(--color-text-mute)]">
        All documents share one PDF engine &amp; NETRA letterhead · decision support, human-in-the-loop · prototype: synthetic data.
      </div>
    </div>
  );
}

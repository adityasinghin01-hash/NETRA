// Document Center — one hub to generate every NETRA report (all through the shared PDF
// engine, one letterhead). Flagship: the Serial-Crime Linkage & Evidence Report, built to
// read court-familiar to KSP.
import { useEffect, useState } from "react";
import { PageHeader, SpecularCard } from "@/components/ui";
// escapeHtml stays: this page builds report HTML from dynamic values.
import { openReport, escapeHtml as e } from "@/lib/pdf";
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
      return `<tr><td>${e(m.caseNo)}</td><td>${e(m.district)}</td><td>${e(m.date)}</td><td>${e(acc)}</td><td>${tag}</td></tr>`;
    }).join("");
    // §D — Forensic & Physical Evidence catalogue, per linked FIR (from the case forensic layer).
    const forRows = c.members.map((m) => {
      const f = (m as any).forensic;
      if (!f) return "";
      const wt = `${f.weapon}${f.tools?.length ? "; " + f.tools.join(", ") : ""}`;
      return `<tr><td>${e(m.caseNo)}</td><td>${e(wt)}</td><td>${e((f.evidenceRecovered ?? []).join(", "))}</td><td>${e(f.fingerprint)}</td><td>${e(f.seizure?.memoNo ?? "—")}</td><td>${e(f.fsl?.ref ?? "—")}</td></tr>`;
    }).join("");
    openReport({
      title: "Serial-Crime Linkage & Evidence Report",
      subtitle: `${c.label} · ${c.memberCount} linked FIRs · ${c.districts.length} districts`,
      classification: "RESTRICTED — DECISION SUPPORT",
      sections: [
        { heading: "A · Serial Pattern Summary", html: `<p>${e(c.why)} Strike cadence ~${c.span.cadenceDays ?? "—"} days over ${c.span.days} days. Spans: ${e(c.districts.join(", "))}.</p>` },
        { heading: "B · Modus Operandi (CCTNS-aligned)", html: c.signature.map((s) => `<p><b>${e(s.dim)}:</b> ${e(s.value)}</p>`).join("") },
        { heading: "C · Linked-Cases Register", html: `<table><thead><tr><th>FIR No.</th><th>District</th><th>Date</th><th>Accused</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` },
        { heading: "D · Forensic &amp; Physical Evidence Catalogue", html: `<table><thead><tr><th>FIR No.</th><th>Weapon / Tools</th><th>Evidence Recovered</th><th>Fingerprint / NAFIS</th><th>Seizure Memo</th><th>FSL Ref.</th></tr></thead><tbody>${forRows}</tbody></table><p style="margin-top:6px"><b>Chain of custody:</b> each seizure drawn on a memo before two independent panchas, entered in the PS malkhana register; exhibits forwarded to FSL where applicable. Forensic conclusions rest with the accredited FSL.</p>` },
        { heading: "E · NETRA AI Analysis", html: `<p>Linkage by multi-dimensional MO signature (semantic text + geography + time + method + target). ${sp?.rossmo ? `Geographic profiling (Rossmo/CGT) predicts an operating-base <b>zone</b> near ${e(sp.rossmo.anchor.lat)}, ${e(sp.rossmo.anchor.lng)} — a place, not a person.` : ""} ${sp?.nextStrike ? `Projected next strike: <b>${e(sp.nextStrike.district)}</b>, ${e(sp.nextStrike.window)}, ${e(sp.nextStrike.timeWindow)} (${Math.round(sp.nextStrike.confidence * 100)}% confidence)${sp.nextStrike.cadenceDays ? `, projected ~${sp.nextStrike.cadenceDays} days on from the series&rsquo; last recorded FIR` : ""}.` : ""}</p>` },
        { heading: "F · Investigative Recommendation", html: `<p>${c.offender && c.unsolvedCount ? `Interrogate/arrest <b>${e(c.offender)}</b> — could clear <b>${c.unsolvedCount} unsolved cases</b> in this series ("one arrest, many clearances"). ` : ""}Issue a lookout notice; alert the affected stations; concentrate the search on the profiled zone. Human-in-the-loop.</p>` },
        { heading: "G · Methodology, Validation & Legal Note", html: `<p>TF-IDF blind-validated (5/5 planted patterns recovered, precision@k 0.96 — a data-separability check) and method-validated on 503k real Chicago crimes. This is investigative <b>decision support, not primary evidence</b>; forensic conclusions rest with the accredited FSL; human verification required. Ethics: no caste/religion in any model; predicts patterns &amp; places, never guilt.</p>` },
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
        { heading: "Executive Summary", html: `<p>${e(b.en)}</p>` },
        { heading: "Leading Crime Types", html: (s.topCrimes ?? []).map((t: any) => `<p>${e(t.type)} — ${t.pct}%</p>`).join("") },
      ],
    });
  }

  function forecastReport() {
    const hs = forecast?.hotspots ?? [];
    const rows = hs.map((h: any) => `<tr><td>${e(h.district)}</td><td>${e(h.crimeType)}</td><td>${e(h.riskLevel)}</td><td>${e(h.patrolWindow)}</td></tr>`).join("");
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
          <SpecularCard
            key={doc.title}
            radius={12}
            lineColor="#38bdf8"
            baseColor="#0f172a"
            intensity={1.3}
            shineSize={15}
            shineFade={35}
            thickness={1.5}
            proximity={280}
            className="card-hover flex flex-col p-4 border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <svg className="w-4 h-4 text-[var(--color-accent)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                <path d="M10 9H8"/>
                <path d="M16 13H8"/>
                <path d="M16 17H8"/>
              </svg>
              <span>{doc.title}</span>
            </div>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-[var(--color-text-dim)]">{doc.desc}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {doc.picker && <div className="min-w-0 flex-1">{doc.picker}</div>}
              <button onClick={doc.gen} className="ml-auto shrink-0 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90">
                Generate
              </button>
            </div>
          </SpecularCard>
        ))}
      </div>
      <div className="mt-4 text-[10px] text-[var(--color-text-mute)]">
        All documents share one PDF engine &amp; NETRA letterhead · decision support, human-in-the-loop · prototype: synthetic data.
      </div>
    </div>
  );
}

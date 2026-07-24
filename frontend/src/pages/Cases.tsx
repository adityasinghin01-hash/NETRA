import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi, Card, PageHeader, State, Badge } from "@/components/ui";
import { searchCases, type CaseRow, type Forensic } from "@/api/client";
import { getSession } from "@/lib/auth";
import { type CrimeDna, type DnaMember } from "@/components/CrimeDNA";
import { embedText, preloadEmbedder } from "@/lib/embedMatch";
import { glmChat } from "@/lib/llm";

interface CaseVec { crimeNo: string; district: string; date: string; crimeSubHead: string; clusterLabel: string; solved: boolean; facts: string; language: string; vector: number[] }
function cosine(a: number[], b: number[]) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function rowFromMember(m: DnaMember, crimeType: string): CaseRow {
  return {
    crimeNo: m.caseNo, crimeSubHead: crimeType, districtName: m.district, registeredDate: m.date,
    status: m.solved ? "Charge Sheeted" : "Under Investigation", gravity: "Non-Heinous",
    briefFacts: m.facts, language: m.language ?? "en",
    accused: m.accused ? [{ name: m.accused.name, priorCases: m.accused.priorCases, historySheeter: m.accused.historySheeter }] : [],
    forensic: m.forensic ?? null,
  };
}

const CRIME_TYPES = [
  "Theft (Ordinary)", "House-Breaking & Burglary", "Motor Vehicle Theft", "Robbery",
  "Hurt (Simple)", "Grievous Hurt", "Murder", "Cheating & Fraud", "Online Financial Fraud",
  "Cruelty by Husband/Relatives", "Assault on Woman (Modesty)", "Rioting / Unlawful Assembly",
  "NDPS (Drugs)", "Excise Act",
];
const STATUSES = [
  "Under Investigation", "Charge Sheeted", "Pending Trial", "Disposed",
  "Closed - Undetected", "Closed - False",
];

// Case-progression stepper — the honest "how far along" view, derived from the case status.
const STEPS = ["Registered", "Investigation", "Charge-sheet", "Trial", "Disposed"];
function progressStage(status: string): { idx: number; closed: null | "undetected" | "false" } {
  const s = status.toLowerCase();
  if (s.includes("undetected")) return { idx: 1, closed: "undetected" };
  if (s.includes("false")) return { idx: 1, closed: "false" };
  if (s.includes("disposed")) return { idx: 4, closed: null };
  if (s.includes("trial")) return { idx: 3, closed: null };
  if (s.includes("charge")) return { idx: 2, closed: null };
  return { idx: 1, closed: null }; // under investigation
}
function CaseTimeline({ status }: { status: string }) {
  const { idx, closed } = progressStage(status);
  return (
    <div className="mt-1">
      {closed ? (
        <div className="flex items-center gap-2">
          {["Registered", "Investigation"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                <span className="text-[11px] text-[var(--color-text-dim)]">{label}</span>
              </div>
              {i === 0 && <span className="h-px w-5 bg-[var(--color-accent)]" />}
            </div>
          ))}
          <span className="h-px w-5 bg-[var(--color-border-strong)]" />
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${closed === "undetected" ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)]" : "bg-[var(--color-text-mute)]/15 text-[var(--color-text-mute)]"}`}>
            ⛔ Closed — {closed === "undetected" ? "Undetected" : "False"}
          </span>
        </div>
      ) : (
        <div className="flex items-center">
          {STEPS.map((label, i) => {
            const done = i < idx;
            const cur = i === idx;
            return (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <span className={`h-2.5 w-2.5 rounded-full ${done || cur ? "bg-[var(--color-accent)]" : "bg-[var(--color-border-strong)]"} ${cur ? "ring-2 ring-[var(--color-accent)]/40" : ""}`} />
                  <span className={`mt-1 text-[9px] ${done || cur ? "text-[var(--color-text-dim)]" : "text-[var(--color-text-mute)]"}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && <span className={`mb-3.5 h-px w-6 ${i < idx ? "bg-[var(--color-accent)]" : "bg-[var(--color-border-strong)]"}`} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Full case dossier — parties (complainant + accused w/ prior record) and the
// forensic / physical-evidence catalogue. Ethics: name/age/gender only, never
// caste/religion/occupation.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-28 shrink-0 text-[var(--color-text-mute)]">{label}</span>
      <span className="min-w-0 flex-1 text-[var(--color-text-dim)]">{children}</span>
    </div>
  );
}
function Dossier({ c }: { c: CaseRow }) {
  const f: Forensic | null | undefined = c.forensic;
  const hasParties = c.complainant || (c.accused && c.accused.length > 0);
  if (!hasParties && !f) return null;
  return (
    <div className="mt-3 space-y-3">
      {hasParties && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text)]">
            <svg className="w-4 h-4 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Parties</span>
          </div>
          {c.complainant && (
            <Field label="Complainant">
              {c.complainant.name}{c.complainant.age ? ` · ${c.complainant.age}y` : ""}{c.complainant.gender ? ` · ${c.complainant.gender}` : ""}
            </Field>
          )}
          {c.accused && c.accused.length > 0 && (
            <div className="mt-1.5">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">Accused ({c.accused.length})</div>
              <ul className="space-y-1">
                {c.accused.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
                    <span className="text-[var(--color-text)]">{a.name}</span>
                    {a.age ? <span className="text-[var(--color-text-mute)]">{a.age}y{a.gender ? ` · ${a.gender}` : ""}</span> : null}
                    {a.historySheeter ? (
                      <Badge tone="danger">history-sheeter · {a.priorCases}+ priors</Badge>
                    ) : a.priorCases ? (
                      <span className="text-[10px] text-[var(--color-warn)]">{a.priorCases} prior case{a.priorCases === 1 ? "" : "s"}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {f && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text)]">
            <svg className="w-4 h-4 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>Forensic &amp; physical evidence</span>
          </div>
          <div className="space-y-1.5">
            <Field label="Weapon / tools">{f.weapon}{f.tools.length ? ` · ${f.tools.join(", ")}` : ""}</Field>
            <Field label="Evidence">
              <span className="flex flex-wrap gap-1">
                {f.evidenceRecovered.map((e) => (
                  <span key={e} className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px]">{e}</span>
                ))}
              </span>
            </Field>
            <Field label="Fingerprint / NAFIS">{f.fingerprint}</Field>
            <Field label="Seizure">{f.seizure.memoNo} · {f.seizure.malkhana}</Field>
            <Field label="Custody">{f.seizure.custody} · {f.seizure.panchnama}</Field>
            {f.fsl && <Field label="FSL reference">{f.fsl.ref} — {f.fsl.status}</Field>}
          </div>
          <div className="mt-2 text-[10px] text-[var(--color-text-mute)]">Synthetic prototype evidence — realistic shape, not real. FSL owns forensic conclusions.</div>
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// Alert that led the officer here (Alert Center → Case Search). Carries the "why did this fire"
// detail so the case file opens with the reason surfaced, not buried.
interface AlertCtx {
  id: string; type: string; severity: string; district: string; crimeType: string;
  message: string; why: string; date: string; crimeNo?: string | null; clusterId?: string | null;
  where?: string; when?: string; how?: string; stat?: string; recommendation?: string;
}
const ALERT_TONE: Record<string, "danger" | "warn" | "accent"> = {
  "Volume spike": "danger", "Emerging serial pattern": "accent", "Repeat offender": "warn",
};

// The dedicated "why this alert fired" panel — shown ONLY for alert-originated case files.
// It answers the officer's first question on opening the file: what tripped, where, how, and
// what to do — in plain language, before the FIR body.
function AlertContext({ a }: { a: AlertCtx }) {
  const sev = a.severity === "high" ? "danger" : "warn";
  return (
    <Card className={`mb-4 border-l-4 p-4 ${a.severity === "high" ? "border-l-[var(--color-danger)]" : "border-l-[var(--color-warn)]"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[var(--color-text)]">🚨 Why this alert fired</span>
        <Badge tone={ALERT_TONE[a.type] ?? "mute"}>{a.type}</Badge>
        <Badge tone={sev}>{a.severity} severity</Badge>
        <span className="ml-auto tnum text-[10px] text-[var(--color-text-mute)]">{a.id}</span>
      </div>
      <p className="text-sm leading-relaxed text-[var(--color-text-dim)]">{a.message}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AlertFact icon="📍" label="Where">{a.where || a.district}</AlertFact>
        <AlertFact icon="🕑" label="When">{a.when || a.date}</AlertFact>
        <AlertFact icon="🎯" label="Crime type">{a.crimeType}</AlertFact>
        <AlertFact icon="🔬" label="Flagged because">{a.why}</AlertFact>
      </div>
      {a.how && (
        <div className="mt-3">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">How it works</div>
          <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">{a.how}</p>
        </div>
      )}
      {a.stat && (
        <div className="mt-3">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">The statistic</div>
          <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">{a.stat}</p>
        </div>
      )}
      {a.recommendation && (
        <div className="mt-3 rounded-lg border border-[var(--color-ok)]/30 bg-[var(--color-ok)]/5 p-2.5">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ok)]">Recommended action</div>
          <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">{a.recommendation}</p>
        </div>
      )}
      <div className="mt-3 text-[10px] text-[var(--color-text-mute)]">
        The FIR below is the triggering case for this alert. NETRA flags and explains — the officer decides.
      </div>
    </Card>
  );
}
function AlertFact({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">{icon} {label}</div>
      <div className="mt-0.5 text-xs text-[var(--color-text-dim)]">{children}</div>
    </div>
  );
}

function ReportSec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// The in-app "full report" — a consolidated, report-formatted view of everything on the case.
function FullReport({ c, cluster, ns, factsText }: {
  c: CaseRow; cluster: CrimeDna | undefined;
  ns: { district: string; window: string; timeWindow: string; cadenceDays?: number } | undefined;
  factsText: string;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
        <span className="text-xs font-semibold tracking-wide text-[var(--color-text)]">📄 NETRA — Full Case Report</span>
        <span className="rounded border border-[var(--color-warn)]/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--color-warn)]">Decision support</span>
      </div>
      <ReportSec title="A · Case reference">
        <Field label="FIR / Crime no">{c.crimeNo}</Field>
        <Field label="Crime type">{c.crimeSubHead}</Field>
        <Field label="District">{c.districtName}</Field>
        <Field label="Registered">{c.registeredDate}</Field>
        <Field label="Status">{c.status}</Field>
        <Field label="Gravity">{c.gravity}</Field>
      </ReportSec>
      <ReportSec title="B · Brief facts">
        <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">{factsText}</p>
      </ReportSec>
      <Dossier c={c} />
      {cluster && (
        <ReportSec title="E · Serial linkage (NETRA AI)">
          <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">
            Part of serial cluster <span className="font-medium text-[var(--color-text)]">“{cluster.label}”</span> — {cluster.memberCount} FIRs across {cluster.districts.length} districts sharing one MO.
          </p>
          {(cluster.unsolvedCount ?? 0) > 0 && cluster.offender && (
            <p className="text-xs text-[var(--color-ok)]">⚖️ Arresting {cluster.offender} could clear {cluster.unsolvedCount} unsolved cases in this series.</p>
          )}
          {ns && (
            <p className="text-xs text-[var(--color-warn)]">⚠ Projected next strike: {ns.district} · {ns.window} · {ns.timeWindow}{ns.cadenceDays ? ` — projected ~${ns.cadenceDays}d on from the series’ last recorded FIR` : ""}.</p>
          )}
        </ReportSec>
      )}
      <div className="border-t border-[var(--color-border)] pt-2 text-[10px] leading-relaxed text-[var(--color-text-mute)]">
        F · Decision support — NETRA assists, it does not decide. Verify against ground reports; forensic conclusions belong to FSL; no caste/religion enters any model. Prototype: synthetic data.
      </div>
    </div>
  );
}

// The case detail panel: brief-facts EN⇄ಕನ್ನಡ toggle (precomputed, else live sovereign-GLM
// translation), the dossier, Investigator Copilot, and an in-app "full report" expansion.
function CaseDetail({ c, cluster, ns, caseTx }: {
  c: CaseRow; cluster: CrimeDna | undefined;
  ns: { district: string; window: string; timeWindow: string; cadenceDays?: number } | undefined;
  caseTx: Record<string, { en?: string; kn?: string }>;
}) {
  const orig: "en" | "kn" = c.language === "kn" ? "kn" : "en";
  const [lang, setLang] = useState<"en" | "kn">("en");
  const [facts, setFacts] = useState<{ en?: string; kn?: string }>(() => {
    const b: { en?: string; kn?: string } = {}; b[orig] = c.briefFacts;
    const t = caseTx[c.crimeNo]; if (t?.en) b.en = t.en; if (t?.kn) b.kn = t.kn;
    return b;
  });
  const [translating, setTranslating] = useState(false);
  const [showReport, setShowReport] = useState(false);

  async function pick(l: "en" | "kn") {
    setLang(l);
    if (facts[l] !== undefined) return;
    setTranslating(true);
    try {
      const target = l === "kn" ? "Kannada (in ಕನ್ನಡ script)" : "English";
      const src = facts[orig] ?? c.briefFacts;
      const r = await glmChat([{ role: "user", content: `Translate this police FIR brief-facts text into ${target}. Reply with ONLY the translation — no notes, no preamble.\n\n${src}` }], { max_tokens: 320, temperature: 0.2 });
      setFacts((f) => ({ ...f, [l]: (r.text || "").trim() || "(translation unavailable)" }));
    } catch {
      setFacts((f) => ({ ...f, [l]: "(translation unavailable — sovereign model offline)" }));
    } finally { setTranslating(false); }
  }
  const factsText = translating && facts[lang] === undefined ? null : (facts[lang] ?? c.briefFacts);
  const isLiveTx = lang !== orig && facts[lang] !== undefined && !caseTx[c.crimeNo]?.[lang];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="tnum text-xs text-[var(--color-text-dim)]">{c.crimeNo}</span>
        <Badge tone={c.gravity === "Heinous" ? "danger" : "mute"}>{c.gravity}</Badge>
      </div>
      <div className="mt-2 text-sm font-semibold">{c.crimeSubHead}</div>
      <div className="mt-1 text-xs text-[var(--color-text-dim)]">
        {c.districtName} · registered {c.registeredDate} · {c.status}{c.language === "kn" && " · ಕನ್ನಡ (original)"}
      </div>
      <div className="mt-3 text-xs uppercase tracking-wide text-[var(--color-text-mute)]">Case progression</div>
      <CaseTimeline status={c.status} />

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-[var(--color-text-mute)]">Brief facts</span>
        <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]">
          {(["en", "kn"] as const).map((l) => (
            <button key={l} onClick={() => pick(l)}
              className={`px-2 py-0.5 text-[11px] ${lang === l ? "bg-[var(--color-accent)] text-[var(--color-bg)]" : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"}`}>
              {l === "en" ? "EN" : "ಕನ್ನಡ"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm leading-relaxed text-[var(--color-text-dim)]">
        {factsText === null ? <span className="text-[var(--color-text-mute)]">Translating via sovereign GLM…</span> : factsText}
        {isLiveTx && <span className="mt-1.5 block text-[10px] text-[var(--color-text-mute)]">Translated on-device by NETRA’s sovereign model — verify against the original.</span>}
      </p>

      {!showReport && <Dossier c={c} />}
      {!showReport && cluster && (
        <div className="mt-3 rounded-lg border border-[var(--color-accent-dim)] bg-[var(--color-surface-2)] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)]">🔍 Investigator Copilot</div>
          <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">
            This FIR is part of serial cluster <span className="font-medium text-[var(--color-text)]">“{cluster.label}”</span> —{" "}
            {cluster.memberCount} linked cases across {cluster.districts.length} districts sharing one MO:{" "}
            {cluster.signature.slice(0, 3).map((s) => s.value).join(" · ")}.
          </p>
          {(cluster.unsolvedCount ?? 0) > 0 && cluster.offender && (
            <p className="mt-1 text-xs text-[var(--color-ok)]">⚖️ Arresting {cluster.offender} could clear {cluster.unsolvedCount} unsolved cases in this series.</p>
          )}
          {ns && (
            <p className="mt-1 text-xs text-[var(--color-warn)]">⚠ Projected next strike: {ns.district} · {ns.window} · {ns.timeWindow}{ns.cadenceDays ? ` — projected ~${ns.cadenceDays}d on from the series’ last recorded FIR` : ""}.</p>
          )}
          <p className="mt-1 text-[10px] text-[var(--color-text-mute)]">Open Linkage for the full series, route &amp; predicted base.</p>
        </div>
      )}

      <button onClick={() => setShowReport((s) => !s)}
        className="mt-3 w-full rounded-lg border border-[var(--color-border-strong)] py-1.5 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-accent)]">
        {showReport ? "▴ Collapse report" : "📄 View full report"}
      </button>
      {showReport && <FullReport c={c} cluster={cluster} ns={ns} factsText={factsText ?? c.briefFacts} />}
    </Card>
  );
}

export default function Cases() {
  const scope = getSession().district; // district/station users locked to their district
  const districts = useApi<{ name: string }[]>("/geo/districts");
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? ""); // deep-link from a map dot → search that FIR
  const deepLink = useRef(!!params.get("q")); // arrived via ?q=<crimeNo> → auto-open that case file
  const alertId = params.get("alert"); // arrived from Alert Center → show the "why it fired" panel
  const [alertsFeed, setAlertsFeed] = useState<Record<string, AlertCtx>>({});
  // Deep-link filters (from the Copilot's search_cases action → /cases?type=&district=&status=).
  // A scoped officer stays locked to their own district regardless of the URL.
  const [district, setDistrict] = useState(scope ?? params.get("district") ?? "");
  const [type, setType] = useState(params.get("type") ?? "");
  const [gravity, setGravity] = useState(params.get("gravity") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [dnaMap, setDnaMap] = useState<Record<string, CrimeDna> | null>(null);
  const [spatialMap, setSpatialMap] = useState<Record<string, { nextStrike: { district: string; window: string; timeWindow: string; cadenceDays?: number } }> | null>(null);
  const [caseTx, setCaseTx] = useState<Record<string, { en?: string; kn?: string }>>({});
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).then(setDnaMap).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}spatial.json`).then((r) => r.json()).then(setSpatialMap).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}case-translations.json`).then((r) => r.json()).then(setCaseTx).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}alerts-feed.json`).then((r) => r.json())
      .then((list: AlertCtx[]) => setAlertsFeed(Object.fromEntries(list.map((a) => [a.id, a])))).catch(() => {});
  }, []);
  // The alert that led here — shown only while its own triggering FIR is the open case.
  const activeAlert = alertId ? alertsFeed[alertId] : undefined;
  const showAlert = activeAlert && selected && String(activeAlert.crimeNo) === String(selected.crimeNo)
    ? activeAlert : undefined;
  // crimeNo → serial cluster (Investigator Copilot: surface linked intelligence on any FIR)
  const clusterByCase = useMemo(() => {
    const m: Record<string, CrimeDna> = {};
    if (dnaMap) for (const c of Object.values(dnaMap)) for (const mem of c.members) m[mem.caseNo] = c;
    return m;
  }, [dnaMap]);
  // crimeNo → the member record (carries accused/forensic) + its cluster crimeType
  const memberByCase = useMemo(() => {
    const m: Record<string, { mem: DnaMember; crimeType: string }> = {};
    if (dnaMap) for (const c of Object.values(dnaMap)) for (const mem of c.members) m[mem.caseNo] = { mem, crimeType: c.crimeType };
    return m;
  }, [dnaMap]);

  // Semantic MO search — describe a crime in plain words, get the closest FIRs by meaning.
  const [caseVecs, setCaseVecs] = useState<CaseVec[] | null>(null);
  const [semQ, setSemQ] = useState("");
  const [semRes, setSemRes] = useState<{ crimeNo: string; score: number; district: string; date: string; crimeSubHead: string; clusterLabel: string; facts: string }[] | null>(null);
  const [semLoading, setSemLoading] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}case-embeddings.json`).then((r) => r.json()).then((d) => setCaseVecs(d.cases)).catch(() => {});
    preloadEmbedder();
  }, []);
  async function semanticSearch() {
    if (semQ.trim().length < 4 || !caseVecs) return;
    setSemLoading(true);
    try {
      const q = await embedText(semQ);
      const ranked = caseVecs
        .map((c) => ({ crimeNo: c.crimeNo, district: c.district, date: c.date, crimeSubHead: c.crimeSubHead, clusterLabel: c.clusterLabel, facts: c.facts, score: Math.max(0, Math.round(cosine(q, c.vector) * 100)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      setSemRes(ranked);
    } catch {
      setSemRes([]);
    } finally {
      setSemLoading(false);
    }
  }
  function openCrimeNo(crimeNo: string) {
    const hit = memberByCase[crimeNo];
    if (hit) setSelected(rowFromMember(hit.mem, hit.crimeType));
  }
  // A deep-linked FIR that belongs to a known serial cluster can open straight from local data —
  // instant, and independent of the backend (so alert/map deep-links to serial cases always land).
  useEffect(() => {
    if (deepLink.current && !selected && q && memberByCase[q]) {
      const hit = memberByCase[q];
      setSelected(rowFromMember(hit.mem, hit.crimeType));
      deepLink.current = false;
    }
  }, [memberByCase, q, selected]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    searchCases({ q, district: scope ?? district, type, gravity, status, page: String(page) })
      .then((r) => {
        if (!alive) return;
        setRows(r.items); setHasMore(r.hasMore);
        // A ?q=<full crimeNo> deep-link resolves to exactly one FIR — open its dossier immediately
        // so "Open full case file" from the map/linkage lands on the case, not a one-row list.
        if (deepLink.current && r.items.length === 1) { setSelected(r.items[0]); deepLink.current = false; }
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [q, district, type, gravity, status, page, scope]);

  // reset to page 0 when filters change
  function onFilter(setter: (v: string) => void) {
    return (v: string) => { setter(v); setPage(0); };
  }

  return (
    <div>
      <PageHeader
        title="Case Search"
        desc={`Search the ${scope ? scope + " district" : "state-wide"} FIR register (50,000 records in Data Store)`}
      />

      {showAlert && <AlertContext a={showAlert} />}

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="FIR number…"
            className="w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          {!scope && (
            <Select value={district} onChange={onFilter(setDistrict)} placeholder="All districts"
              options={(districts.data ?? []).map((d) => d.name)} />
          )}
          <Select value={type} onChange={onFilter(setType)} placeholder="All crime types" options={CRIME_TYPES} />
          <Select value={gravity} onChange={onFilter(setGravity)} placeholder="All gravity" options={["Heinous", "Non-Heinous"]} />
          <Select value={status} onChange={onFilter(setStatus)} placeholder="All statuses" options={STATUSES} />
          {(q || district !== (scope ?? "") || type || gravity || status) && (
            <button
              onClick={() => { setQ(""); setDistrict(scope ?? ""); setType(""); setGravity(""); setStatus(""); setPage(0); }}
              className="text-xs text-[var(--color-text-dim)] underline-offset-2 hover:text-[var(--color-accent)] hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </Card>

      <Card className="mb-4 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
          <svg className="w-4 h-4 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
            <path d="M12 8v4l3 3"/>
          </svg>
          <span>Smart MO search</span>
          <span className="text-xs font-normal text-[var(--color-text-mute)]">— describe the crime in plain words (English or ಕನ್ನಡ)</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={semQ}
            onChange={(e) => setSemQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") semanticSearch(); }}
            placeholder="e.g. midnight shop break-ins where cash and phones were taken"
            className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={semanticSearch}
            disabled={semQ.trim().length < 4 || semLoading || !caseVecs}
            title={semLoading ? "Searching…"
              : !caseVecs ? "Loading the semantic index — available in a moment"
              : semQ.trim().length < 4 ? "Type at least 4 characters to search"
              : "Search cases by meaning, not keywords"}
            className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {semLoading ? "Searching…" : "Search"}
          </button>
        </div>
        {/* Say why the button is unavailable — especially while the index is still loading. */}
        {!caseVecs && !semLoading && (
          <div className="mt-1.5 text-[11px] text-[var(--color-text-mute)]">Loading the semantic index…</div>
        )}
        {semRes && (
          <div className="mt-3 space-y-1.5">
            {semRes.length === 0 && <div className="text-xs text-[var(--color-text-mute)]">No semantic matches.</div>}
            {semRes.map((r) => (
              <button key={r.crimeNo} onClick={() => openCrimeNo(r.crimeNo)}
                className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-left hover:border-[var(--color-accent-dim)]">
                <span className="tnum w-10 shrink-0 text-right text-sm font-semibold text-[var(--color-accent)]">{r.score}%</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-[var(--color-text)]">{r.crimeSubHead} · <span className="text-[var(--color-text-mute)]">{r.district} · {r.date}</span></div>
                  <div className="truncate text-[11px] text-[var(--color-text-dim)]">{r.facts}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {dnaMap && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="flex items-center gap-1 text-[var(--color-text-mute)] font-medium">
            <svg className="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>Serial cases with linked intelligence:</span>
          </span>
          {Object.values(dnaMap).slice(0, 5).map((c) => {
            const m = c.members.find((x) => x.solved === false) ?? c.members[0];
            const row = {
              crimeNo: m.caseNo, crimeSubHead: c.crimeType, districtName: m.district,
              registeredDate: m.date, status: m.solved ? "Charge Sheeted" : "Under Investigation",
              gravity: "Non-Heinous", briefFacts: m.facts, language: m.language ?? "en",
              accused: m.accused ? [{ name: m.accused.name, priorCases: m.accused.priorCases, historySheeter: m.accused.historySheeter }] : [],
              forensic: m.forensic ?? null,
            } as CaseRow;
            return (
              <button
                key={m.caseNo}
                onClick={() => setSelected(row)}
                className="tnum rounded border border-[var(--color-accent-dim)] px-2 py-0.5 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
              >
                {m.caseNo}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <State loading={loading} error={error} empty={rows.length === 0}>
            <div className="space-y-2">
              {rows.map((c) => (
                <button
                  key={c.crimeNo}
                  onClick={() => setSelected(c)}
                  className={`block w-full rounded-xl border p-3 text-left transition-colors ${
                    selected?.crimeNo === c.crimeNo
                      ? "border-[var(--color-accent-dim)] bg-[var(--color-surface-2)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="tnum text-xs text-[var(--color-text-dim)]">{c.crimeNo}</span>
                    <Badge tone={c.gravity === "Heinous" ? "danger" : "mute"}>{c.gravity}</Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium text-[var(--color-text)]">{c.crimeSubHead}</div>
                  <div className="mt-0.5 text-xs text-[var(--color-text-mute)]">
                    {c.districtName} · {c.registeredDate} · {c.status}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-[var(--color-text-dim)] disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="tnum text-xs text-[var(--color-text-mute)]">page {page + 1}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-[var(--color-text-dim)] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </State>
        </div>

        <div className="lg:col-span-2">
          {selected ? (() => {
            // Enrich a cluster-member FIR with its forensic/accused (the backend /cases row carries
            // neither) so a deep-linked or list-clicked serial FIR shows the full dossier + report.
            let c = selected;
            if (!selected.forensic && !(selected.accused && selected.accused.length)) {
              const hit = memberByCase[selected.crimeNo];
              if (hit) c = { ...selected, accused: rowFromMember(hit.mem, hit.crimeType).accused, forensic: hit.mem.forensic ?? null };
            }
            const cluster = clusterByCase[selected.crimeNo];
            const ns = cluster ? spatialMap?.[cluster.clusterId]?.nextStrike : undefined;
            return <CaseDetail key={selected.crimeNo} c={c} cluster={cluster} ns={ns} caseTx={caseTx} />;
          })() : (
            <Card className="flex h-40 items-center justify-center p-4 text-sm text-[var(--color-text-mute)]">
              Select a case to view its details
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi, Card, PageHeader, State, Badge } from "@/components/ui";
import { searchCases, type CaseRow, type Forensic } from "@/api/client";
import { getSession } from "@/lib/auth";
import { type CrimeDna, type DnaMember } from "@/components/CrimeDNA";
import { embedText, preloadEmbedder } from "@/lib/embedMatch";

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
          <div className="mb-2 text-xs font-semibold text-[var(--color-text)]">👥 Parties</div>
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
          <div className="mb-2 text-xs font-semibold text-[var(--color-text)]">🔬 Forensic &amp; physical evidence</div>
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

export default function Cases() {
  const scope = getSession().district; // district/station users locked to their district
  const districts = useApi<{ name: string }[]>("/geo/districts");
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? ""); // deep-link from a map dot → search that FIR
  const [district, setDistrict] = useState(scope ?? "");
  const [type, setType] = useState("");
  const [gravity, setGravity] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [dnaMap, setDnaMap] = useState<Record<string, CrimeDna> | null>(null);
  const [spatialMap, setSpatialMap] = useState<Record<string, { nextStrike: { district: string; window: string; timeWindow: string; cadenceDays?: number } }> | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).then(setDnaMap).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}spatial.json`).then((r) => r.json()).then(setSpatialMap).catch(() => {});
  }, []);
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    searchCases({ q, district: scope ?? district, type, gravity, status, page: String(page) })
      .then((r) => { if (alive) { setRows(r.items); setHasMore(r.hasMore); } })
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
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)]">
          🧠 Smart MO search <span className="text-xs font-normal text-[var(--color-text-mute)]">— describe the crime in plain words (English or ಕನ್ನಡ)</span>
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
            className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-bg)] disabled:opacity-40"
          >
            {semLoading ? "Searching…" : "Search"}
          </button>
        </div>
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
          <span className="text-[var(--color-text-mute)]">🔍 Serial cases with linked intelligence:</span>
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
          {selected ? (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="tnum text-xs text-[var(--color-text-dim)]">{selected.crimeNo}</span>
                <Badge tone={selected.gravity === "Heinous" ? "danger" : "mute"}>{selected.gravity}</Badge>
              </div>
              <div className="mt-2 text-sm font-semibold">{selected.crimeSubHead}</div>
              <div className="mt-1 text-xs text-[var(--color-text-dim)]">
                {selected.districtName} · registered {selected.registeredDate} · {selected.status}
                {selected.language === "kn" && " · ಕನ್ನಡ"}
              </div>
              <div className="mt-3 text-xs uppercase tracking-wide text-[var(--color-text-mute)]">Case progression</div>
              <CaseTimeline status={selected.status} />
              <div className="mt-3 text-xs uppercase tracking-wide text-[var(--color-text-mute)]">Brief facts</div>
              <p className="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm leading-relaxed text-[var(--color-text-dim)]">
                {selected.briefFacts}
              </p>
              <Dossier c={selected} />
              {clusterByCase[selected.crimeNo] && (() => {
                const c = clusterByCase[selected.crimeNo];
                const ns = spatialMap?.[c.clusterId]?.nextStrike;
                return (
                  <div className="mt-3 rounded-lg border border-[var(--color-accent-dim)] bg-[var(--color-surface-2)] p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)]">
                      🔍 Investigator Copilot
                    </div>
                    <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">
                      This FIR is part of serial cluster <span className="font-medium text-[var(--color-text)]">“{c.label}”</span> —{" "}
                      {c.memberCount} linked cases across {c.districts.length} districts sharing one MO:{" "}
                      {c.signature.slice(0, 3).map((s) => s.value).join(" · ")}.
                    </p>
                    {(c.unsolvedCount ?? 0) > 0 && c.offender && (
                      <p className="mt-1 text-xs text-[var(--color-ok)]">
                        ⚖️ Arresting {c.offender} could clear {c.unsolvedCount} unsolved cases in this series.
                      </p>
                    )}
                    {ns && (
                      <p className="mt-1 text-xs text-[var(--color-warn)]">
                        ⚠ Projected next strike: {ns.district} · {ns.window} · {ns.timeWindow}{ns.cadenceDays ? ` — projected ~${ns.cadenceDays}d on from the series’ last recorded FIR` : ""}.
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-[var(--color-text-mute)]">
                      Open Linkage for the full series, route & predicted base.
                    </p>
                  </div>
                );
              })()}
            </Card>
          ) : (
            <Card className="flex h-40 items-center justify-center p-4 text-sm text-[var(--color-text-mute)]">
              Select a case to view its details
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useApi, Card, PageHeader, State, Badge } from "@/components/ui";
import { searchCases, type CaseRow } from "@/api/client";
import { getSession } from "@/lib/auth";
import { type CrimeDna } from "@/components/CrimeDNA";

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
  const [q, setQ] = useState("");
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
  const [spatialMap, setSpatialMap] = useState<Record<string, { nextStrike: { district: string; window: string; timeWindow: string } }> | null>(null);
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

      {dnaMap && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[var(--color-text-mute)]">🔍 Serial cases with linked intelligence:</span>
          {Object.values(dnaMap).slice(0, 5).map((c) => {
            const m = c.members.find((x) => x.solved === false) ?? c.members[0];
            const row = {
              crimeNo: m.caseNo, crimeSubHead: c.crimeType, districtName: m.district,
              registeredDate: m.date, status: m.solved ? "Charge Sheeted" : "Under Investigation",
              gravity: "Non-Heinous", briefFacts: m.facts, language: m.language ?? "en",
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
                        ⚠ Predicted next strike: {ns.district} · {ns.window} · {ns.timeWindow}.
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

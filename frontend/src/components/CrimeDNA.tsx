// Crime-DNA fingerprint panel — the hero visual. Renders a serial cluster's shared
// modus-operandi as a normalized "fingerprint" (When/Method/Target/…), the strike
// cadence + spread, and the member FIRs with the shared MO phrases highlighted so a
// judge SEES "different wording, same hand." Data: public/crime-dna.json (build_crime_dna.py).
import { useState } from "react";
import { Badge } from "@/components/ui";

interface DnaSig { dim: string; icon: string; value: string }
export interface DnaForensic {
  weapon: string; tools: string[]; evidenceRecovered: string[]; fingerprint: string;
  seizure: { memoNo: string; panchnama: string; seizingOfficer: string; malkhana: string; custody: string };
  fsl: { ref: string; status: string } | null;
}
export interface DnaAccused { name: string; priorCases?: number; historySheeter?: boolean }
export interface DnaMember {
  caseNo: string; district: string; date: string; facts: string; language: string; solved?: boolean;
  accused?: DnaAccused | null; forensic?: DnaForensic;
}
export interface CrimeDna {
  clusterId: string;
  label: string;
  crimeType: string;
  districts: string[];
  memberCount: number;
  confidence: number;
  signature: DnaSig[];
  sharedDimensions: string[];
  span: { first: string | null; last: string | null; days: number; cadenceDays: number | null };
  members: DnaMember[];
  offender?: string | null;
  unsolvedCount?: number;
  unsolvedDistricts?: string[];
  why: string;
}

// Wrap any occurrence of a shared MO phrase in an accent highlight — the "same MO,
// different narrative" proof. Case-insensitive, longest phrases first so they win.
function highlight(text: string, phrases: string[]) {
  const parts: { t: string; hit: boolean }[] = [{ t: text, hit: false }];
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (!p || p.length < 3) continue;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].hit) continue;
      const seg = parts[i].t;
      const idx = seg.toLowerCase().indexOf(p.toLowerCase());
      if (idx === -1) continue;
      const before = seg.slice(0, idx);
      const mid = seg.slice(idx, idx + p.length);
      const after = seg.slice(idx + p.length);
      const repl = [
        ...(before ? [{ t: before, hit: false }] : []),
        { t: mid, hit: true },
        ...(after ? [{ t: after, hit: false }] : []),
      ];
      parts.splice(i, 1, ...repl);
      i += repl.length - 1;
    }
  }
  return parts.map((p, i) =>
    p.hit ? (
      <mark key={i} className="rounded bg-[var(--color-accent)]/15 px-0.5 font-medium text-[var(--color-accent)]">
        {p.t}
      </mark>
    ) : (
      <span key={i}>{p.t}</span>
    )
  );
}

export default function CrimeDNA({ dna }: { dna: CrimeDna }) {
  const phrases = dna.signature.map((s) => s.value);
  const cadence = dna.span.cadenceDays;
  const [showClear, setShowClear] = useState(false);
  const unsolved = dna.members.filter((m) => m.solved === false);

  return (
    <div className="space-y-4">
      {/* Fingerprint header */}
      <div className="rounded-xl border border-[var(--color-accent-dim)] bg-[var(--color-surface-2)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧬</span>
            <span className="text-sm font-semibold text-[var(--color-text)]">Crime DNA</span>
            <span className="text-xs text-[var(--color-text-mute)]">modus-operandi fingerprint</span>
          </div>
          <Badge tone="accent">{Math.round(dna.confidence * 100)}% cohesion</Badge>
        </div>

        {/* Signature dimensions — the shared MO */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dna.signature.map((s) => (
            <div
              key={s.dim + s.value}
              className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            >
              <span className="mt-0.5 text-base leading-none">{s.icon}</span>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-mute)]">{s.dim}</div>
                <div className="truncate text-sm text-[var(--color-text)]" title={s.value}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-[11px] text-[var(--color-text-mute)]">
          Every member FIR shares these {dna.signature.length} traits — that shared signature is what links the series.
        </div>
      </div>

      {/* Spread + cadence */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-[var(--color-bg)] p-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">Linked FIRs</div>
          <div className="tnum text-lg font-semibold text-[var(--color-text)]">{dna.memberCount}</div>
        </div>
        <div className="rounded-lg bg-[var(--color-bg)] p-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">Districts</div>
          <div className="tnum text-lg font-semibold text-[var(--color-text)]">{dna.districts.length}</div>
        </div>
        <div className="rounded-lg bg-[var(--color-bg)] p-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">Strike cadence</div>
          <div className="tnum text-lg font-semibold text-[var(--color-text)]">{cadence ? `~${cadence}d` : "—"}</div>
        </div>
      </div>

      {/* Why one series */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm leading-relaxed text-[var(--color-text-dim)]">
        <span className="font-medium text-[var(--color-text)]">Why one series: </span>{dna.why}
      </div>

      {/* One arrest → many clearances */}
      {dna.offender && (dna.unsolvedCount ?? 0) > 0 && (
        <div className="rounded-xl border border-[var(--color-ok)]/40 bg-[var(--color-ok)]/[0.06] p-3">
          <div className="flex items-center gap-2 text-sm">
            <span>⚖️</span>
            <span className="font-semibold text-[var(--color-text)]">One arrest → many clearances</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-dim)]">
            <span className="font-semibold text-[var(--color-ok)]">{dna.unsolvedCount} of the {dna.memberCount} linked FIRs</span> in this series are still unsolved.
            Arrest <span className="font-medium text-[var(--color-accent)]">{dna.offender}</span> — the shared hand across all {dna.memberCount} —
            and those {dna.unsolvedCount} open case{dna.unsolvedCount === 1 ? "" : "s"} across {dna.unsolvedDistricts?.length} district{dna.unsolvedDistricts?.length === 1 ? "" : "s"}
            {" "}({dna.unsolvedDistricts?.join(", ")}) clear in one go — one arrest, {dna.unsolvedCount} clearance{dna.unsolvedCount === 1 ? "" : "s"}.
          </p>
          <button
            onClick={() => setShowClear((v) => !v)}
            className="mt-2 rounded-lg border border-[var(--color-ok)]/50 px-2.5 py-1 text-[11px] font-medium text-[var(--color-ok)] hover:bg-[var(--color-ok)]/10"
          >
            {showClear ? "Hide clearable cases" : `Reveal ${dna.unsolvedCount} clearable cases`}
          </button>
          {showClear && (
            <ul className="mt-2 space-y-1">
              {unsolved.map((m) => (
                <li key={m.caseNo} className="flex items-center justify-between rounded-md bg-[var(--color-bg)] px-2 py-1 text-[11px]">
                  <span className="tnum text-[var(--color-text-dim)]">{m.caseNo}</span>
                  <span className="text-[var(--color-text-mute)]">{m.district} · {m.date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Member FIRs with MO phrases highlighted */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-[var(--color-text-mute)]">
          <span>Member FIRs — same MO, different wording</span>
          <span className="flex items-center gap-2 normal-case tracking-normal text-[10px]">
            <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" /> solved</span>
            <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-warn)]" /> unsolved</span>
          </span>
        </div>
        <ul className="space-y-2">
          {dna.members.map((m) => (
            <li key={m.caseNo} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
              <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--color-text-mute)]">
                <span className="tnum flex items-center gap-1.5">
                  {m.solved !== undefined && (
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${m.solved ? "bg-[var(--color-ok)]" : "bg-[var(--color-warn)]"}`}
                      title={m.solved ? "Solved" : "Unsolved"}
                    />
                  )}
                  {m.caseNo}
                </span>
                <span>{m.district} · {m.date}{m.language === "kn" ? " · ಕನ್ನಡ" : ""}</span>
              </div>
              <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">{highlight(m.facts, phrases)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

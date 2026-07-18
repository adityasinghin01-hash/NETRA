// NETRA Copilot — grounded, sovereign question-answering. NO external LLM: it retrieves
// from the same precomputed intelligence the screens use and composes cited answers with
// deterministic templating (the honest, can't-hallucinate default; QuickML phrasing is an
// optional future layer). Every answer names its sources.
import { DISTRICTS } from "@/lib/auth";

const B = import.meta.env.BASE_URL;

export interface CopilotAnswer { text: string; cites: string[]; follow: string[] }

/* eslint-disable @typescript-eslint/no-explicit-any */
let cache: Record<string, any> | null = null;
async function load() {
  if (cache) return cache;
  const files = ["forecast", "network-graph", "cold-cases", "crime-dna", "spatial", "crime-clock", "district-analytics", "briefings"];
  const got = await Promise.all(
    files.map((f) => fetch(`${B}${f}.json`).then((r) => r.json()).catch(() => null))
  );
  cache = Object.fromEntries(files.map((f, i) => [f, got[i]]));
  return cache;
}

export function preloadCopilot() { load(); }

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const has = (q: string, ...w: string[]) => w.some((x) => q.includes(x));

function findDistrict(q: string): string | null {
  const lower = q.toLowerCase();
  return DISTRICTS.find((d) => lower.includes(d.toLowerCase())) ?? null;
}
function findCluster(q: string, dna: any): any | null {
  if (!dna) return null;
  const lower = q.toLowerCase();
  // match by label words (e.g. "shutter", "otp", "chain", "atm", "temple", "job")
  for (const c of Object.values<any>(dna)) {
    const words = c.label.toLowerCase().split(/[^a-z]+/).filter((w: string) => w.length > 3);
    if (words.some((w: string) => lower.includes(w))) return c;
  }
  return null;
}

export async function askCopilot(qRaw: string, scope: string | null): Promise<CopilotAnswer> {
  const q = qRaw.toLowerCase().trim();
  const d = await load();
  const cite = (s: string) => s;

  // --- capability / greeting ---
  if (has(q, "help", "what can you", "who are you", "hello", "hi ", "hey") || q.length < 3) {
    return {
      text: "I'm **NETRA Copilot** — I answer from live crime intelligence, with citations and no data leaving the police cloud. Ask me about hotspot forecasts, serial clusters, crime rings & kingpins, cases at risk of going cold, crime timing, or any district's stats.",
      cites: ["NETRA"],
      follow: ["Which hotspots next week?", "Who are the crime kingpins?", "Cases at risk of going cold?", "Tell me about the shutter-cutting burglar"],
    };
  }

  const district = findDistrict(qRaw) ?? scope;

  // --- crime rings / kingpins / network ---
  if (has(q, "ring", "gang", "kingpin", "network", "organiz", "organis", "coordinator")) {
    const comms = d["network-graph"]?.communities ?? [];
    if (comms.length) {
      const top = comms[0];
      const list = comms.slice(0, 4).map((c: any) => `**${c.label}** (${c.size} members, kingpin ${c.kingpin})`).join("; ");
      return {
        text: `NETRA detected **${comms.length} organized crime rings** via community detection. Largest: **${top.label}** — ${top.size} members, coordinated by kingpin **${top.kingpin}**. Rings: ${list}. Removing the kingpin fragments the ring — target the coordinator, not just foot-soldiers.`,
        cites: [cite("Analytics · offender network"), cite("Louvain + centrality")],
        follow: ["Cases at risk of going cold?", "Which hotspots next week?"],
      };
    }
  }

  // --- forecast / hotspots ---
  if (has(q, "hotspot", "forecast", "next week", "predict", "where will", "patrol", "risk building")) {
    const hs = d.forecast?.hotspots ?? [];
    if (hs.length) {
      const top = hs.slice(0, 4).map((h: any) => `**${h.district}** (${h.crimeType.toLowerCase()}, ${h.riskLevel}, patrol ${h.patrolWindow})`).join("; ");
      const hr = d.forecast?.metrics?.hitRateTop5;
      return {
        text: `The 7-day forecast flags **${hs.length} elevated hotspots**. Priorities: ${top}. Suggested action: deploy patrols to those windows.${hr ? ` (Model top-5 hit-rate ${Math.round(hr * 100)}%.)` : ""}`,
        cites: [cite("Command Map · 7-day forecast"), cite("gradient-boosting model")],
        follow: ["Who are the crime kingpins?", "When does crime peak?"],
      };
    }
  }

  // --- cold cases ---
  if (has(q, "cold", "going cold", "at risk", "undetected", "unsolved", "worklist")) {
    const cc = d["cold-cases"];
    const rows = (district ? cc?.districts?.[district] : cc?.state) ?? [];
    if (rows.length) {
      const top = rows.slice(0, 3).map((c: any) => `${c.crimeNo} (${c.type}, ${c.district}, ${Math.round(c.risk * 100)}% risk — ${c.reason})`).join("; ");
      return {
        text: `${district ? district + ": " : ""}**${rows.length}${district ? "" : "+"} open cases** are flagged as most likely to go undetected — intervene now. Top: ${top}.`,
        cites: [cite("Analytics · cases at risk of going cold")],
        follow: ["Which hotspots next week?", district ? `Detection rate in ${district}?` : "Detection rate by district?"],
      };
    }
  }

  // --- serial cluster / MO / arrest-clearances ---
  if (has(q, "serial", "cluster", "linked", "modus", " mo", "burglar", "theft", "fraud", "snatch", "arrest", "clear", "dna", "signature")) {
    const c = findCluster(qRaw, d["crime-dna"]);
    if (c) {
      const sp = d.spatial?.[c.clusterId];
      const ns = sp?.nextStrike;
      const sig = (c.signature ?? []).slice(0, 3).map((s: any) => s.value).join(" · ");
      let t = `**${c.label}** — ${c.memberCount} FIRs across ${c.districts.length} districts (${c.districts.join(", ")}) sharing one MO: ${sig}.`;
      if (c.offender && c.unsolvedCount) t += ` ⚖️ Arresting **${c.offender}** could clear **${c.unsolvedCount} unsolved cases** in this series.`;
      if (ns) t += ` ⚠ Predicted next strike: **${ns.district}** · ${ns.window} · ${ns.timeWindow} (${Math.round(ns.confidence * 100)}%).`;
      return { text: t, cites: [cite(`Linkage · ${c.clusterId}`), cite("Crime-DNA + Rossmo")], follow: ["Show the offender's route", "Who are the crime kingpins?"] };
    }
    // generic: list clusters
    const all = Object.values<any>(d["crime-dna"] ?? {});
    if (all.length) {
      const list = all.slice(0, 5).map((c: any) => `**${c.label}** (${c.memberCount} cases)`).join("; ");
      return { text: `NETRA has linked **${all.length} serial clusters** by modus operandi. E.g.: ${list}. Ask about any one for its MO signature, route, predicted base and next strike.`, cites: [cite("Linkage · Crime-DNA")], follow: ["Tell me about the shutter-cutting burglar", "OTP bank-fraud call centre?"] };
    }
  }

  // --- crime timing / clock ---
  if (has(q, "when", "time", "hour", "clock", "peak", "night", "what time")) {
    const m = (district ? d["crime-clock"]?.districts?.[district] : d["crime-clock"]?.state) as number[][] | undefined;
    if (m) {
      let bd = 0, bh = 0, mx = -1;
      for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) if (m[wd][h] > mx) { mx = m[wd][h]; bd = wd; bh = h; }
      const early = m.reduce((s, row) => s + row.slice(0, 6).reduce((a, b) => a + b, 0), 0);
      const tot = m.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
      return {
        text: `${district ? district + ": " : ""}Crime peaks on **${DAYS[bd]} around ${String(bh).padStart(2, "0")}:00**. The early hours (midnight–06:00) account for **${Math.round((100 * early) / (tot || 1))}%** of incidents — the window to concentrate patrols.`,
        cites: [cite("Analytics · Crime Clock")],
        follow: ["Which hotspots next week?", district ? `${district} stats?` : "Detection rate by district?"],
      };
    }
  }

  // --- district stats / detection / summary ---
  if (district) {
    const da = d["district-analytics"]?.districts?.[district];
    if (da) {
      const oc = da.outcome;
      const top = (da.topCrimes ?? []).slice(0, 3).map((t: any) => `${t.type} (${t.pct}%)`).join(", ");
      return {
        text: `**${district}** — ${da.total.toLocaleString()} FIRs on record, ${da.heinous} heinous. Detection rate **${oc.detectionPct}%**, undetected **${oc.undetectedPct}%**. Leading crimes: ${top}.`,
        cites: [cite(`Analytics · ${district}`)],
        follow: [`Cases at risk of going cold in ${district}?`, `When does crime peak in ${district}?`],
      };
    }
  }

  // --- fallback ---
  return {
    text: "I couldn't map that to the intelligence I hold. I can answer about: **hotspot forecasts**, **serial clusters & MO**, **crime rings & kingpins**, **cases at risk of going cold**, **crime timing**, and **district stats**. Try one of the suggestions below.",
    cites: [],
    follow: ["Which hotspots next week?", "Who are the crime kingpins?", "Cases at risk of going cold?", "When does crime peak?"],
  };
}

import { useEffect, useMemo, useState } from "react";
import { Card, PageHeader, State } from "@/components/ui";
import { getSession } from "@/lib/auth";

interface Brief {
  district: string;
  date: string;
  en: string;
  kn: string;
  stats: {
    fir30d: number; changePct: number; detectionPct: number; leadType: string; alert: string | null;
    topCrimes: { type: string; pct: number }[];
    forecast: { riskLevel: string; crimeType: string; patrolWindow: string } | null;
  };
}

export default function Briefing() {
  const [all, setAll] = useState<Record<string, Brief> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [district, setDistrict] = useState<string>(getSession().district ?? "Bengaluru Urban");
  const [lang, setLang] = useState<"en" | "kn">("en");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}briefings.json`)
      .then((r) => r.json())
      .then(setAll)
      .catch(() => setErr("Could not load briefings"));
  }, []);

  const districtNames = useMemo(
    () => (all ? Object.values(all).sort((a, b) => b.stats.fir30d - a.stats.fir30d).map((b) => b.district) : []),
    [all]
  );
  const brief = all?.[district];

  function downloadPdf() {
    if (!brief) return;
    const s = brief.stats;
    const body = lang === "en" ? brief.en : brief.kn;
    const chg = `${s.changePct > 0 ? "+" : ""}${s.changePct}%`;
    const crimes = s.topCrimes.map((c) =>
      `<div class="bar-row"><span class="bar-label">${c.type}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.min(100, c.pct * 4)}%"></span></span>
        <span class="bar-pct">${c.pct}%</span></div>`).join("");
    const alertHtml = s.alert
      ? `<div class="callout callout-alert"><div class="callout-h">⚠ Active alert</div>A rise in <b>${s.alert}</b> has been flagged by anomaly detection — recommend focused deployment.</div>`
      : "";
    const fcHtml = s.forecast
      ? `<div class="callout callout-fc"><div class="callout-h">7-day forecast</div><b>${s.forecast.riskLevel}</b> risk projected (primarily ${s.forecast.crimeType.toLowerCase()}). Suggested patrol window <b>${s.forecast.patrolWindow}</b>.</div>`
      : "";
    const w = window.open("", "_blank", "width=760,height=980");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>NETRA Briefing — ${brief.district}</title>
      <style>
        *{box-sizing:border-box} body{font-family:Inter,system-ui,-apple-system,sans-serif;color:#0f1e33;margin:0;background:#fff}
        .page{max-width:720px;margin:0 auto;padding:44px 48px}
        .lh{display:flex;align-items:center;justify-content:space-between}
        .brand{font-weight:800;letter-spacing:.14em;font-size:15px;color:#0e2c52}
        .brand span{font-size:16px}
        .org{text-align:center;font-size:11px;letter-spacing:.16em;color:#5a6b82;font-weight:600}
        .org small{display:block;letter-spacing:.06em;font-weight:400;color:#8a97a8;margin-top:2px;text-transform:none}
        .classif{font-size:9px;letter-spacing:.14em;color:#b04a2f;border:1px solid #e3b7ab;border-radius:4px;padding:3px 7px;font-weight:700}
        .rule{height:3px;background:linear-gradient(90deg,#0e2c52,#2f6fb0);margin:14px 0 22px;border-radius:2px}
        h1{font-size:22px;margin:0 0 3px;color:#0e2c52} .sub{color:#5a6b82;font-size:13px;margin-bottom:22px}
        .metrics{display:flex;gap:12px;margin-bottom:24px}
        .metric{flex:1;border:1px solid #e3e8ef;border-radius:10px;padding:12px 14px}
        .metric .k{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8a97a8}
        .metric .v{font-size:22px;font-weight:700;margin-top:3px}
        .v.pos{color:#b04a2f}.v.neg{color:#1f8a5b}
        h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:#0e2c52;border-bottom:1px solid #e3e8ef;padding-bottom:6px;margin:26px 0 12px}
        p{font-size:14px;line-height:1.75;margin:0}
        .bar-row{display:flex;align-items:center;gap:10px;font-size:12px;margin:7px 0}
        .bar-label{width:170px;color:#3a4a60} .bar-track{flex:1;height:8px;background:#eef2f7;border-radius:5px;overflow:hidden}
        .bar-fill{display:block;height:100%;background:#2f6fb0} .bar-pct{width:36px;text-align:right;color:#5a6b82}
        .callout{border-radius:10px;padding:12px 15px;font-size:13px;margin:12px 0;line-height:1.6}
        .callout-h{font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
        .callout-alert{background:#fdf1ee;border:1px solid #f0cabb;color:#7a3220}
        .callout-fc{background:#eef4fb;border:1px solid #cbdcf0;color:#1e3a5f}
        .foot{color:#9aa6b5;font-size:10px;margin-top:30px;border-top:1px solid #e3e8ef;padding-top:12px;line-height:1.6}
        @media print{.page{padding:24px 30px}}
      </style></head><body><div class="page">
        <div class="lh">
          <div class="brand">👁️ <span>NETRA</span></div>
          <div class="org">KARNATAKA STATE POLICE<small>Networked Evidence, Tracking &amp; Risk Analytics</small></div>
          <div class="classif">DECISION SUPPORT</div>
        </div>
        <div class="rule"></div>
        <h1>Daily Intelligence Briefing</h1>
        <div class="sub">${brief.district} District · ${brief.date}</div>
        <div class="metrics">
          <div class="metric"><div class="k">30-day FIRs</div><div class="v">${s.fir30d}</div></div>
          <div class="metric"><div class="k">vs previous month</div><div class="v ${s.changePct > 0 ? "pos" : "neg"}">${chg}</div></div>
          <div class="metric"><div class="k">Detection rate</div><div class="v">${s.detectionPct}%</div></div>
        </div>
        <h2>Executive summary</h2>
        <p>${body}</p>
        <h2>Leading crime types — last 30 days</h2>
        ${crimes}
        ${alertHtml}${fcHtml}
        <div class="foot">Auto-generated by NETRA from live district analytics · Karnataka State Police · Decision support — verify against ground reports before acting (human-in-the-loop) · Prototype: synthetic data.</div>
      </div></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div>
      <PageHeader
        title="AI Daily Briefing"
        desc={brief ? `${brief.district} · ${brief.date}` : undefined}
        right={
          <div className="flex items-center gap-2">
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            >
              {districtNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)]">
              {(["en", "kn"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3 py-1.5 text-sm ${lang === l ? "bg-[var(--color-accent)] text-[var(--color-bg)]" : "text-[var(--color-text-dim)]"}`}
                >
                  {l === "en" ? "EN" : "ಕನ್ನಡ"}
                </button>
              ))}
            </div>
          </div>
        }
      />
      <State loading={!all && !err} error={err} empty={!!all && !brief}>
        {brief && (
          <Card className="mx-auto max-w-2xl p-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Morning Brief — {brief.district}</div>
              <button
                onClick={downloadPdf}
                className="rounded-lg border border-[var(--color-border-strong)] px-3 py-1 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-accent)]"
              >
                Download PDF
              </button>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-[var(--color-bg)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">30-day FIRs</div>
                <div className="tnum text-lg font-semibold">{brief.stats.fir30d}</div>
              </div>
              <div className="rounded-lg bg-[var(--color-bg)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">vs prev month</div>
                <div className={`tnum text-lg font-semibold ${brief.stats.changePct > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-ok)]"}`}>
                  {brief.stats.changePct > 0 ? "+" : ""}{brief.stats.changePct}%
                </div>
              </div>
              <div className="rounded-lg bg-[var(--color-bg)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">Detection</div>
                <div className="tnum text-lg font-semibold">{brief.stats.detectionPct}%</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-text-dim)]">{lang === "en" ? brief.en : brief.kn}</p>
            <div className="mt-6 text-[10px] text-[var(--color-text-mute)]">
              Auto-generated from live district analytics · English &amp; Kannada · decision support, human-in-the-loop
            </div>
          </Card>
        )}
      </State>
    </div>
  );
}

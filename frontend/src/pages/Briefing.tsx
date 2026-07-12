import { useEffect, useMemo, useState } from "react";
import { Card, PageHeader, State } from "@/components/ui";

interface Brief {
  district: string;
  date: string;
  en: string;
  kn: string;
  stats: { fir30d: number; changePct: number; detectionPct: number; leadType: string; alert: string | null };
}

export default function Briefing() {
  const [all, setAll] = useState<Record<string, Brief> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [district, setDistrict] = useState<string>("Bengaluru Urban");
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
    const body = lang === "en" ? brief.en : brief.kn;
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>NETRA Briefing — ${brief.district}</title>
      <style>body{font-family:Inter,system-ui,-apple-system,sans-serif;max-width:640px;margin:48px auto;color:#111;line-height:1.7;padding:0 24px}
      h1{font-size:19px;margin:0 0 2px} .meta{color:#666;font-size:13px;margin-bottom:18px}
      .stats{display:flex;gap:12px;margin:0 0 18px} .stat{border:1px solid #ddd;border-radius:8px;padding:8px 14px;font-size:13px}
      .stat b{display:block;font-size:17px} p{font-size:14px} .foot{color:#999;font-size:11px;margin-top:28px;border-top:1px solid #eee;padding-top:10px}</style>
      </head><body>
      <h1>NETRA — Daily Intelligence Briefing</h1>
      <div class="meta">${brief.district} · ${brief.date}</div>
      <div class="stats">
        <div class="stat">30-day FIRs<b>${brief.stats.fir30d}</b></div>
        <div class="stat">vs prev month<b>${brief.stats.changePct > 0 ? "+" : ""}${brief.stats.changePct}%</b></div>
        <div class="stat">Detection<b>${brief.stats.detectionPct}%</b></div>
      </div>
      <p>${body}</p>
      <div class="foot">Auto-generated from live district analytics · Karnataka State Police · decision support, human-in-the-loop · synthetic data</div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
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

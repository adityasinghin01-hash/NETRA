"""Build the Copilot's retrieval corpus — "knowledge cards": one short, cited,
natural-language document per fact in NETRA's precomputed intelligence. These are what
the Copilot retrieves over (dense + BM25) to answer ANY question, grounded and cited.

Reads frontend/public/*.json → writes frontend/public/copilot-cards.json
Run: python3 -m pipeline.build_cards
"""
import json
from pathlib import Path

PUB = Path("frontend/public")
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def j(name):
    p = PUB / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else None


def main():
    cards = []

    def add(cid, ctype, title, text, cite, meta=None):
        cards.append({"id": cid, "type": ctype, "title": title,
                      "text": " ".join(text.split()), "cite": cite, "meta": meta or {}})

    # --- Serial clusters (Crime-DNA) ---
    dna = j("crime-dna") or {}
    spatial = j("spatial") or {}
    for cid, c in dna.items():
        sig = " · ".join(s["value"] for s in c.get("signature", []))
        sp = spatial.get(cid, {})
        ns = sp.get("nextStrike")
        ross = sp.get("rossmo", {}).get("anchor")
        parts = [
            f"Serial cluster \"{c['label']}\" ({cid}) is a linked series of {c['memberCount']} FIRs "
            f"across {len(c['districts'])} districts ({', '.join(c['districts'])}), crime type {c.get('crimeType','')}. "
            f"Shared modus operandi: {sig}. Cohesion {round(c.get('confidence',0)*100)}%."
        ]
        if c.get("offender") and c.get("unsolvedCount"):
            parts.append(f"Arresting {c['offender']} — the shared hand — could clear {c['unsolvedCount']} unsolved "
                         f"cases in this series across {', '.join(c.get('unsolvedDistricts',[]))}.")
        cad = c.get("span", {}).get("cadenceDays")
        if cad:
            parts.append(f"Strike cadence about every {cad} days.")
        if ns:
            parts.append(f"Predicted next strike: {ns['district']}, {ns['window']}, {ns['timeWindow']}, "
                         f"{round(ns.get('confidence',0)*100)}% confidence.")
        if ross:
            parts.append(f"Rossmo geographic profile predicts an operating-base ZONE near {ross['lat']:.3f}, {ross['lng']:.3f} — a place, not a person.")
        add(f"cluster-{cid}", "cluster", c["label"], " ".join(parts),
            f"Linkage · {cid}", {"clusterId": cid, "districts": c["districts"], "offender": c.get("offender")})

    # --- Offender network: rings + kingpins + predicted links ---
    net = j("network-graph") or {}
    for ring in net.get("communities", []):
        add(f"ring-{ring['id']}", "ring", ring["label"],
            f"Organized-crime ring \"{ring['label']}\" has {ring['size']} members; its kingpin (most central "
            f"offender) is {ring['kingpin']}. Removing the kingpin fragments the ring — target the coordinator, "
            f"not just foot-soldiers. Detected via Louvain community detection + centrality on the co-offending network.",
            "Analytics · offender network", {"kingpin": ring["kingpin"], "size": ring["size"]})
    for p in net.get("predictedLinks", [])[:8]:
        add(f"predlink-{p['source']}-{p['target']}", "predlink", f"{p['sourceName']} ⇢ {p['targetName']}",
            f"Graph-ML (Adamic-Adar) predicts an EMERGING co-offending tie between {p['sourceName']} and "
            f"{p['targetName']} — they share associate(s) {', '.join(p.get('via',[]))} in the same ring but have no "
            f"direct FIR link yet. A pair to watch.", "Analytics · link prediction")
    kings = sorted([n for n in net.get("nodes", []) if n.get("kingpin")], key=lambda n: -n.get("centrality", 0))
    if kings:
        add("kingpins", "summary", "Crime kingpins",
            "The most influential offenders (network centrality): " +
            "; ".join(f"{k['name']} ({k.get('cases',0)} cases)" for k in kings[:6]) +
            ". These coordinators, if removed, fragment their rings.",
            "Analytics · offender network")

    # --- District analytics ---
    da = j("district-analytics") or {}
    for name, d in (da.get("districts") or {}).items():
        oc = d.get("outcome", {})
        top = ", ".join(f"{t['type']} ({t['pct']}%)" for t in d.get("topCrimes", [])[:3])
        add(f"district-{name}", "district", name,
            f"District {name}: {d.get('total',0)} FIRs on record, {d.get('heinous',0)} heinous. "
            f"Detection rate {oc.get('detectionPct','?')}%, undetected {oc.get('undetectedPct','?')}%. "
            f"Leading crime types: {top}.", f"Analytics · {name}", {"district": name})

    # --- Forecast hotspots ---
    fc = j("forecast") or {}
    for h in fc.get("hotspots", []):
        add(f"hotspot-{h['district']}-{h['crimeType']}", "hotspot", f"{h['district']} hotspot",
            f"{h['district']} is a 7-day forecast hotspot for {h['crimeType'].lower()} — risk {h['riskLevel']}, "
            f"momentum +{h.get('momentumPct',0)}%. Suggested patrol window {h['patrolWindow']}.",
            "Command Map · 7-day forecast", {"district": h["district"]})
    m = fc.get("metrics", {})
    if m:
        add("forecast-metrics", "validation", "Forecast validation",
            f"NETRA's hotspot forecasting is validated on 503,468 real City-of-Chicago crimes: a spatio-temporal "
            f"LSTM reaches 87% top-10 hotspot hit-rate (R² 0.95), beating gradient boosting on all metrics. On "
            f"Karnataka data, top-5 district hit-rate {round(m.get('hitRateTop5',0)*100)}%. Time-split, no leakage.",
            "docs/DECK_METRICS")

    # --- Cold cases ---
    cc = j("cold-cases") or {}
    st = cc.get("state", [])
    if st:
        add("coldcases-state", "coldcase", "Cases at risk of going cold",
            f"{len(st)} open cases are flagged state-wide as most likely to go undetected. Highest-risk: " +
            "; ".join(f"{r['crimeNo']} ({r['type']}, {r['district']}, {round(r['risk']*100)}% risk)" for r in st[:5]) +
            ". Intervene before they die — this is a prescriptive worklist, not a statistic.",
            "Analytics · cold-case worklist")
    for dname, rows in (cc.get("districts") or {}).items():
        if rows:
            add(f"coldcases-{dname}", "coldcase", f"Cold cases in {dname}",
                f"In {dname}, {len(rows)} open cases are predicted most likely to go undetected. Top: " +
                "; ".join(f"{r['crimeNo']} ({r['type']}, {round(r['risk']*100)}%)" for r in rows[:4]) + ".",
                f"Analytics · {dname}", {"district": dname})

    # --- Crime clock ---
    clk = j("crime-clock") or {}
    st_m = clk.get("state")
    if st_m:
        bd = bh = 0; mx = -1
        for wd in range(7):
            for h in range(24):
                if st_m[wd][h] > mx:
                    mx, bd, bh = st_m[wd][h], wd, h
        early = sum(sum(r[:6]) for r in st_m); tot = sum(sum(r) for r in st_m) or 1
        add("crimeclock-state", "clock", "When crime happens (state-wide)",
            f"State-wide, crime peaks on {DAYS[bd]} around {bh:02d}:00. The early hours (midnight–06:00) account "
            f"for {round(100*early/tot)}% of incidents — the window to concentrate patrols.", "Analytics · Crime Clock")

    # --- Risk model ---
    rs = j("risk-scores") or {}
    if rs.get("drivers"):
        drivers = ", ".join(d["factor"] for d in rs["drivers"] if d.get("importance", 0) > 0)[:200]
        add("risk-model", "validation", "Detection-risk model",
            f"NETRA's detection-risk model (gradient boosting, ROC-AUC {rs.get('metrics',{}).get('auc','?')}) predicts "
            f"which open cases will go undetected. Main drivers: {drivers}. Explainable and per-case.",
            "Analytics · detection risk")

    # --- Static facts: validation, ethics, platform ---
    add("validation-linkage", "validation", "Case-linkage blind test",
        "In a blind test, NETRA recovered 5 of 5 secret serial-crime patterns it was never shown, at 96% precision, "
        "hidden among 1,500 real distractor FIRs. The patterns were authored independently of the model.",
        "docs/DECK_METRICS")
    add("ethics", "ethics", "Ethics by design",
        "NETRA excludes caste, religion and occupation from every model AND never renders them. It predicts places "
        "and patterns, never a person's guilt. Every score is explainable; a human is always in the loop.", "Ethics")
    add("platform", "platform", "Platform & scale",
        "NETRA runs 100% on Zoho Catalyst (Web Client Hosting + Advanced I/O Function + Data Store), with 50,000 "
        "synthetic FIRs built on KSP's official FIR schema live in the Data Store. The Copilot's LLM is served "
        "sovereignly inside Catalyst — no data leaves the police cloud.", "Architecture")

    (PUB / "copilot-cards.json").write_text(json.dumps(cards, ensure_ascii=False))
    print(f"copilot-cards: {len(cards)} cards → {PUB/'copilot-cards.json'}")
    from collections import Counter
    print("  by type:", dict(Counter(c["type"] for c in cards)))


if __name__ == "__main__":
    main()

"""Build the Copilot's knowledge graph — a normalized entity/relation graph the Copilot
traverses for multi-hop relational answers (GraphRAG). Entities: offenders, clusters,
districts, rings. Relations: co-offends, leads, member-of, spans, based-near, predicted-tie.

Reads crime-dna.json + network-graph.json + spatial.json → writes copilot-kg.json
Run: python3 -m pipeline.build_kg
"""
import json
from pathlib import Path

PUB = Path("frontend/public")


def main():
    dna = json.loads((PUB / "crime-dna.json").read_text())
    net = json.loads((PUB / "network-graph.json").read_text())
    spatial = json.loads((PUB / "spatial.json").read_text()) if (PUB / "spatial.json").exists() else {}

    ents = {}
    rels = []

    def ent(eid, etype, name, **extra):
        if eid not in ents:
            ents[eid] = {"id": eid, "type": etype, "name": name, **extra}
        return eid

    def rel(src, r, dst, **extra):
        rels.append({"src": src, "rel": r, "dst": dst, **extra})

    # Offenders + rings from the network
    name_by_id = {}
    for n in net.get("nodes", []):
        eid = f"off:{n['id']}"
        name_by_id[n["id"]] = n["name"]
        ent(eid, "offender", n["name"], cases=n.get("cases", 0),
            kingpin=bool(n.get("kingpin")), centrality=round(n.get("centrality", 0), 3),
            community=n.get("community"))
    for c in net.get("communities", []):
        rid = f"ring:{c['id']}"
        ent(rid, "ring", c["label"], size=c["size"], kingpin=c["kingpin"])
    # member-of (offender→ring) by community id
    ring_by_comm = {c["id"]: f"ring:{c['id']}" for c in net.get("communities", [])}
    for n in net.get("nodes", []):
        rid = ring_by_comm.get(n.get("community"))
        if rid:
            rel(f"off:{n['id']}", "member_of", rid)
    # co-offending edges
    for e in net.get("edges", []):
        if f"off:{e['source']}" in ents and f"off:{e['target']}" in ents:
            rel(f"off:{e['source']}", "co_offends", f"off:{e['target']}", weight=e.get("weight", 1))
    for p in net.get("predictedLinks", []):
        rel(f"off:{p['source']}", "predicted_tie", f"off:{p['target']}", via=p.get("via", []))

    # Clusters + districts + lead offender + base
    for cid, c in dna.items():
        cl = ent(f"cluster:{cid}", "cluster", c["label"], crimeType=c.get("crimeType", ""),
                 memberCount=c["memberCount"], unsolvedCount=c.get("unsolvedCount", 0))
        for d in c.get("districts", []):
            did = ent(f"district:{d}", "district", d)
            rel(cl, "spans", did)
        if c.get("offender"):
            oid = ent(f"offname:{c['offender']}", "offender", c["offender"])
            rel(oid, "leads", cl)
        sp = spatial.get(cid, {})
        anc = sp.get("rossmo", {}).get("anchor")
        if anc:
            rel(cl, "based_near", f"geo:{anc['lat']:.2f},{anc['lng']:.2f}",
                lat=anc["lat"], lng=anc["lng"])

    kg = {"entities": list(ents.values()), "relations": rels}
    (PUB / "copilot-kg.json").write_text(json.dumps(kg, ensure_ascii=False))
    print(f"copilot-kg: {len(ents)} entities, {len(rels)} relations → {PUB/'copilot-kg.json'}")
    from collections import Counter
    print("  entities:", dict(Counter(e["type"] for e in ents.values())))
    print("  relations:", dict(Counter(r["rel"] for r in rels)))


if __name__ == "__main__":
    main()

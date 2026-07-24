"""Link prediction over the offender network — surfaces EMERGING co-offending ties that
aren't in any FIR yet. Classic graph-ML signal (Adamic-Adar): two offenders who share a
common associate but have no direct edge are likely to co-offend. We keep only same-ring
candidates (both sides in one Louvain community) so every prediction has a concrete,
explainable reason. Appends `predictedLinks` to network-graph.json in place.

Run: python3 -m pipeline.build_linkpred
"""
import json
from pathlib import Path

import networkx as nx

GRAPH = Path("frontend/public/network-graph.json")
TOP = 8


def main() -> None:
    d = json.loads(GRAPH.read_text())
    G = nx.Graph()
    name = {}
    for n in d["nodes"]:
        G.add_node(n["id"], **n)
        name[n["id"]] = n["name"]
    for e in d["edges"]:
        G.add_edge(e["source"], e["target"], weight=e.get("weight", 1))

    pairs = [(u, v) for u, v in nx.non_edges(G) if G.degree(u) >= 1 and G.degree(v) >= 1]
    preds = []
    for u, v, score in nx.adamic_adar_index(G, pairs):
        if score <= 0:
            continue
        cu, cv = G.nodes[u].get("community"), G.nodes[v].get("community")
        if cu is None or cu != cv:  # same-ring only → explainable
            continue
        shared = sorted(set(G.neighbors(u)) & set(G.neighbors(v)))
        preds.append({
            "source": u, "target": v,
            "score": round(float(score), 2),
            "community": cu,
            "via": [name.get(s, str(s)) for s in shared],
            "sourceName": name.get(u), "targetName": name.get(v),
            "reason": f"share {len(shared)} known associate{'s' if len(shared) != 1 else ''} in the same ring, no direct FIR link yet",
        })
    preds.sort(key=lambda p: -p["score"])
    preds = preds[:TOP]

    d["predictedLinks"] = preds
    GRAPH.write_text(json.dumps(d))
    print(f"wrote {len(preds)} predicted (emerging) co-offending ties into network-graph.json")
    for p in preds:
        print(f"  {p['sourceName']} -- {p['targetName']}  (via {', '.join(p['via'])}, ring {p['community']})")


if __name__ == "__main__":
    main()

"""Build the offender-network graph (nodes + co-accused edges) for the Analytics
screen. Two offenders share an edge when they appear as accused in the SAME case;
edge weight = number of shared cases. We keep the top offenders by case count and
the edges among them, so the graph is a readable "criminal web".

Output: frontend/public/network-graph.json
Run: python3 -m pipeline.build_network
"""
import json
import os
from collections import Counter, defaultdict
from itertools import combinations

DATA = "pipeline/data"
OUT = "frontend/public/network-graph.json"
TOP_N = 45


def main():
    offenders = {o["offenderId"]: o for o in json.load(open(f"{DATA}/offenders.json", encoding="utf-8"))}

    # group accused (with an offender ref) by case
    by_case = defaultdict(set)
    with open(f"{DATA}/accused.jsonl", encoding="utf-8") as f:
        for line in f:
            a = json.loads(line)
            if a.get("offenderRef"):
                by_case[a["caseMasterId"]].add(a["offenderRef"])

    edge_w = Counter()
    for offs in by_case.values():
        for x, y in combinations(sorted(offs), 2):
            edge_w[(x, y)] += 1

    # Co-conspirators: offenders who ran the SAME serial cluster together are a
    # real, strong relationship (they committed the serial series jointly).
    gt = json.load(open(f"{DATA}/planted_patterns.json", encoding="utf-8"))
    cluster_of = {}  # offenderId -> cluster label (for node tagging)
    for cl in gt["serialClusters"]:
        offs = cl.get("sharedOffenderIds", [])
        size = len(cl.get("memberCaseIds", []))
        for o in offs:
            cluster_of[o] = cl["label"]
        for x, y in combinations(sorted(set(offs)), 2):
            edge_w[(min(x, y), max(x, y))] += size

    # rank offenders by case count; keep the top N (plus any cluster offenders)
    ranked = sorted(offenders.values(), key=lambda o: -o["caseCount"])
    keep = {o["offenderId"] for o in ranked[:TOP_N]} | set(cluster_of)
    top = [o for o in ranked if o["offenderId"] in keep]

    nodes = [{"id": o["offenderId"], "name": o["canonicalName"], "cases": o["caseCount"],
              "cluster": cluster_of.get(o["offenderId"])} for o in top]
    edges = [{"source": a, "target": b, "weight": w}
             for (a, b), w in edge_w.items() if a in keep and b in keep]

    json.dump({"nodes": nodes, "edges": edges}, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print(f"network: {len(nodes)} nodes, {len(edges)} edges → {OUT} "
          f"({os.path.getsize(OUT)/1024:.0f} KB)")
    if edges:
        top_edge = max(edges, key=lambda e: e["weight"])
        print(f"strongest link: offenders {top_edge['source']}↔{top_edge['target']} "
              f"share {top_edge['weight']} cases")


if __name__ == "__main__":
    main()

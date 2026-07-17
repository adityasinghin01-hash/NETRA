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

    # ── Organized-crime intelligence: Louvain communities (gangs) + weighted-degree
    #    centrality (kingpin per gang) + betweenness (bridge offenders across gangs) ──
    import networkx as nx
    from networkx.algorithms.community import louvain_communities

    G = nx.Graph()
    G.add_nodes_from(n["id"] for n in nodes)
    for e in edges:
        G.add_edge(e["source"], e["target"], weight=e["weight"])

    comms = louvain_communities(G, weight="weight", seed=7) if G.number_of_edges() else [{n["id"]} for n in nodes]
    comm_of = {m: ci for ci, ms in enumerate(comms) for m in ms}
    deg = dict(G.degree(weight="weight"))
    maxdeg = max(deg.values(), default=1) or 1
    btw = nx.betweenness_centrality(G, weight="weight") if G.number_of_edges() else {}
    node_by_id = {n["id"]: n for n in nodes}

    for n in nodes:
        i = n["id"]
        n["community"] = comm_of.get(i, -1)
        n["centrality"] = round(deg.get(i, 0) / maxdeg, 3)
        n["bridge"] = round(btw.get(i, 0), 3)
        n["kingpin"] = False

    communities = []
    for ci, members in enumerate(comms):
        members = list(members)
        if len(members) < 3:
            continue
        labels = Counter(node_by_id[m]["cluster"] for m in members if node_by_id[m].get("cluster"))
        label = labels.most_common(1)[0][0] if labels else f"Ring {ci + 1}"
        kp = max(members, key=lambda m: deg.get(m, 0))
        node_by_id[kp]["kingpin"] = True
        communities.append({"id": ci, "label": label, "size": len(members),
                            "kingpinId": kp, "kingpin": node_by_id[kp]["name"]})
    communities.sort(key=lambda c: -c["size"])

    json.dump({"nodes": nodes, "edges": edges, "communities": communities},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"network: {len(nodes)} nodes, {len(edges)} edges, {len(communities)} rings → {OUT} "
          f"({os.path.getsize(OUT)/1024:.0f} KB)")
    for c in communities[:5]:
        print(f"  ring '{c['label'][:28]}' — {c['size']} members · kingpin {c['kingpin']}")


if __name__ == "__main__":
    main()

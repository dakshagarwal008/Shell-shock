import json
from collections import defaultdict
from pathlib import Path
import networkx as nx


def export_pipeline_outputs(
    clusters: list[dict],
    G: nx.MultiDiGraph,
    metrics: dict | None = None,
    out_dir: str | Path = "web/public/data",
) -> None:
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    # 1. Export clusters.json (strip internal _evidences key)
    clusters_payload = [
        {
            "id": c["id"],
            "rank": int(c["rank"]),
            "risk_score": int(c["risk_score"]),
            "typologies": list(c["typologies"]),
            "accounts": list(c["accounts"]),
            "total_amount": float(c["total_amount"]),
            "time_span_hours": float(c["time_span_hours"]),
            "summary": str(c["summary"]),
            "risk_factors": list(c["risk_factors"]),
            "transaction_ids": list(c["transaction_ids"]),
        }
        for c in clusters
    ]
    with open(out_path / "clusters.json", "w", encoding="utf-8") as f:
        json.dump(clusters_payload, f, indent=2)

    # 2. Export graph.json (induced subgraph of flagged clusters for crisp UI rendering)
    node_clusters: dict[str, list[str]] = defaultdict(list)
    node_max_risk: dict[str, float] = defaultdict(float)
    tx_to_cluster: dict[str, str] = {}

    for c in clusters:
        cid = c["id"]
        risk_norm = round(c["risk_score"] / 100.0, 2)
        for acc in c["accounts"]:
            if cid not in node_clusters[acc]:
                node_clusters[acc].append(cid)
            if risk_norm > node_max_risk[acc]:
                node_max_risk[acc] = risk_norm
        for tid in c["transaction_ids"]:
            if tid not in tx_to_cluster:
                tx_to_cluster[tid] = cid

    nodes_payload = [
        {
            "id": acc,
            "label": acc,
            "cluster_ids": node_clusters[acc],
            "risk": float(node_max_risk[acc]),
        }
        for acc in sorted(node_clusters.keys())
    ]

    edges_payload = []
    for u, v, _, data in G.edges(keys=True, data=True):
        tid = data["id"]
        if tid in tx_to_cluster:
            edges_payload.append(
                {
                    "id": tid,
                    "source": u,
                    "target": v,
                    "amount": float(data["amount"]),
                    "timestamp": str(data["timestamp"]),
                    "cluster_id": tx_to_cluster[tid],
                }
            )
    edges_payload.sort(key=lambda e: e["timestamp"])

    with open(out_path / "graph.json", "w", encoding="utf-8") as f:
        json.dump({"nodes": nodes_payload, "edges": edges_payload}, f, indent=2)

    # 2b. Additive historical feed for the isolated Live Demo Mode. The three
    # existing JSON exports and their schemas remain unchanged.
    transactions_payload = [
        {
            "id": str(data["id"]),
            "source": str(u),
            "target": str(v),
            "amount": float(data["amount"]),
            "timestamp": str(data["timestamp"]),
        }
        for u, v, _, data in G.edges(keys=True, data=True)
    ]
    transactions_payload.sort(key=lambda transaction: (transaction["timestamp"], transaction["id"]))
    with open(out_path / "transactions.json", "w", encoding="utf-8") as f:
        json.dump(transactions_payload, f, indent=2)

    # 3. Export metrics.json if provided
    if metrics is not None:
        with open(out_path / "metrics.json", "w", encoding="utf-8") as f:
            json.dump(metrics, f, indent=2)

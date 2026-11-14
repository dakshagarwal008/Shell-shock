import networkx as nx


def _build_edge_lookup(G: nx.MultiDiGraph) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for u, v, _, data in G.edges(keys=True, data=True):
        lookup[data["id"]] = {"source": u, "target": v, **data}
    return lookup


def score_and_rank_clusters(
    merged_clusters: list[dict],
    G: nx.MultiDiGraph,
) -> list[dict]:
    edge_lookup = _build_edge_lookup(G)
    scored: list[dict] = []

    for cluster in merged_clusters:
        tx_ids = cluster["transactions"]
        accounts = cluster["accounts"]
        typologies = cluster["typologies"]
        evidences = cluster["evidences"]

        tx_objs = [edge_lookup[tid] for tid in tx_ids if tid in edge_lookup]
        if not tx_objs:
            continue

        total_amount = float(sum(e["amount"] for e in tx_objs))
        t_min = min(e["ts_epoch"] for e in tx_objs)
        t_max = max(e["ts_epoch"] for e in tx_objs)
        time_span_hours = round(max(0.1, (t_max - t_min) / 3600.0), 1)

        strengths = [float(ev.get("strength", 0.7)) for ev in evidences]
        pattern_strength = round(min(1.0, max(strengths) if strengths else 0.7), 3)
        velocity_speed = round(max(0.05, min(1.0, 1.0 - (time_span_hours / 72.0))), 3)
        total_value = round(min(1.0, total_amount / 900000.0), 3)
        network_size = round(min(1.0, len(accounts) / 14.0), 3)
        multi_typology = 1.0 if len(typologies) >= 2 else 0.5

        risk_factors = [
            {"name": "pattern_strength", "weight": 0.35, "value": float(pattern_strength)},
            {"name": "velocity_speed", "weight": 0.25, "value": float(velocity_speed)},
            {"name": "total_value", "weight": 0.15, "value": float(total_value)},
            {"name": "network_size", "weight": 0.15, "value": float(network_size)},
            {"name": "multi_typology", "weight": 0.10, "value": float(multi_typology)},
        ]

        raw_score = sum(f["weight"] * f["value"] for f in risk_factors) * 100.0
        risk_score = int(max(1, min(99, round(raw_score))))

        scored.append(
            {
                "risk_score": risk_score,
                "typologies": list(typologies),
                "accounts": list(accounts),
                "total_amount": round(total_amount, 2),
                "time_span_hours": float(time_span_hours),
                "risk_factors": risk_factors,
                "transaction_ids": list(tx_ids),
                "_evidences": evidences,
            }
        )

    scored.sort(key=lambda c: (-c["risk_score"], -c["total_amount"]))

    for idx, cluster in enumerate(scored, start=1):
        cluster["rank"] = idx
        cluster["id"] = f"C-{idx:03d}"

    return scored
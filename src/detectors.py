from collections import defaultdict
import networkx as nx
import numpy as np


def _edge_list_for_node_out(G: nx.MultiDiGraph, node: str) -> list[dict]:
    edges = [
        {"source": u, "target": v, **data}
        for u, v, _, data in G.out_edges(node, keys=True, data=True)
    ]
    edges.sort(key=lambda e: e["ts_epoch"])
    return edges


def _edge_list_for_node_in(G: nx.MultiDiGraph, node: str) -> list[dict]:
    edges = [
        {"source": u, "target": v, **data}
        for u, v, _, data in G.in_edges(node, keys=True, data=True)
    ]
    edges.sort(key=lambda e: e["ts_epoch"])
    return edges


def _is_recurring_payroll(edges: list[dict], window_edges: list[dict]) -> bool:
    """Detect regular recurring payouts to the same recipients at nearly identical amounts."""
    window_ids = {e["id"] for e in window_edges}
    window_map = {e["target"]: e["amount"] for e in window_edges}
    other_edges = [e for e in edges if e["id"] not in window_ids]
    if not other_edges:
        return False

    matched_repeats = 0
    for e in other_edges:
        tgt = e["target"]
        if tgt in window_map:
            ref_amt = window_map[tgt]
            if ref_amt > 0 and abs(e["amount"] - ref_amt) / ref_amt <= 0.05:
                # Separated by at least 5 days (recurring cycle, not same burst)
                if any(abs(e["ts_epoch"] - we["ts_epoch"]) >= 5 * 86400 for we in window_edges if we["target"] == tgt):
                    matched_repeats += 1

    return matched_repeats >= max(3, int(0.5 * len(window_map)))


def detect_fan_out(
    G: nx.MultiDiGraph,
    window_hours: float = 24.0,
    min_targets: int = 5,
    min_total_amount: float = 150000.0,
) -> list[dict]:
    window_sec = window_hours * 3600.0
    candidates: list[dict] = []

    for node in sorted(G.nodes()):
        edges = _edge_list_for_node_out(G, node)
        if len(edges) < min_targets:
            continue

        best_window: list[dict] | None = None
        left = 0
        for right in range(len(edges)):
            while edges[right]["ts_epoch"] - edges[left]["ts_epoch"] > window_sec:
                left += 1
            cur = edges[left : right + 1]
            distinct_targets = {e["target"] for e in cur}
            total_amt = sum(e["amount"] for e in cur)
            if len(distinct_targets) >= min_targets and total_amt >= min_total_amount:
                if best_window is None or len(distinct_targets) > len({e["target"] for e in best_window}):
                    best_window = list(cur)

        if best_window is None:
            continue

        amounts = [e["amount"] for e in best_window]
        if float(np.median(amounts)) < 15000.0:
            continue
        if _is_recurring_payroll(edges, best_window):
            continue

        span_hours = max(
            0.1, (best_window[-1]["ts_epoch"] - best_window[0]["ts_epoch"]) / 3600.0
        )
        accounts = sorted({node} | {e["target"] for e in best_window})
        tx_ids = sorted({e["id"] for e in best_window})
        total_amt = float(sum(amounts))
        cv = float(np.std(amounts) / (np.mean(amounts) + 1e-9))

        candidates.append(
            {
                "typology": "fan_out_dispersion",
                "accounts": accounts,
                "transactions": tx_ids,
                "evidence": {
                    "hub": node,
                    "counterparties": len(accounts) - 1,
                    "total_amount": round(total_amt, 2),
                    "time_span_hours": round(span_hours, 2),
                    "amount_cv": round(cv, 3),
                    "strength": min(1.0, (len(accounts) - 1) / 10.0),
                },
            }
        )

    return candidates


def detect_fan_in(
    G: nx.MultiDiGraph,
    window_hours: float = 24.0,
    min_sources: int = 5,
    min_total_amount: float = 150000.0,
) -> list[dict]:
    window_sec = window_hours * 3600.0
    candidates: list[dict] = []

    for node in sorted(G.nodes()):
        in_edges = _edge_list_for_node_in(G, node)
        if len(in_edges) < min_sources:
            continue

        best_window: list[dict] | None = None
        left = 0
        for right in range(len(in_edges)):
            while in_edges[right]["ts_epoch"] - in_edges[left]["ts_epoch"] > window_sec:
                left += 1
            cur = in_edges[left : right + 1]
            distinct_sources = {e["source"] for e in cur}
            total_amt = sum(e["amount"] for e in cur)
            if len(distinct_sources) >= min_sources and total_amt >= min_total_amount:
                if best_window is None or len(distinct_sources) > len({e["source"] for e in best_window}):
                    best_window = list(cur)

        if best_window is None:
            continue

        amounts = [e["amount"] for e in best_window]
        median_amt = float(np.median(amounts))
        total_lifetime_in = sum(e["amount"] for e in in_edges)
        window_amt = sum(amounts)
        burst_concentration = window_amt / (total_lifetime_in + 1e-9)

        # Check rapid consolidated outflow within 48h after burst start
        out_edges = _edge_list_for_node_out(G, node)
        t_start = best_window[0]["ts_epoch"]
        t_end = best_window[-1]["ts_epoch"] + 48 * 3600.0
        out_sum = sum(e["amount"] for e in out_edges if t_start <= e["ts_epoch"] <= t_end)
        rapid_outflow_ratio = out_sum / (window_amt + 1e-9)

        # Filter out steady low-ticket retail merchants
        is_suspicious_collector = (
            (median_amt >= 15000.0 and burst_concentration >= 0.55)
            or (rapid_outflow_ratio >= 0.60 and median_amt >= 10000.0)
        )
        if not is_suspicious_collector:
            continue

        span_hours = max(
            0.1, (best_window[-1]["ts_epoch"] - best_window[0]["ts_epoch"]) / 3600.0
        )
        accounts = sorted({node} | {e["source"] for e in best_window})
        tx_ids = sorted({e["id"] for e in best_window})

        candidates.append(
            {
                "typology": "fan_in_aggregation",
                "accounts": accounts,
                "transactions": tx_ids,
                "evidence": {
                    "hub": node,
                    "counterparties": len(accounts) - 1,
                    "total_amount": round(float(window_amt), 2),
                    "time_span_hours": round(span_hours, 2),
                    "burst_concentration": round(float(burst_concentration), 3),
                    "strength": min(1.0, (len(accounts) - 1) / 10.0),
                },
            }
        )

    return candidates


def detect_cycles(
    G: nx.MultiDiGraph,
    max_len: int = 6,
    max_cycle_hours: float = 72.0,
    min_amount: float = 20000.0,
    max_hop_drop: float = 0.15,
    max_hop_gain: float = 0.05,
) -> list[dict]:
    max_sec = max_cycle_hours * 3600.0
    out_adj: dict[str, list[dict]] = defaultdict(list)
    for u, v, _, data in G.out_edges(keys=True, data=True):
        if u != v and data["amount"] >= min_amount:
            out_adj[u].append({"source": u, "target": v, **data})
    for u in out_adj:
        out_adj[u].sort(key=lambda e: e["ts_epoch"])

    seen_tx_sets: set[tuple[str, ...]] = set()
    candidates: list[dict] = []

    for start in sorted(out_adj.keys()):
        for first_edge in out_adj[start]:
            v1 = first_edge["target"]
            if v1 < start:
                continue

            # DFS stack entries: (curr_node, path_nodes, path_edges)
            stack: list[tuple[str, list[str], list[dict]]] = [
                (v1, [start, v1], [first_edge])
            ]
            t0 = first_edge["ts_epoch"]
            amt0 = first_edge["amount"]

            while stack:
                curr, p_nodes, p_edges = stack.pop()
                last_edge = p_edges[-1]
                t_prev = last_edge["ts_epoch"]
                amt_prev = last_edge["amount"]

                for nxt_edge in out_adj.get(curr, []):
                    dt_hop = nxt_edge["ts_epoch"] - t_prev
                    dt_total = nxt_edge["ts_epoch"] - t0
                    if dt_hop <= 0 or dt_total > max_sec:
                        continue

                    amt_nxt = nxt_edge["amount"]
                    if not (
                        (1.0 - max_hop_drop) * amt_prev <= amt_nxt <= (1.0 + max_hop_gain) * amt_prev
                        and (1.0 - max_hop_drop * 1.5) * amt0 <= amt_nxt <= (1.0 + max_hop_gain) * amt0
                    ):
                        continue

                    nxt_node = nxt_edge["target"]
                    if nxt_node == start and len(p_nodes) >= 3:
                        cyc_edges = p_edges + [nxt_edge]
                        tx_key = tuple(sorted(e["id"] for e in cyc_edges))
                        if tx_key not in seen_tx_sets:
                            seen_tx_sets.add(tx_key)
                            amts = [e["amount"] for e in cyc_edges]
                            span_hours = max(0.1, dt_total / 3600.0)
                            similarity = min(amts) / (max(amts) + 1e-9)
                            candidates.append(
                                {
                                    "typology": "cyclic_round_tripping",
                                    "accounts": sorted(set(p_nodes)),
                                    "transactions": list(tx_key),
                                    "evidence": {
                                        "cycle_nodes": p_nodes + [start],
                                        "cycle_length": len(p_nodes),
                                        "total_amount": round(float(sum(amts)), 2),
                                        "time_span_hours": round(float(span_hours), 2),
                                        "amount_similarity": round(float(similarity), 3),
                                        "strength": round(float(similarity), 3),
                                    },
                                }
                            )
                    elif (
                        nxt_node > start
                        and nxt_node not in p_nodes
                        and len(p_nodes) < max_len
                    ):
                        stack.append((nxt_node, p_nodes + [nxt_node], p_edges + [nxt_edge]))

    return candidates


def detect_pass_through(
    G: nx.MultiDiGraph,
    max_hop_hours: float = 6.0,
    min_amount: float = 20000.0,
    min_hops: int = 2,
    max_drop: float = 0.12,
    max_gain: float = 0.03,
) -> list[dict]:
    max_hop_sec = max_hop_hours * 3600.0

    # Build 1-to-1 relay links between incoming and outgoing edges at each node
    next_link: dict[str, str] = {}
    prev_link: dict[str, str] = {}
    edge_by_id: dict[str, dict] = {}

    for u, v, _, data in G.edges(keys=True, data=True):
        edge_by_id[data["id"]] = {"source": u, "target": v, **data}

    for node in sorted(G.nodes()):
        in_edges = [e for e in _edge_list_for_node_in(G, node) if e["amount"] >= min_amount]
        out_edges = [e for e in _edge_list_for_node_out(G, node) if e["amount"] >= min_amount]
        if not in_edges or not out_edges:
            continue

        used_out: set[str] = set()
        for e_in in in_edges:
            best_out = None
            best_score = float("inf")
            for e_out in out_edges:
                if e_out["id"] in used_out or e_out["target"] == e_in["source"]:
                    continue
                dt = e_out["ts_epoch"] - e_in["ts_epoch"]
                if dt <= 0 or dt > max_hop_sec:
                    continue
                amt_in, amt_out = e_in["amount"], e_out["amount"]
                if not ((1.0 - max_drop) * amt_in <= amt_out <= (1.0 + max_gain) * amt_in):
                    continue
                rel_diff = abs(amt_out - amt_in) / (amt_in + 1e-9)
                score = rel_diff + (dt / max_hop_sec) * 0.25
                if score < best_score:
                    best_score = score
                    best_out = e_out

            if best_out is not None:
                next_link[e_in["id"]] = best_out["id"]
                prev_link[best_out["id"]] = e_in["id"]
                used_out.add(best_out["id"])

    # Extract maximal open chains
    candidates: list[dict] = []
    visited: set[str] = set()
    heads = [eid for eid in sorted(next_link.keys()) if eid not in prev_link]

    for head in heads:
        if head in visited:
            continue
        chain_ids = [head]
        visited.add(head)
        curr = head
        while curr in next_link and next_link[curr] not in visited:
            curr = next_link[curr]
            chain_ids.append(curr)
            visited.add(curr)

        if len(chain_ids) < min_hops:
            continue

        chain_edges = [edge_by_id[eid] for eid in chain_ids]
        first_src = chain_edges[0]["source"]
        last_tgt = chain_edges[-1]["target"]
        if first_src == last_tgt:
            # Closed loop belongs to cyclic_round_tripping
            continue

        acc_seq = [first_src] + [e["target"] for e in chain_edges]
        if len(set(acc_seq)) < 3:
            continue

        amts = [e["amount"] for e in chain_edges]
        span_hours = max(0.05, (chain_edges[-1]["ts_epoch"] - chain_edges[0]["ts_epoch"]) / 3600.0)
        avg_hop_hours = span_hours / max(1, len(chain_edges) - 1)
        retention = amts[-1] / (amts[0] + 1e-9)

        candidates.append(
            {
                "typology": "rapid_pass_through",
                "accounts": sorted(set(acc_seq)),
                "transactions": sorted(chain_ids),
                "evidence": {
                    "chain_accounts": acc_seq,
                    "hops": len(chain_edges),
                    "total_amount": round(float(sum(amts)), 2),
                    "time_span_hours": round(float(span_hours), 2),
                    "avg_hop_hours": round(float(avg_hop_hours), 2),
                    "amount_retention": round(float(retention), 3),
                    "strength": round(min(1.0, 0.5 + 0.15 * len(chain_edges)), 3),
                },
            }
        )

    return candidates


def merge_candidates(candidates: list[dict]) -> list[dict]:
    if not candidates:
        return []

    C = nx.Graph()
    for i in range(len(candidates)):
        C.add_node(i)

    acc_to_cands: dict[str, list[int]] = defaultdict(list)
    tx_to_cands: dict[str, list[int]] = defaultdict(list)

    for idx, cand in enumerate(candidates):
        for acc in cand["accounts"]:
            acc_to_cands[acc].append(idx)
        for tid in cand["transactions"]:
            tx_to_cands[tid].append(idx)

    for groups in list(acc_to_cands.values()) + list(tx_to_cands.values()):
        if len(groups) > 1:
            base = groups[0]
            for other in groups[1:]:
                C.add_edge(base, other)

    merged: list[dict] = []
    for comp in nx.connected_components(C):
        comp_cands = [candidates[i] for i in sorted(comp)]
        typologies = sorted({c["typology"] for c in comp_cands})
        accounts = sorted({a for c in comp_cands for a in c["accounts"]})
        tx_ids = sorted({t for c in comp_cands for t in c["transactions"]})
        evidences = [{"typology": c["typology"], **c["evidence"]} for c in comp_cands]

        merged.append(
            {
                "typologies": typologies,
                "accounts": accounts,
                "transactions": tx_ids,
                "evidences": evidences,
            }
        )

    return merged


def run_all_detectors(G: nx.MultiDiGraph) -> list[dict]:
    raw = (
        detect_fan_out(G)
        + detect_fan_in(G)
        + detect_cycles(G)
        + detect_pass_through(G)
    )
    return merge_candidates(raw)
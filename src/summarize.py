def _fmt_inr(amount: float) -> str:
    if amount >= 100000:
        return f"Rs {amount / 100000:.2f}L"
    if amount >= 1000:
        return f"Rs {amount / 1000:.1f}K"
    return f"Rs {amount:,.0f}"


def summarize_cluster(cluster: dict) -> str:
    evidences = cluster.get("_evidences", [])
    parts: list[str] = []

    for ev in evidences:
        typ = ev.get("typology")
        amt_str = _fmt_inr(float(ev.get("total_amount", cluster["total_amount"])))
        span = ev.get("time_span_hours", cluster["time_span_hours"])

        if typ == "fan_out_dispersion":
            hub = ev.get("hub", "source")
            cnt = ev.get("counterparties", 0)
            parts.append(
                f"{amt_str} dispersed from {hub} across {cnt} recipient accounts within {span:.1f} hours"
            )
        elif typ == "fan_in_aggregation":
            hub = ev.get("hub", "collector")
            cnt = ev.get("counterparties", 0)
            conc = int(round(float(ev.get("burst_concentration", 0.0)) * 100))
            parts.append(
                f"{amt_str} aggregated from {cnt} sender accounts into {hub} within {span:.1f} hours ({conc}% burst concentration)"
            )
        elif typ == "cyclic_round_tripping":
            nodes = ev.get("cycle_nodes", cluster["accounts"])
            trail = " -> ".join(nodes)
            sim = int(round(float(ev.get("amount_similarity", 0.0)) * 100))
            parts.append(
                f"{amt_str} moved in a {ev.get('cycle_length', len(nodes)-1)}-account cycle ({trail}) within {span:.1f} hours with {sim}% amount consistency"
            )
        elif typ == "rapid_pass_through":
            chain = ev.get("chain_accounts", cluster["accounts"])
            if len(chain) > 4:
                trail = f"{chain[0]} -> ... -> {chain[-1]}"
            else:
                trail = " -> ".join(chain)
            hops = ev.get("hops", len(chain) - 1)
            ret = int(round(float(ev.get("amount_retention", 0.0)) * 100))
            parts.append(
                f"{amt_str} relayed across a {hops}-hop mule chain ({trail}) in {span:.1f} hours ({ret}% amount retention)"
            )

    if not parts:
        body = (
            f"{_fmt_inr(cluster['total_amount'])} moved across {len(cluster['accounts'])} "
            f"accounts within {cluster['time_span_hours']:.1f} hours"
        )
    else:
        body = "; ".join(parts)

    typ_labels = ", ".join(t.replace("_", " ") for t in cluster["typologies"])
    return f"{body}. Typologies: {typ_labels}."


def attach_summaries(clusters: list[dict]) -> list[dict]:
    for c in clusters:
        c["summary"] = summarize_cluster(c)
    return clusters
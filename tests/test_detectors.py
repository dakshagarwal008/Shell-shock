import pandas as pd
from src.graph_build import build_transaction_graph
from src.detectors import (
    detect_fan_out,
    detect_fan_in,
    detect_cycles,
    detect_pass_through,
    merge_candidates,
)


def _df_to_graph(rows: list[tuple[str, str, str, float, str]]):
    df = pd.DataFrame(rows, columns=["id", "source", "target", "amount", "timestamp"])
    df["timestamp_dt"] = pd.to_datetime(df["timestamp"])
    df["ts_epoch"] = (df["timestamp_dt"] - pd.Timestamp("1970-01-01")).dt.total_seconds()
    return build_transaction_graph(df)


def test_fan_out_and_payroll_suppression():
    # Suspicious burst fan-out from S1
    rows = [
        (f"T{i}", "S1", f"M{i}", 60000.0, f"2026-03-02T10:{i:02d}:00")
        for i in range(1, 7)
    ]
    # Legitimate biweekly payroll from P1 (same recipients & amounts 14 days apart)
    for i in range(1, 7):
        rows.append((f"TP1_{i}", "P1", f"E{i}", 45000.0, f"2026-03-01T09:{i:02d}:00"))
        rows.append((f"TP2_{i}", "P1", f"E{i}", 45000.0, f"2026-03-15T09:{i:02d}:00"))

    G = _df_to_graph(rows)
    res = detect_fan_out(G)
    hubs = [c["evidence"]["hub"] for c in res]
    assert "S1" in hubs
    assert "P1" not in hubs


def test_fan_in_and_merchant_suppression():
    # Suspicious collector C1
    rows = [
        (f"T{i}", f"S{i}", "C1", 55000.0, f"2026-03-04T11:{i:02d}:00")
        for i in range(1, 7)
    ]
    # Busy merchant M1 receiving tiny retail payments (< 15k)
    for i in range(1, 10):
        rows.append((f"TM{i}", f"CUST{i}", "M1", 850.0, f"2026-03-04T12:{i:02d}:00"))

    G = _df_to_graph(rows)
    res = detect_fan_in(G)
    hubs = [c["evidence"]["hub"] for c in res]
    assert "C1" in hubs
    assert "M1" not in hubs


def test_temporal_cycles():
    # Valid monotonic cycle A -> B -> C -> A
    rows = [
        ("T1", "A", "B", 100000.0, "2026-03-02T10:00:00"),
        ("T2", "B", "C", 98000.0, "2026-03-02T18:00:00"),
        ("T3", "C", "A", 96000.0, "2026-03-03T04:00:00"),
        # Non-monotonic cycle X -> Y -> Z -> X (Z->X happened BEFORE Y->Z)
        ("T4", "X", "Y", 100000.0, "2026-03-05T10:00:00"),
        ("T5", "Y", "Z", 98000.0, "2026-03-05T20:00:00"),
        ("T6", "Z", "X", 96000.0, "2026-03-05T14:00:00"),
    ]
    G = _df_to_graph(rows)
    res = detect_cycles(G)
    assert len(res) == 1
    assert res[0]["accounts"] == ["A", "B", "C"]


def test_pass_through_chain():
    # Rapid 4-account chain A -> B -> C -> D (20 min per hop)
    rows = [
        ("T1", "A", "B", 90000.0, "2026-03-06T10:00:00"),
        ("T2", "B", "C", 88500.0, "2026-03-06T10:20:00"),
        ("T3", "C", "D", 87000.0, "2026-03-06T10:40:00"),
        # Slow legitimate chain P -> Q -> R (20h gap, should not trigger rapid pass-through)
        ("T4", "P", "Q", 90000.0, "2026-03-07T10:00:00"),
        ("T5", "Q", "R", 88500.0, "2026-03-08T06:00:00"),
    ]
    G = _df_to_graph(rows)
    res = detect_pass_through(G)
    assert len(res) == 1
    assert res[0]["accounts"] == ["A", "B", "C", "D"]


def test_merge_candidates():
    cands = [
        {"typology": "fan_out_dispersion", "accounts": ["A1", "A2", "A3"], "transactions": ["T1", "T2"], "evidence": {}},
        {"typology": "rapid_pass_through", "accounts": ["A3", "A4", "A5"], "transactions": ["T3", "T4"], "evidence": {}},
        {"typology": "cyclic_round_tripping", "accounts": ["B1", "B2", "B3"], "transactions": ["T9", "T10", "T11"], "evidence": {}},
    ]
    merged = merge_candidates(cands)
    assert len(merged) == 2
    assert merged[0]["typologies"] == ["fan_out_dispersion", "rapid_pass_through"]
    assert merged[0]["accounts"] == ["A1", "A2", "A3", "A4", "A5"]
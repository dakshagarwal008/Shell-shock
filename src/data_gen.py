import json
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
import pandas as pd


def generate_dataset(
    output_dir: str | Path = "sample_data",
    seed: int = 42,
    n_background_accounts: int = 360,
    n_background_tx: int = 2450,
) -> tuple[pd.DataFrame, list[dict]]:
    rng = np.random.default_rng(seed)
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    base_time = datetime(2026, 3, 1, 8, 0, 0)
    span_seconds = 21 * 24 * 3600  # 3 weeks

    tx_rows: list[dict] = []
    ground_truth: list[dict] = []
    tx_counter = 1

    def add_tx(source: str, target: str, amount: float, ts: datetime) -> str:
        nonlocal tx_counter
        tid = f"T{tx_counter:04d}"
        tx_counter += 1
        tx_rows.append(
            {
                "id": tid,
                "source": source,
                "target": target,
                "amount": round(float(amount), 2),
                "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S"),
            }
        )
        return tid

    bg_accounts = [f"A{i:03d}" for i in range(1, n_background_accounts + 1)]

    # 1. Normal background peer-to-peer & small business traffic
    for _ in range(n_background_tx):
        src, tgt = rng.choice(bg_accounts, size=2, replace=False)
        amt = float(np.round(rng.lognormal(mean=8.4, sigma=0.85), -1))
        amt = float(np.clip(amt, 350.0, 48000.0))
        ts = base_time + timedelta(seconds=int(rng.integers(0, span_seconds)))
        add_tx(str(src), str(tgt), amt, ts)

    # 2. Legitimate high-value commercial/property invoices (traps simple amount thresholds)
    high_val_pairs = rng.choice(bg_accounts, size=(12, 2), replace=False)
    for src, tgt in high_val_pairs:
        amt = float(rng.integers(125000, 340000))
        ts = base_time + timedelta(seconds=int(rng.integers(0, span_seconds)))
        add_tx(str(src), str(tgt), amt, ts)

    # 3. Tricky legitimate lookalike A: Regular Biweekly Payroll (high fan-out)
    # Pays the exact same 32 employees identical salaries on Day 2 and Day 16
    payroll_acc = "A361"
    employees = [f"A{i:03d}" for i in range(362, 394)]
    salaries = {emp: float(rng.integers(32, 86) * 1000) for emp in employees}
    for payday_offset in (1, 15):
        pay_base = base_time + timedelta(days=payday_offset, hours=2)
        for idx, emp in enumerate(employees):
            ts = pay_base + timedelta(minutes=int(idx * 2))
            add_tx(payroll_acc, emp, salaries[emp], ts)

    # 4. Tricky legitimate lookalike B: 2 Busy Retail Merchants (high fan-in)
    # Receive many small unrelated retail payments steadily across 3 weeks, no rapid aggregation dump
    merchants = ["A394", "A395"]
    for m_acc in merchants:
        n_sales = 140
        customers = rng.choice(bg_accounts, size=n_sales, replace=True)
        for cust in customers:
            amt = float(rng.integers(180, 4200))
            ts = base_time + timedelta(seconds=int(rng.integers(0, span_seconds)))
            add_tx(str(cust), m_acc, amt, ts)
        # Occasional normal supplier settlement days later (much smaller than total)
        add_tx(m_acc, "A010", 42000.0, base_time + timedelta(days=10, hours=14))
        add_tx(m_acc, "A015", 38500.0, base_time + timedelta(days=19, hours=16))

    # Helper to allocate clean ring accounts
    next_ring_idx = 396

    def alloc_accounts(n: int) -> list[str]:
        nonlocal next_ring_idx
        accs = [f"A{i:03d}" for i in range(next_ring_idx, next_ring_idx + n)]
        next_ring_idx += n
        return accs

    # --- Planted Laundering Clusters ---

    # Cluster GT-1: Fan-out dispersion (1 source -> 8 mules in ~3.5 hours, smurfed under 1L)
    c1_accs = alloc_accounts(9)
    c1_src, c1_targets = c1_accs[0], c1_accs[1:]
    c1_start = base_time + timedelta(days=3, hours=3)
    c1_txs = []
    for idx, tgt in enumerate(c1_targets):
        amt = float(rng.integers(58000, 89000))
        ts = c1_start + timedelta(minutes=int(idx * 24 + rng.integers(2, 12)))
        c1_txs.append(add_tx(c1_src, tgt, amt, ts))
    ground_truth.append(
        {
            "cluster_id": "GT-001",
            "typology": "fan_out_dispersion",
            "accounts": c1_accs,
            "transaction_ids": c1_txs,
        }
    )

    # Cluster GT-2: Fan-out dispersion (1 source -> 10 mules in ~5 hours)
    c2_accs = alloc_accounts(11)
    c2_src, c2_targets = c2_accs[0], c2_accs[1:]
    c2_start = base_time + timedelta(days=11, hours=5)
    c2_txs = []
    for idx, tgt in enumerate(c2_targets):
        amt = float(rng.integers(62000, 94000))
        ts = c2_start + timedelta(minutes=int(idx * 28 + rng.integers(1, 15)))
        c2_txs.append(add_tx(c2_src, tgt, amt, ts))
    ground_truth.append(
        {
            "cluster_id": "GT-002",
            "typology": "fan_out_dispersion",
            "accounts": c2_accs,
            "transaction_ids": c2_txs,
        }
    )

    # Cluster GT-3: Fan-in aggregation (8 senders -> 1 collector in ~4 hours)
    c3_accs = alloc_accounts(9)
    c3_sources, c3_collector = c3_accs[:-1], c3_accs[-1]
    c3_start = base_time + timedelta(days=5, hours=4)
    c3_txs = []
    for idx, src in enumerate(c3_sources):
        amt = float(rng.integers(48000, 82000))
        ts = c3_start + timedelta(minutes=int(idx * 26 + rng.integers(2, 14)))
        c3_txs.append(add_tx(src, c3_collector, amt, ts))
    ground_truth.append(
        {
            "cluster_id": "GT-003",
            "typology": "fan_in_aggregation",
            "accounts": c3_accs,
            "transaction_ids": c3_txs,
        }
    )

    # Cluster GT-4: Fan-in aggregation (7 senders -> 1 collector in ~3.5 hours)
    c4_accs = alloc_accounts(8)
    c4_sources, c4_collector = c4_accs[:-1], c4_accs[-1]
    c4_start = base_time + timedelta(days=14, hours=7)
    c4_txs = []
    for idx, src in enumerate(c4_sources):
        amt = float(rng.integers(55000, 88000))
        ts = c4_start + timedelta(minutes=int(idx * 25 + rng.integers(3, 12)))
        c4_txs.append(add_tx(src, c4_collector, amt, ts))
    ground_truth.append(
        {
            "cluster_id": "GT-004",
            "typology": "fan_in_aggregation",
            "accounts": c4_accs,
            "transaction_ids": c4_txs,
        }
    )

    # Cluster GT-5: Cyclic round-tripping (3-account cycle, ~10h per hop, 2% haircut)
    c5_accs = alloc_accounts(3)
    c5_start = base_time + timedelta(days=6, hours=1)
    c5_txs = [
        add_tx(c5_accs[0], c5_accs[1], 92000.0, c5_start),
        add_tx(c5_accs[1], c5_accs[2], 90200.0, c5_start + timedelta(hours=10, minutes=15)),
        add_tx(c5_accs[2], c5_accs[0], 88400.0, c5_start + timedelta(hours=21, minutes=40)),
    ]
    ground_truth.append(
        {
            "cluster_id": "GT-005",
            "typology": "cyclic_round_tripping",
            "accounts": c5_accs,
            "transaction_ids": c5_txs,
        }
    )

    # Cluster GT-6: Cyclic round-tripping (4-account cycle, ~9h per hop)
    c6_accs = alloc_accounts(4)
    c6_start = base_time + timedelta(days=16, hours=2)
    c6_txs = [
        add_tx(c6_accs[0], c6_accs[1], 96000.0, c6_start),
        add_tx(c6_accs[1], c6_accs[2], 94100.0, c6_start + timedelta(hours=8, minutes=30)),
        add_tx(c6_accs[2], c6_accs[3], 92300.0, c6_start + timedelta(hours=18, minutes=10)),
        add_tx(c6_accs[3], c6_accs[0], 90500.0, c6_start + timedelta(hours=28, minutes=45)),
    ]
    ground_truth.append(
        {
            "cluster_id": "GT-006",
            "typology": "cyclic_round_tripping",
            "accounts": c6_accs,
            "transaction_ids": c6_txs,
        }
    )

    # Cluster GT-7: Rapid pass-through chain (5 accounts, 4 rapid hops of 20-45 mins)
    c7_accs = alloc_accounts(5)
    c7_start = base_time + timedelta(days=8, hours=4)
    amt = 95000.0
    t_curr = c7_start
    c7_txs = []
    for i in range(len(c7_accs) - 1):
        c7_txs.append(add_tx(c7_accs[i], c7_accs[i + 1], amt, t_curr))
        amt = round(amt * 0.985, -1)
        t_curr = t_curr + timedelta(minutes=int(rng.integers(18, 52)))
    ground_truth.append(
        {
            "cluster_id": "GT-007",
            "typology": "rapid_pass_through",
            "accounts": c7_accs,
            "transaction_ids": c7_txs,
        }
    )

    # Cluster GT-8: Rapid pass-through chain (4 accounts, 3 rapid hops of 15-40 mins)
    c8_accs = alloc_accounts(4)
    c8_start = base_time + timedelta(days=18, hours=6)
    amt = 88000.0
    t_curr = c8_start
    c8_txs = []
    for i in range(len(c8_accs) - 1):
        c8_txs.append(add_tx(c8_accs[i], c8_accs[i + 1], amt, t_curr))
        amt = round(amt * 0.982, -1)
        t_curr = t_curr + timedelta(minutes=int(rng.integers(15, 42)))
    ground_truth.append(
        {
            "cluster_id": "GT-008",
            "typology": "rapid_pass_through",
            "accounts": c8_accs,
            "transaction_ids": c8_txs,
        }
    )

    # Cluster GT-9: Hybrid layered cluster (Fan-out -> Pass-through -> Fan-in convergence)
    c9_src = alloc_accounts(1)[0]
    c9_mules_a = alloc_accounts(6)
    c9_mules_b = alloc_accounts(6)
    c9_sink = alloc_accounts(1)[0]
    c9_accs = [c9_src] + c9_mules_a + c9_mules_b + [c9_sink]
    c9_start = base_time + timedelta(days=12, hours=2)
    c9_txs = []
    for idx in range(6):
        t_out = c9_start + timedelta(minutes=idx * 18)
        chunk = float(rng.integers(64000, 78000))
        c9_txs.append(add_tx(c9_src, c9_mules_a[idx], chunk, t_out))
        t_hop = t_out + timedelta(minutes=int(rng.integers(20, 45)))
        hop_amt = round(chunk * 0.98, -1)
        c9_txs.append(add_tx(c9_mules_a[idx], c9_mules_b[idx], hop_amt, t_hop))
        t_in = t_hop + timedelta(minutes=int(rng.integers(20, 50)))
        in_amt = round(hop_amt * 0.985, -1)
        c9_txs.append(add_tx(c9_mules_b[idx], c9_sink, in_amt, t_in))
    ground_truth.append(
        {
            "cluster_id": "GT-009",
            "typology": "fan_out_dispersion",
            "accounts": c9_accs,
            "transaction_ids": c9_txs,
        }
    )

    # Sort chronologically and save
    df = pd.DataFrame(tx_rows).sort_values("timestamp").reset_index(drop=True)
    df.to_csv(out_path / "transactions.csv", index=False)

    with open(out_path / "ground_truth.json", "w", encoding="utf-8") as f:
        json.dump(ground_truth, f, indent=2)

    return df, ground_truth


if __name__ == "__main__":
    df, gt = generate_dataset()
    unique_accs = len(set(df["source"]).union(set(df["target"])))
    print(f"Generated {len(df)} transactions across {unique_accs} accounts, {len(gt)} planted clusters.")
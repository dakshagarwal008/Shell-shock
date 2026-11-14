import pandas as pd


def run_baseline(
    df: pd.DataFrame,
    amount_threshold: float = 100000.0,
    daily_tx_threshold: int = 6,
) -> set[str]:
    """
    Legacy threshold-based AML rule engine:
    Flags any account involved in a single transaction >= amount_threshold
    OR making/receiving >= daily_tx_threshold transactions in a single day.
    """
    flagged: set[str] = set()

    # Rule 1: High-value single transaction
    high_val = df[df["amount"] >= amount_threshold]
    flagged.update(high_val["source"].tolist())
    flagged.update(high_val["target"].tolist())

    # Rule 2: High daily transaction count (outgoing or incoming per day)
    work = df.copy()
    work["day"] = pd.to_datetime(work["timestamp"]).dt.date

    out_counts = work.groupby(["source", "day"]).size()
    for (acc, _), cnt in out_counts.items():
        if cnt >= daily_tx_threshold:
            flagged.add(acc)

    in_counts = work.groupby(["target", "day"]).size()
    for (acc, _), cnt in in_counts.items():
        if cnt >= daily_tx_threshold:
            flagged.add(acc)

    return flagged
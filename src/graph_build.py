from pathlib import Path
import networkx as nx
import pandas as pd


def load_transactions(csv_path: str | Path = "sample_data/transactions.csv") -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    df["timestamp_dt"] = pd.to_datetime(df["timestamp"])
    df["ts_epoch"] = (df["timestamp_dt"] - pd.Timestamp("1970-01-01")).dt.total_seconds()
    df["amount"] = df["amount"].astype(float)
    return df


def build_transaction_graph(df: pd.DataFrame) -> nx.MultiDiGraph:
    if "ts_epoch" not in df.columns:
        df = df.copy()
        ts_dt = pd.to_datetime(df["timestamp"])
        df["ts_epoch"] = (ts_dt - pd.Timestamp("1970-01-01")).dt.total_seconds()

    G = nx.MultiDiGraph()

    for row in df.itertuples(index=False):
        if row.source not in G:
            G.add_node(row.source)
        if row.target not in G:
            G.add_node(row.target)

        G.add_edge(
            row.source,
            row.target,
            key=row.id,
            id=row.id,
            amount=float(row.amount),
            timestamp=row.timestamp,
            ts_epoch=float(row.ts_epoch),
        )

    return G
from src.data_gen import generate_dataset
from src.graph_build import load_transactions, build_transaction_graph
from src.detectors import run_all_detectors
from src.scoring import score_and_rank_clusters
from src.summarize import attach_summaries
from src.baseline import run_baseline
from src.metrics import build_metrics_report
from src.export import export_pipeline_outputs


def main() -> None:
    _, ground_truth = generate_dataset(output_dir="sample_data", seed=42)
    df = load_transactions("sample_data/transactions.csv")
    G = build_transaction_graph(df)

    merged = run_all_detectors(G)
    clusters = score_and_rank_clusters(merged, G)
    clusters = attach_summaries(clusters)

    baseline_accounts = run_baseline(df)
    metrics = build_metrics_report(
        baseline_accounts=baseline_accounts,
        detected_clusters=clusters,
        ground_truth=ground_truth,
        total_transactions=len(df),
        total_accounts=G.number_of_nodes(),
    )

    export_pipeline_outputs(clusters, G, metrics=metrics, out_dir="web/public/data")

    print(
        f"Dataset: {metrics['dataset']['transactions']} transactions, "
        f"{metrics['dataset']['accounts']} accounts, "
        f"{metrics['dataset']['planted_clusters']} planted clusters"
    )
    print(f"Detected {len(clusters)} suspicious clusters.\n")
    print("=== Evaluation (Account-Level) ===")
    b = metrics["baseline"]
    g = metrics["graph_method"]
    print(f"  Baseline     -> Precision: {b['precision']:.3f} | Recall: {b['recall']:.3f} | F1: {b['f1']:.3f} (TP={b['tp']}, FP={b['fp']}, FN={b['fn']})")
    print(f"  Graph Method -> Precision: {g['precision']:.3f} | Recall: {g['recall']:.3f} | F1: {g['f1']:.3f} (TP={g['tp']}, FP={g['fp']}, FN={g['fn']})")


if __name__ == "__main__":
    main()
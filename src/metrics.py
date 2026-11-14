def compute_account_metrics(predicted: set[str], ground_truth_accounts: set[str]) -> dict:
    tp = len(predicted & ground_truth_accounts)
    fp = len(predicted - ground_truth_accounts)
    fn = len(ground_truth_accounts - predicted)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "tp": int(tp),
        "fp": int(fp),
        "fn": int(fn),
    }


def build_metrics_report(
    baseline_accounts: set[str],
    detected_clusters: list[dict],
    ground_truth: list[dict],
    total_transactions: int,
    total_accounts: int,
) -> dict:
    gt_accounts = {acc for c in ground_truth for acc in c["accounts"]}
    graph_accounts = {acc for c in detected_clusters for acc in c["accounts"]}

    return {
        "baseline": compute_account_metrics(baseline_accounts, gt_accounts),
        "graph_method": compute_account_metrics(graph_accounts, gt_accounts),
        "dataset": {
            "transactions": int(total_transactions),
            "accounts": int(total_accounts),
            "planted_clusters": int(len(ground_truth)),
        },
    }
export const NORMAL_EDGE_RETENTION_LIMIT = 160;
export const NORMAL_EDGE_MIN_VISIBLE_TRANSACTIONS = 40;

/**
 * Bounded visual retention only. `processed` remains the complete replay prefix
 * and is still the sole input to the detector, feed and investigation data.
 */
export function selectVisibleGraphTransactions(processed, clusters,
  limit = NORMAL_EDGE_RETENTION_LIMIT,
  minimumVisibleTransactions = NORMAL_EDGE_MIN_VISIBLE_TRANSACTIONS) {
  const suspiciousIds = new Set((clusters ?? []).flatMap(cluster => (cluster.transaction_ids ?? []).map(String)));
  const normal = processed.filter(transaction => !suspiciousIds.has(String(transaction.id)));
  const overflow = Math.max(0, normal.length - limit);
  if (!overflow) return { transactions: processed, suspiciousIds };
  const transactionIndex = new Map(processed.map((transaction, index) => [String(transaction.id), index]));
  const eligibleToExpire = normal.filter(transaction => processed.length - transactionIndex.get(String(transaction.id)) > minimumVisibleTransactions);
  const expiredIds = new Set(eligibleToExpire.slice(0, overflow).map(transaction => String(transaction.id)));
  return { transactions: processed.filter(transaction => !expiredIds.has(String(transaction.id)) || suspiciousIds.has(String(transaction.id))), suspiciousIds };
}

import { evaluatePrefix } from './liveDetection.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const STRUCTURAL_TYPES = new Set(['fan_in_aggregation', 'fan_out_dispersion']);

export function findStructuralPatterns(transactions) {
  const patterns = [];
  for (const direction of ['in', 'out']) {
    const byHub = new Map();
    for (const transaction of transactions) {
      const hub = direction === 'in' ? transaction.target : transaction.source;
      if (!byHub.has(hub)) byHub.set(hub, []);
      byHub.get(hub).push(transaction);
    }
    for (const [hub, edges] of byHub) {
      const ordered = [...edges].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      let left = 0, best = [];
      for (let right = 0; right < ordered.length; right++) {
        while (Date.parse(ordered[right].timestamp) - Date.parse(ordered[left].timestamp) > WINDOW_MS) left++;
        const window = ordered.slice(left, right + 1);
        const counterparties = new Set(window.map(edge => direction === 'in' ? edge.source : edge.target));
        if (counterparties.size >= 5 && counterparties.size > new Set(best.map(edge => direction === 'in' ? edge.source : edge.target)).size) best = window;
      }
      if (!best.length) continue;
      patterns.push({
        direction: direction === 'in' ? 'fan_in' : 'fan_out', hub,
        source_count: new Set(best.map(edge => direction === 'in' ? edge.source : edge.target)).size,
        total_amount: best.reduce((sum, edge) => sum + Number(edge.amount), 0),
        transaction_ids: best.map(edge => String(edge.id)),
        accounts: [...new Set([hub, ...best.map(edge => direction === 'in' ? edge.source : edge.target)])]
      });
    }
  }
  return patterns;
}

function hasCorroboratingOnwardFlow(evidence, transactions) {
  if (!evidence.hub) return false;
  const incoming = transactions.filter(edge => edge.target === evidence.hub && Number.isFinite(Date.parse(edge.timestamp)));
  if (!incoming.length) return false;
  const start = Math.min(...incoming.map(edge => Date.parse(edge.timestamp)));
  const end = start + 48 * 60 * 60 * 1000;
  const windowIncoming = incoming.filter(edge => start <= Date.parse(edge.timestamp) && Date.parse(edge.timestamp) <= end);
  const outflow = transactions.filter(edge => edge.source === evidence.hub && start <= Date.parse(edge.timestamp) && Date.parse(edge.timestamp) <= end);
  const incomingAmount = windowIncoming.reduce((sum, edge) => sum + Number(edge.amount), 0);
  const outgoingAmount = outflow.reduce((sum, edge) => sum + Number(edge.amount), 0);
  if (incomingAmount <= 0 || outgoingAmount / incomingAmount < .6) return false;
  return outflow.some(edge => transactions.some(next => {
    const elapsed = Date.parse(next.timestamp) - Date.parse(edge.timestamp);
    return next.source === edge.target && elapsed > 0 && elapsed <= 6 * 60 * 60 * 1000
      && Number(next.amount) >= .88 * Number(edge.amount) && Number(next.amount) <= 1.03 * Number(edge.amount);
  }));
}

export function assessScenario(transactions) {
  const detectorClusters = evaluatePrefix(transactions);
  const patterns = findStructuralPatterns(transactions);
  const alerts = detectorClusters.filter(cluster => {
    if ((cluster.typologies ?? []).some(type => !STRUCTURAL_TYPES.has(type))) return true;
    return (cluster._evidences ?? []).some(evidence =>
      STRUCTURAL_TYPES.has(evidence.typology) && hasCorroboratingOnwardFlow(evidence, transactions));
  });
  return { patterns, detectorClusters, alerts,
    observedTypologies: [...new Set(detectorClusters.flatMap(cluster => cluster.typologies ?? []))] };
}

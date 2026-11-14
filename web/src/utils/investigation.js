export function buildTransactionSequence(cluster, graph) {
  const ids = Array.isArray(cluster?.transaction_ids) ? cluster.transaction_ids : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const edgeById = new Map(edges.filter(edge => edge?.id != null).map(edge => [String(edge.id), edge]));
  const records = ids.map((id, index) => ({ id: String(id), index, edge: edgeById.get(String(id)) ?? null }));
  const timestamped = [];
  const untimed = [];
  const unavailable = [];

  records.forEach(record => {
    if (!record.edge) {
      unavailable.push(record);
      return;
    }
    const time = typeof record.edge.timestamp === 'string' ? Date.parse(record.edge.timestamp) : Number.NaN;
    if (Number.isFinite(time)) timestamped.push({ ...record.edge, id: record.id, time, sourceIndex: record.index });
    else untimed.push({ ...record.edge, id: record.id, sourceIndex: record.index });
  });

  timestamped.sort((a, b) => a.time - b.time || a.sourceIndex - b.sourceIndex);
  untimed.sort((a, b) => a.sourceIndex - b.sourceIndex);
  return { transactions: timestamped, untimed, unavailable, total: ids.length };
}

export function elapsedLabel(previous, current) {
  const previousTime = typeof previous?.timestamp === 'string' ? Date.parse(previous.timestamp) : Number.NaN;
  const currentTime = typeof current?.timestamp === 'string' ? Date.parse(current.timestamp) : Number.NaN;
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime) || currentTime < previousTime) return null;

  const minutes = Math.floor((currentTime - previousTime) / 60000);
  if (minutes < 1) return `${Math.floor((currentTime - previousTime) / 1000)} sec`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours ? `${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ''}` : `${minutes}m`;
}

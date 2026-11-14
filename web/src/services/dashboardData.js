const DATA_FILES = ['clusters', 'graph', 'metrics'];

async function fetchJson(name, signal) {
  const response = await fetch(`/data/${name}.json`, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load /data/${name}.json (${response.status}).`);
  try { return await response.json(); }
  catch { throw new Error(`${name}.json is not valid JSON.`); }
}

export async function fetchDashboardData(signal) {
  const [clusters, graph, metrics] = await Promise.all(DATA_FILES.map(name => fetchJson(name, signal)));
  if (!Array.isArray(clusters) || !clusters.every(cluster => cluster && typeof cluster.id === 'string')) {
    throw new Error('clusters.json must be an array of clusters with string IDs.');
  }
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) throw new Error('graph.json must contain an object.');
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw new Error('metrics.json must contain an object.');
  return {
    clusters,
    graph: {
      nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
      edges: Array.isArray(graph.edges) ? graph.edges : []
    },
    metrics
  };
}

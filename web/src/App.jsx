import { useEffect, useState } from 'react';
import MetricsBanner from './components/MetricsBanner.jsx';
import ClusterTable from './components/ClusterTable.jsx';
import GraphView from './components/GraphView.jsx';
import DetailPanel from './components/DetailPanel.jsx';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all(['clusters', 'graph', 'metrics'].map(async name => {
      const response = await fetch(`/data/${name}.json`);
      if (!response.ok) throw new Error(`Could not load /data/${name}.json (${response.status}).`);
      return response.json();
    })).then(([clusters, graph, metrics]) => {
      if (active) { setData({ clusters, graph, metrics }); setSelectedId(clusters[0]?.id ?? null); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  if (error) return <main className="state-screen"><div className="state-card"><span className="eyebrow">DATA CONNECTION</span><h1>Results unavailable</h1><p>{error}</p><p className="muted">Add the pipeline JSON files under <code>web/public/data/</code> and refresh.</p></div></main>;
  if (!data) return <main className="state-screen"><div className="state-card"><span className="loader"/><h1>Loading investigation data</h1><p className="muted">Connecting clusters, transactions and evaluation metrics…</p></div></main>;

  const selected = data.clusters.find(c => c.id === selectedId) ?? null;
  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">T</span><span>TRACE<small>FINANCIAL CRIME INTELLIGENCE</small></span></a><div className="topbar-right"><span className="live-dot"/> INVESTIGATION WORKSPACE <span className="topbar-date">BUILD BEYOND ’26</span></div></header>
    <section className="intro" id="top"><div><span className="eyebrow">PS 2.1 · NETWORK ANALYSIS</span><h1>Follow the money.<br/><em>Find the pattern.</em></h1><p>Layered transaction networks, surfaced and explained.</p></div><div className="dataset-chip"><span className="dataset-icon">◈</span><div><b>{data.metrics.dataset?.transactions?.toLocaleString() ?? '—'}</b><small>TRANSACTIONS ANALYZED</small></div><i/></div></section>
    <MetricsBanner metrics={data.metrics}/>
    <div className="section-heading"><div><span className="eyebrow">PRIORITIZED FOR REVIEW</span><h2>Suspicious clusters <span>{data.clusters.length.toString().padStart(2, '0')}</span></h2></div><div className="section-note"><span className="live-dot"/> GRAPH METHOD · RANKED BY RISK</div></div>
    <section className="workspace"><ClusterTable clusters={data.clusters} selectedId={selectedId} onSelect={setSelectedId}/><div className="right-column"><GraphView graph={data.graph} clusters={data.clusters} selected={selected}/><DetailPanel cluster={selected}/></div></section>
    <footer><span>TRACE <i>·</i> GRAPH-BASED AML DETECTION</span><span>DEMO DATASET <i>·</i> BUILD BEYOND ’26</span></footer>
  </main>;
}

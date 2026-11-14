import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LandingPage from './components/LandingPage.jsx';
import MetricsBanner from './components/MetricsBanner.jsx';
import ClusterTable from './components/ClusterTable.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import DashboardSkeleton from './components/DashboardSkeleton.jsx';
import InvestigationMode from './components/InvestigationMode.jsx';
import { useDashboardData } from './hooks/useDashboardData.js';
import { riskBand } from './utils/clusterDisplay.js';

const GraphView = lazy(() => import('./components/GraphView.jsx'));

function readRoute() {
  const hash = window.location.hash;
  const match = hash.match(/^#\/dashboard\/investigation\/([^/?]+)/);
  if (match) {
    let investigationId = match[1];
    try { investigationId = decodeURIComponent(investigationId); } catch { /* Keep the visible route segment as-is. */ }
    return { page: 'dashboard', investigationId };
  }
  return { page: hash.startsWith('#/dashboard') ? 'dashboard' : 'landing', investigationId: null };
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const syncRoute = () => setRoute(readRoute());
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [route.page, route.investigationId]);
  return route.page === 'dashboard' ? <DashboardPage investigationId={route.investigationId}/> : <LandingPage/>;
}

function DashboardPage({ investigationId }) {
  const { data, error, loading, refresh } = useDashboardData();
  const [selectedId, setSelectedId] = useState(null);
  const [graphItem, setGraphItem] = useState(null);
  const [query, setQuery] = useState('');
  const [typology, setTypology] = useState('all');
  const [riskLevel, setRiskLevel] = useState('all');
  const [sort, setSort] = useState('risk');
  const [ascending, setAscending] = useState(false);
  const appliedFilters = useRef({ clusters: null, query: null, typology: null, riskLevel: null });
  const previousInvestigationId = useRef(null);
  const reload = useCallback(() => { setGraphItem(null); refresh(); }, [refresh]);
  const handleGraphSelect = useCallback((id, item) => {
    setSelectedId(id);
    setGraphItem(item ?? null);
    if (investigationId && id !== investigationId) window.location.hash = `#/dashboard/investigation/${encodeURIComponent(id)}`;
  }, [investigationId]);

  const typologies = useMemo(() => [...new Set((data?.clusters ?? []).flatMap(cluster => Array.isArray(cluster.typologies) ? cluster.typologies : []))], [data?.clusters]);
  const matchingClusters = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (data?.clusters ?? []).filter(cluster => {
      const accounts = Array.isArray(cluster.accounts) ? cluster.accounts : [];
      const matchesQuery = !search || `${cluster.id} ${cluster.name ?? ''} ${accounts.join(' ')}`.toLowerCase().includes(search);
      const matchesTypology = typology === 'all' || (Array.isArray(cluster.typologies) && cluster.typologies.includes(typology));
      const matchesRisk = riskLevel === 'all' || riskBand(cluster.risk_score)?.id === riskLevel;
      return matchesQuery && matchesTypology && matchesRisk;
    });
  }, [data?.clusters, query, typology, riskLevel]);
  const visibleClusters = useMemo(() => [...matchingClusters].sort((a, b) => {
    const value = cluster => sort === 'exposure' ? Number(cluster.total_amount) || 0 : sort === 'accounts' ? (Array.isArray(cluster.accounts) ? cluster.accounts.length : 0) : Number(cluster.risk_score) || 0;
    return (value(a) - value(b)) * (ascending ? 1 : -1);
  }), [matchingClusters, sort, ascending]);

  useEffect(() => {
    if (!data) return;
    const previous = appliedFilters.current;
    if (previous.clusters === data.clusters && previous.query === query && previous.typology === typology && previous.riskLevel === riskLevel) return;
    appliedFilters.current = { clusters: data.clusters, query, typology, riskLevel };
    setSelectedId(visibleClusters[0]?.id ?? null);
    setGraphItem(null);
  }, [data, query, typology, riskLevel, visibleClusters]);

  useEffect(() => {
    if (investigationId) {
      if (previousInvestigationId.current !== investigationId) setSelectedId(investigationId);
      previousInvestigationId.current = investigationId;
      return;
    }
    if (previousInvestigationId.current) {
      previousInvestigationId.current = null;
      setSelectedId(current => visibleClusters.some(cluster => cluster.id === current) ? current : visibleClusters[0]?.id ?? null);
      setGraphItem(null);
    }
  }, [investigationId, visibleClusters]);

  const selected = data?.clusters.find(cluster => cluster.id === selectedId) ?? null;
  const investigationCluster = investigationId ? data?.clusters.find(cluster => cluster.id === investigationId) ?? null : null;
  const detailCluster = investigationId ? investigationCluster : selected;
  const periodByCluster = useMemo(() => {
    if (!data) return {};
    const timestampByTransaction = new Map((data.graph.edges ?? []).map(edge => [String(edge.id), edge.timestamp]));
    return Object.fromEntries(data.clusters.map(cluster => {
      const timestamps = (cluster.transaction_ids ?? []).map(id => timestampByTransaction.get(String(id))).filter(value => typeof value === 'string' && value).sort();
      return [cluster.id, { start: timestamps[0] ?? null, end: timestamps.at(-1) ?? null }];
    }));
  }, [data]);
  const selectedTransactions = useMemo(() => {
    if (!detailCluster) return [];
    const ids = new Set(detailCluster.transaction_ids ?? []);
    return (data?.graph.edges ?? []).filter(edge => ids.has(String(edge.id)));
  }, [data?.graph.edges, detailCluster]);
  const openInvestigation = id => { setSelectedId(id); setGraphItem(null); window.location.hash = `#/dashboard/investigation/${encodeURIComponent(id)}`; };
  const selectCluster = id => { setSelectedId(id); setGraphItem(null); };
  const sortBy = field => { if (sort === field) setAscending(value => !value); else { setSort(field); setAscending(false); } };

  if (loading && !data) return <DashboardSkeleton/>;
  if (error && !data) return <main className="state-screen"><div className="state-card"><span className="eyebrow">DATA CONNECTION</span><h1>Results unavailable</h1><p>{error}</p><p className="muted">Check the JSON files under <code>public/data/</code>, then retry.</p><button className="retry-button" onClick={reload}>Retry loading data</button></div></main>;
  if (!data) return null;

  if (investigationId) {
    if (!investigationCluster) return <main className="state-screen"><div className="state-card"><span className="eyebrow">INVESTIGATION MODE</span><h1>Alert unavailable</h1><p>No cluster with ID <code>{investigationId}</code> exists in the loaded backend data.</p><button className="retry-button" onClick={() => { window.location.hash = '#/dashboard'; }}>Back to alerts</button></div></main>;
    return <InvestigationMode key={investigationCluster.id} cluster={investigationCluster} data={data} graphItem={graphItem} onGraphSelect={handleGraphSelect} onBack={() => { window.location.hash = '#/dashboard'; }} period={periodByCluster[investigationCluster.id]} transactions={selectedTransactions}/>;
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#/" aria-label="Return to Shell Shocker home"><span className="brand-mark">SS</span><span>Shell Shocker<small>FINANCIAL CRIME INTELLIGENCE</small></span></a><div className="dashboard-nav"><span className="dashboard-current">INVESTIGATION WORKSPACE</span><span className="topbar-date">DEMO ENVIRONMENT</span><button className="refresh-button" onClick={reload} disabled={loading} aria-label="Refresh dashboard data">{loading ? 'Refreshing…' : 'Refresh data'}</button></div></header>
    <section className="intro" id="top"><div><span className="eyebrow">PS 2.1 · NETWORK ANALYSIS</span><h1>Follow the money.<br/><em>Find the pattern.</em></h1><p>Layered transaction networks, surfaced and explained.</p></div><div className="dataset-chip"><span className="dataset-icon">◈</span><div><b>{data.metrics.dataset?.transactions?.toLocaleString() ?? '—'}</b><small>TRANSACTIONS ANALYZED</small></div><i/></div></section>
    {error && <div className="refresh-error" role="alert">Refresh failed: {error} <button onClick={reload}>Retry</button></div>}
    <MetricsBanner metrics={data.metrics} totals={{ clusters: data.clusters.length, nodes: data.graph.nodes.length, edges: data.graph.edges.length }}/>
    <div className="section-heading"><div><span className="eyebrow">PRIORITIZED FOR REVIEW</span><h2>Suspicious alerts <span>{visibleClusters.length.toString().padStart(2, '0')}</span></h2></div><div className="section-note"><span className="live-dot"/> DETECTION OUTPUT · RANKED BY RISK</div></div>
    <section className="workspace"><ClusterTable clusters={visibleClusters} totalClusters={data.clusters.length} typologies={typologies} query={query} typology={typology} riskLevel={riskLevel} onRiskLevelChange={setRiskLevel} periodByCluster={periodByCluster} sort={sort} ascending={ascending} onQueryChange={setQuery} onTypologyChange={setTypology} onSortChange={sortBy} selectedId={selectedId} onSelect={selectCluster}/><div className="right-column"><Suspense fallback={<div className="graph-loading">Loading network visualization…</div>}><GraphView graph={data.graph} clusters={data.clusters} selected={selected} graphItem={graphItem} onSelect={handleGraphSelect}/></Suspense><DetailPanel cluster={selected} graphItem={graphItem} period={selected ? periodByCluster[selected.id] : null} transactions={selectedTransactions} onInvestigate={() => selected && openInvestigation(selected.id)}/></div></section>
    <footer><span>Shell Shocker <i>·</i> GRAPH-BASED AML DETECTION</span><span>DEMO DATASET <i>·</i> BUILD BEYOND ’26</span></footer>
  </main>;
}

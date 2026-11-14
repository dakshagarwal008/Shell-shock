const fmt = n => n != null && n !== '' && Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—';
const count = n => n != null && Number.isFinite(Number(n)) ? Number(n).toLocaleString() : '—';

export default function MetricsBanner({ metrics, totals }) {
  const base = metrics.baseline ?? {};
  const graph = metrics.graph_method ?? {};
  const hasDelta = graph.f1 != null && base.f1 != null && Number.isFinite(Number(graph.f1)) && Number.isFinite(Number(base.f1));
  const delta = hasDelta ? Number(graph.f1) - Number(base.f1) : null;
  const cards = [
    { label: 'SUSPICIOUS CLUSTERS', value: totals.clusters, hint: 'Ranked for review' },
    { label: 'GRAPH NODES', value: totals.nodes, hint: 'Accounts in supplied graph' },
    { label: 'GRAPH EDGES', value: totals.edges, hint: 'Transactions in supplied graph' }
  ];
  return <section className="metrics-card">
    <div className="metrics-title"><div><span className="eyebrow">MODEL PERFORMANCE</span><h2>Detection performance</h2></div><span className="eval-tag" title="Evaluation values are read from metrics.json">HELD-OUT EVALUATION</span></div>
    <div className="summary-metrics">{cards.map(card => <div className="summary-metric" key={card.label}><span>{card.label}</span><b>{count(card.value)}</b><small>{card.hint}</small></div>)}<div className="summary-metric f1-summary" title="F1 score balances precision and recall"><span>GRAPH METHOD F1</span><b>{fmt(graph.f1)}</b><small>Precision and recall balance</small></div></div>
    <div className="metrics-content"><div className="f1-callout"><span className="eyebrow">F1 SCORE COMPARISON</span><strong>{fmt(base.f1)} <b>→</b> <i>{fmt(graph.f1)}</i></strong><span className={`lift-pill ${delta != null && delta < 0 ? 'negative' : ''}`}>{hasDelta ? `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)} pp` : '—'}</span><small>BASELINE <span>GRAPH METHOD</span></small></div>
      <div className="metric-method"><div className="method-name"><span className="method-dot baseline-dot"/>THRESHOLD BASELINE</div><div className="metric-values">{['precision','recall','f1'].map(k => <div key={k}><span>{k}</span><b>{fmt(base[k])}</b></div>)}</div><div className="counts"><span>TP <b>{count(base.tp)}</b></span><span>FP <b>{count(base.fp)}</b></span><span>FN <b>{count(base.fn)}</b></span></div></div>
      <div className="metric-method graph-method"><div className="method-name"><span className="method-dot graph-dot"/>TEMPORAL GRAPH</div><div className="metric-values">{['precision','recall','f1'].map(k => <div key={k}><span>{k}</span><b>{fmt(graph[k])}</b></div>)}</div><div className="counts"><span>TP <b>{count(graph.tp)}</b></span><span>FP <b>{count(graph.fp)}</b></span><span>FN <b>{count(graph.fn)}</b></span></div></div></div>
  </section>;
}

const fmt = n => Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—';

export default function MetricsBanner({ metrics }) {
  const base = metrics.baseline ?? {};
  const graph = metrics.graph_method ?? {};
  const delta = Number(graph.f1) - Number(base.f1);
  return <section className="metrics-card">
    <div className="metrics-title"><div><span className="eyebrow">MODEL PERFORMANCE</span><h2>Graph signals outperform rules.</h2></div><span className="eval-tag">HELD-OUT EVALUATION</span></div>
    <div className="metrics-content"><div className="f1-callout"><span className="eyebrow">F1 SCORE LIFT</span><strong>{fmt(base.f1)} <b>→</b> <i>{fmt(graph.f1)}</i></strong><span className="lift-pill">+{Number.isFinite(delta) ? Math.round(delta * 100) : 0} pts</span><small>BASELINE <span>GRAPH METHOD</span></small></div>
      <div className="metric-method"><div className="method-name"><span className="method-dot baseline-dot"/>THRESHOLD BASELINE</div><div className="metric-values">{['precision','recall','f1'].map(k => <div key={k}><span>{k}</span><b>{fmt(base[k])}</b></div>)}</div><div className="counts"><span>TP <b>{base.tp ?? '—'}</b></span><span>FP <b>{base.fp ?? '—'}</b></span><span>FN <b>{base.fn ?? '—'}</b></span></div></div>
      <div className="metric-method graph-method"><div className="method-name"><span className="method-dot graph-dot"/>TEMPORAL GRAPH</div><div className="metric-values">{['precision','recall','f1'].map(k => <div key={k}><span>{k}</span><b>{fmt(graph[k])}</b></div>)}</div><div className="counts"><span>TP <b>{graph.tp ?? '—'}</b></span><span>FP <b>{graph.fp ?? '—'}</b></span><span>FN <b>{graph.fn ?? '—'}</b></span></div></div></div>
  </section>;
}

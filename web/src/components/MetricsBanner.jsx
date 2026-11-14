const fmt = n => n != null && n !== '' && Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—';
const count = n => n != null && Number.isFinite(Number(n)) ? Number(n).toLocaleString() : '—';

export default function MetricsBanner({ metrics, totals }) {
  const base = metrics.baseline ?? {};
  const graph = metrics.graph_method ?? {};
  const hasDelta = graph.f1 != null && base.f1 != null && Number.isFinite(Number(graph.f1)) && Number.isFinite(Number(base.f1));
  const delta = hasDelta ? Number(graph.f1) - Number(base.f1) : null;
  const cards = [
    { label: 'TRANSACTIONS ANALYZED', value: metrics.dataset?.transactions, hint: 'Records in the evaluation dataset', title: 'Total transaction records processed by the supplied evaluation run.' },
    { label: 'SUSPICIOUS CLUSTERS', value: totals.clusters, hint: 'Connected groups flagged for review', title: 'Groups of connected accounts returned by the detection run.' },
    { label: 'GRAPH ACCOUNTS', value: totals.nodes, hint: 'Accounts in the suspicious network', title: 'Unique account nodes in the supplied suspicious-activity graph.' },
    { label: 'GRAPH TRANSFERS', value: totals.edges, hint: 'Transfers shown in the network', title: 'Directed transaction edges included in the supplied graph.' }
  ];
  const metricHelp = {
    precision: 'Of the accounts flagged, the share that are known suspicious accounts.',
    recall: 'Of the known suspicious accounts, the share found by the method.',
    f1: 'A combined precision and recall score. Scores range from 0 to 1; higher is better.'
  };
  const countHelp = { TP: 'True-positive accounts correctly identified.', FP: 'False-positive accounts flagged but not in the known suspicious set.', FN: 'False-negative known suspicious accounts not identified.' };
  return <section className="metrics-card">
    <div className="metrics-title"><div><span className="eyebrow">MODEL PERFORMANCE</span><h2>Detection performance</h2></div><span className="eval-tag" title="Evaluation values are read from metrics.json">HELD-OUT EVALUATION</span></div>
    <div className="summary-metrics">{cards.map(card => <div className="summary-metric" key={card.label} title={card.title}><span>{card.label}</span><b>{count(card.value)}</b><small>{card.hint}</small></div>)}<div className="summary-metric f1-summary" title={metricHelp.f1}><span>GRAPH METHOD F1</span><b>{fmt(graph.f1)}</b><small>Precision and recall balance · 0–1</small></div></div>
    <p className="metric-reading-note">Precision, recall and F1 are scores from 0 to 1; higher is better. TP, FP and FN are account counts.</p>
    <div className="metrics-content"><div className="f1-callout"><span className="eyebrow">F1 SCORE COMPARISON</span><strong>{fmt(base.f1)} <b>→</b> <i>{fmt(graph.f1)}</i></strong><span className={`lift-pill ${delta != null && delta < 0 ? 'negative' : ''}`} title="Difference between graph method and baseline F1 scores, in percentage points">{hasDelta ? `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)} pp` : '—'}</span><small>BASELINE <span>GRAPH METHOD</span></small></div>
      <div className="metric-method"><div className="method-name"><span className="method-dot baseline-dot"/>THRESHOLD BASELINE</div><div className="metric-values">{['precision','recall','f1'].map(k => <div key={k}><span title={metricHelp[k]}>{k}</span><b title={metricHelp[k]}>{fmt(base[k])}</b></div>)}</div><div className="counts">{[['TP',base.tp],['FP',base.fp],['FN',base.fn]].map(([label,value])=><span key={label} title={countHelp[label]}>{label} <b>{count(value)}</b></span>)}</div></div>
      <div className="metric-method graph-method"><div className="method-name"><span className="method-dot graph-dot"/>TEMPORAL GRAPH</div><div className="metric-values">{['precision','recall','f1'].map(k => <div key={k}><span title={metricHelp[k]}>{k}</span><b title={metricHelp[k]}>{fmt(graph[k])}</b></div>)}</div><div className="counts">{[['TP',graph.tp],['FP',graph.fp],['FN',graph.fn]].map(([label,value])=><span key={label} title={countHelp[label]}>{label} <b>{count(value)}</b></span>)}</div></div></div>
  </section>;
}

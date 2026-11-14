import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InvestigationMode from './InvestigationMode.jsx';
import DemoSelector from './DemoSelector.jsx';
import { TypologyBadge } from './ClusterTable.jsx';
import { formatTimestamp, money, riskBand, TYPOLOGY } from '../utils/clusterDisplay.js';
import { assessScenario } from '../utils/exceptionAssessment.js';

const GraphView = lazy(() => import('./GraphView.jsx'));
const SCENARIOS = [
  { id: 'charity', label: 'Legitimate Charity · Fan-in', shortLabel: 'LEGITIMATE CHARITY · FAN-IN', file: 'fundraiser.json', region: 0 },
  { id: 'laundering-in', label: 'Suspicious Laundering · Fan-in', shortLabel: 'SUSPICIOUS LAUNDERING · FAN-IN', file: 'money-laundering.json', region: 1 },
  { id: 'company', label: 'Legitimate Company Payout · Fan-out', shortLabel: 'LEGITIMATE COMPANY PAYOUT · FAN-OUT', file: 'company-payout.json', region: 2 },
  { id: 'laundering-out', label: 'Suspicious Laundering · Fan-out', shortLabel: 'SUSPICIOUS LAUNDERING · FAN-OUT', file: 'suspicious-fan-out.json', region: 3 }
];
const REGIONS = SCENARIOS.map(({ id, shortLabel }) => ({ id, label: shortLabel }));

function PanelTitle({ eyebrow, children, count }) {
  return <div className="exception-panel-title"><div><span className="eyebrow">{eyebrow}</span><h2>{children}</h2></div>{count != null && <span>{count}</span>}</div>;
}

function scenarioOutcome(result) {
  if (!result.transactionCount) return 'Awaiting transactions';
  if (result.alerts.length) return `${result.alerts.length} evidence-supported alert${result.alerts.length === 1 ? '' : 's'}`;
  if (result.patterns.length) return `No AML alert; ${result.patterns.map(item => item.direction.replace('_', '-')).join(' / ')} alone is insufficient`;
  return 'No structural pattern detected yet';
}

export default function ExceptionDemo({ active = true, selectedDemo = 'exception', onSelectDemo = () => {} }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('idle');
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [graphItem, setGraphItem] = useState(null);
  const [investigatingId, setInvestigatingId] = useState(null);
  const [notice, setNotice] = useState('Each network is evaluated independently using only its transactions received so far.');
  const positionRef = useRef(0), transactionsRef = useRef([]);
  transactionsRef.current = transactions;

  useEffect(() => {
    let current = true;
    setLoading(true);
    Promise.all(SCENARIOS.map(async scenario => {
      const response = await fetch(`/data/demos/${scenario.file}`);
      if (!response.ok) throw new Error(`${scenario.label} data returned HTTP ${response.status}.`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error(`${scenario.label} data has an unsupported format.`);
      return rows.filter(row => row && row.id != null && row.source != null && row.target != null
        && Number.isFinite(Number(row.amount)) && typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp)))
        .map(row => ({ ...row, id: `${scenario.id}:${String(row.id)}`, source: `${scenario.id}:${String(row.source)}`, target: `${scenario.id}:${String(row.target)}`, amount: Number(row.amount), demo_scenario: scenario.id, scenario_label: scenario.label, region: scenario.region }))
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
    })).then(datasets => {
      if (!current) return;
      const all = datasets.flat().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
      if (!all.length) throw new Error('No usable transactions are available in the synthetic demo datasets.');
      setTransactions(all); transactionsRef.current = all; setLoadError(''); setLoading(false);
    }).catch(error => { if (current) { setLoadError(error.message || 'The synthetic scenario data could not be loaded.'); setLoading(false); } });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!active || status !== 'running' || !transactions.length) return undefined;
    const timer = window.setInterval(() => {
      const next = Math.min(positionRef.current + speed, transactionsRef.current.length);
      positionRef.current = next;
      setPosition(next);
      setNotice(`Evaluating ${next.toLocaleString()} of ${transactionsRef.current.length.toLocaleString()} chronological synthetic transactions. Each network has an independent prefix.`);
      if (next >= transactionsRef.current.length) setStatus('complete');
    }, 300);
    return () => window.clearInterval(timer);
  }, [active, status, speed, transactions]);
  useEffect(() => { if (!active && status === 'running') setStatus('paused'); }, [active, status]);

  const processed = useMemo(() => transactions.slice(0, position), [transactions, position]);
  const results = useMemo(() => SCENARIOS.map(scenario => {
    const ownTransactions = processed.filter(transaction => transaction.demo_scenario === scenario.id);
    const assessed = assessScenario(ownTransactions);
    const clusters = assessed.detectorClusters.map(cluster => ({ ...cluster, id: `${scenario.id}-${cluster.id}`, scenario_label: scenario.label }));
    const alerts = clusters.filter(cluster => assessed.alerts.some(alert => alert.id === cluster.id.replace(`${scenario.id}-`, '')));
    return { ...assessed, clusters, alerts, scenario, transactionCount: ownTransactions.length,
      transactions: ownTransactions, patterns: assessed.patterns.map(pattern => ({ ...pattern, scenarioId: scenario.id })) };
  }), [processed]);
  const alerts = useMemo(() => results.flatMap(result => result.alerts), [results]);
  const detectorClusters = useMemo(() => results.flatMap(result => result.clusters), [results]);
  const alertTransactionIds = useMemo(() => new Set(alerts.flatMap(cluster => cluster.transaction_ids ?? [])), [alerts]);
  const patternTransactionIds = useMemo(() => new Set(results.flatMap(result => result.patterns.flatMap(pattern => pattern.transaction_ids))), [results]);
  const graph = useMemo(() => {
    const accounts = new Map();
    const clusterByTransaction = new Map();
    detectorClusters.forEach(cluster => cluster.transaction_ids.forEach(id => clusterByTransaction.set(id, cluster.id)));
    detectorClusters.forEach(cluster => cluster.accounts.forEach(account => accounts.set(account, [...(accounts.get(account) ?? []), cluster.id])));
    const patternsByAccount = new Map();
    results.forEach(result => result.patterns.forEach(pattern => pattern.accounts.forEach(account => {
      const previous = patternsByAccount.get(account);
      if (!previous || previous.scenarioId === pattern.scenarioId) patternsByAccount.set(account, pattern);
    })));
    const transactionsByScenario = new Map(SCENARIOS.map(scenario => [scenario.id, resultForScenario(results, scenario.id).transactions]));
    const accountIdsByScenario = SCENARIOS.map(scenario => [...new Set((transactionsByScenario.get(scenario.id) ?? []).flatMap(tx => [tx.source, tx.target]))]);
    const nodeIds = new Set(accountIdsByScenario.flat());
    const graphNodes = [];
    const alertRiskByAccount = new Map();
    alerts.forEach(cluster => cluster.accounts.forEach(account => alertRiskByAccount.set(account, Math.max(alertRiskByAccount.get(account) ?? 0, Number(cluster.risk_score ?? 0) / 100))));
    SCENARIOS.forEach(scenario => accountIdsByScenario[scenario.region].forEach((id, index) => {
      const pattern = patternsByAccount.get(id);
      const linkedAlerts = accounts.get(id) ?? [];
      graphNodes.push({ id, label: id.slice(id.indexOf(':') + 1), cluster_ids: linkedAlerts, risk: alertRiskByAccount.get(id) ?? null,
        display_status: linkedAlerts.length ? 'suspicious' : pattern ? 'pattern' : null, region: scenario.region, regionIndex: index });
    }));
    return { nodes: graphNodes, edges: processed.filter(tx => nodeIds.has(tx.source) && nodeIds.has(tx.target)).map(tx => ({ ...tx,
      cluster_id: clusterByTransaction.get(tx.id) ?? '',
      display_status: alertTransactionIds.has(tx.id) ? (tx.id === processed.at(-1)?.id ? 'suspicious' : 'retained-suspicious') : patternTransactionIds.has(tx.id) ? 'pattern' : 'normal'
    })) };
  }, [processed, results, detectorClusters, alerts, alertTransactionIds, patternTransactionIds]);

  const graphItemCluster = graphItem?.clusterId;
  const selected = detectorClusters.find(cluster => cluster.id === (investigatingId ?? graphItemCluster)) ?? alerts[0] ?? null;
  const investigationCluster = alerts.find(cluster => cluster.id === investigatingId) ?? null;
  const selectedTransactions = useMemo(() => selected ? processed.filter(transaction => selected.transaction_ids.includes(transaction.id)) : [], [selected, processed]);
  const period = useMemo(() => {
    if (!selectedTransactions.length) return { start: null, end: null };
    return { start: selectedTransactions[0].timestamp, end: selectedTransactions.at(-1).timestamp };
  }, [selectedTransactions]);
  const onGraphSelect = useCallback((id, item) => setGraphItem(item ? { ...item, clusterId: id } : null), []);
  const restart = () => { positionRef.current = 0; setPosition(0); setGraphItem(null); setInvestigatingId(null); setStatus('idle'); setNotice('Replay reset. Start to process all four synthetic networks.'); };
  const seek = value => { const next = Number(value); positionRef.current = next; setPosition(next); setGraphItem(null); setStatus('paused'); };
  const openInvestigation = cluster => { setInvestigatingId(cluster.id); setGraphItem(null); if (status === 'running') setStatus('paused'); };
  const latest = processed.at(-1) ?? null;

  if (investigatingId && investigationCluster) return <InvestigationMode key={`exception-${investigationCluster.id}`} cluster={investigationCluster} data={{ clusters: alerts, graph }} graphItem={graphItem} onGraphSelect={onGraphSelect} onBack={() => setInvestigatingId(null)} period={period} transactions={processed.filter(transaction => investigationCluster.transaction_ids.includes(transaction.id))} headerExtra={<DemoSelector value={selectedDemo} onChange={onSelectDemo}/>}/>;

  return <main className="app-shell exception-demo-shell">
    <header className="topbar"><a className="brand" href="#/" aria-label="Return to Shell Shocker home"><span className="brand-mark">SS</span><span>Shell Shocker<small>FINANCIAL CRIME INTELLIGENCE</small></span></a><div className="dashboard-nav"><span className="dashboard-current">EXCEPTION DEMO</span><DemoSelector value={selectedDemo} onChange={onSelectDemo}/></div></header>
    <section className="exception-title"><div><span className="eyebrow">SYNTHETIC DEMO DATA · FOUR INDEPENDENT NETWORKS</span><h1>Same patterns. Different behaviour.</h1><p>Replay four account networks together. TRACE evaluates each network separately and requires connected evidence before raising an AML alert.</p></div><span className={`exception-status ${alerts.length ? 'alert' : status === 'running' ? 'pattern' : ''}`}>{alerts.length ? `${alerts.length} EVIDENCE-SUPPORTED ALERT${alerts.length === 1 ? '' : 'S'}` : status === 'running' ? 'REPLAYING ALL NETWORKS' : status === 'complete' ? 'REPLAY COMPLETE' : 'READY'}</span></section>
    <section className="exception-controls"><div className="exception-control-row"><span className="exception-data-note">SYNTHETIC DATA · ALL FOUR NETWORKS RUN ON ONE CHRONOLOGICAL REPLAY</span><div className="exception-playback"><button className="live-start" disabled={loading || !!loadError || !transactions.length || status === 'running' || status === 'complete'} onClick={() => setStatus('running')}>{status === 'paused' ? 'Resume' : 'Start'} replay <span>▶</span></button><button disabled={status !== 'running'} onClick={() => setStatus('paused')}>Pause</button><button disabled={!transactions.length} onClick={restart}>Restart</button><label>Playback speed <select value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[1, 2, 5, 10].map(value => <option key={value} value={value}>{value}x</option>)}</select></label></div></div>
      <div className="exception-progress"><span>TRANSACTIONS PROCESSED</span><b>{position.toLocaleString()} / {transactions.length.toLocaleString()}</b><input type="range" min="0" max={transactions.length} value={position} disabled={!transactions.length} aria-label="Exception demo replay position" aria-valuetext={`${position} of ${transactions.length} transactions processed`} onChange={event => seek(event.target.value)}/><small>{latest ? `${latest.id} · ${formatTimestamp(latest.timestamp)} · ${latest.scenario_label}` : loading ? 'Loading four synthetic datasets' : 'Waiting for replay to start'}</small></div>
    </section>
    {loadError && <div className="live-error" role="alert">{loadError}</div>}
    {loading && <div className="live-loading">Loading four synthetic demo datasets…</div>}
    {!loading && !loadError && <>
      <div className={`exception-decision ${alerts.length ? 'alert' : ''}`} aria-live="polite"><div><span className="eyebrow">INDEPENDENT PREFIX EVALUATION</span><h2>{alerts.length ? 'Suspicious connected activity is supported by current evidence' : 'Patterns are assessed in context'}</h2><p>{notice} Fan-in and fan-out are structural patterns. Either one alone is not proof of money laundering.</p></div><div className="exception-assessment"><span>NETWORKS REPLAYED</span><b>4 independent datasets</b><span>TRANSACTIONS RECEIVED</span><b>{position.toLocaleString()} / {transactions.length.toLocaleString()}</b><span>RISK-RANKED ALERTS</span><b>{alerts.length}</b></div></div>
      <section className="exception-shared-graph"><div className="exception-shared-heading"><div><span className="eyebrow">ONE SHARED CYTOSCAPE GRAPH</span><h2>Four independent transaction networks</h2></div><span>{graph.nodes.length} ACCOUNTS · {graph.edges.length} VISIBLE TRANSFERS</span></div><p>All four regions share this graph and chronological replay. Namespaced account and transaction IDs keep independent examples disconnected.</p>{active ? <Suspense fallback={<div className="graph-loading">Loading shared transaction graph…</div>}><GraphView graph={graph} clusters={detectorClusters} selected={selected} graphItem={graphItem} onSelect={onGraphSelect} incremental latestTransactionId={latest?.id} regions={REGIONS}/></Suspense> : <div className="graph-loading">Shared graph paused while another demo is selected.</div>}<div className="exception-graph-legend"><span><i className="legend-pattern"/>FAN-IN / FAN-OUT PATTERN</span><span><i className="legend-suspicious"/>CURRENT SUSPICIOUS TRANSFER</span><span><i className="legend-retained"/>RETAINED SUSPICIOUS PATH</span><span><i className="legend-normal"/>OTHER TRANSACTIONS</span></div></section>

      <section className="exception-comparison"><div className="exception-comparison-heading"><div><span className="eyebrow">ACTUAL PREFIX DETECTION AND EVIDENCE</span><h2>HOW TRACE DISTINGUISHES LEGITIMATE ACTIVITY FROM MONEY LAUNDERING</h2></div><p>Each column uses the transactions received so far for that network and the existing detector and scoring rules.</p></div><div className="comparison-table-wrap"><table className="comparison-table exception-four-column"><thead><tr><th scope="col">MEASURE</th>{results.map(result => <th key={result.scenario.id} scope="col">{result.scenario.label}</th>)}</tr></thead><tbody>
        <tr><th scope="row">Detected pattern</th>{results.map(result => <td key={result.scenario.id}>{result.patterns.length ? result.patterns.map(pattern => <span className="exception-pattern-line" key={`${pattern.direction}-${pattern.hub}`}>{pattern.direction === 'fan_in' ? 'Fan-in' : 'Fan-out'} · {pattern.source_count} counterparties · {pattern.hub}</span>) : result.observedTypologies.length ? result.observedTypologies.map(type => <span className="exception-pattern-line" key={type}>{TYPOLOGY[type]?.label ?? type}</span>) : 'Not detected yet'}</td>)}</tr>
        <tr><th scope="row">Detector evidence</th>{results.map(result => <td key={result.scenario.id}>{result.observedTypologies.length ? <div className="alert-typologies">{result.observedTypologies.map(type => <TypologyBadge key={type} value={type}/>)}</div> : result.patterns.length ? 'Structural flow only; no additional typology evidence' : 'Awaiting sufficient transactions'}</td>)}</tr>
        <tr><th scope="row">Risk assessment</th>{results.map(result => <td key={result.scenario.id}>{result.alerts[0] ? `${result.alerts[0].risk_score}/100 · ${riskBand(result.alerts[0].risk_score)?.label ?? 'Ranked'}` : result.clusters[0] ? `${result.clusters[0].risk_score}/100 · structural pattern only` : 'No risk-ranked cluster'}</td>)}</tr>
        <tr><th scope="row">Alert outcome</th>{results.map(result => <td key={result.scenario.id} className={result.alerts.length ? 'comparison-alert-cell' : ''}>{scenarioOutcome(result)}</td>)}</tr>
        </tbody></table></div><strong className="comparison-takeaway">SAME TRANSACTION PATTERNS. DIFFERENT BEHAVIOUR. SMARTER DETECTION.</strong></section>

      <div className="exception-layout"><section className="exception-feed"><PanelTitle eyebrow="COMPLETE CHRONOLOGICAL EVENT FEED" count={`${position} / ${transactions.length}`}>All four transaction histories</PanelTitle><p>Every processed source record remains in the replay and is submitted only to its own network’s detector prefix.</p>{processed.length ? <div className="live-feed-list"><div className="live-feed-head"><span>TRANSACTION</span><span>NETWORK · SENDER → RECEIVER</span><span>AMOUNT</span><span>TIMESTAMP</span></div>{processed.slice(-16).reverse().map(tx => <div className={`live-feed-row ${alertTransactionIds.has(tx.id) ? 'evidence-row' : ''}`} key={tx.id}><span>{tx.id.split(':').at(-1)}</span><b>{tx.scenario_label} · {tx.source} <i>→</i> {tx.target}</b><strong>{money(tx.amount)}</strong><time>{formatTimestamp(tx.timestamp)}</time></div>)}</div> : <div className="live-empty">Transactions from all four networks will appear here as replay advances.</div>}</section>
        <aside className="exception-alert-column"><PanelTitle eyebrow="EXISTING PREFIX DETECTOR · EXISTING SCORING" count={alerts.length}>Evidence-supported alerts</PanelTitle><p className="exception-alert-note">Structural fan-in and fan-out alone do not enter the AML alert list. Connected typologies and corroborating movement are evaluated separately in each dataset.</p>{alerts.length ? <div className="live-alert-list">{alerts.map(cluster => { const band = riskBand(cluster.risk_score); return <article className="live-alert" key={cluster.id}><div className="live-alert-top"><span>{cluster.id} · {cluster.scenario_label}</span><span className={`severity-badge ${band?.id ?? 'unavailable'}`}>{band?.label ?? 'Unavailable'}</span></div><div className="live-alert-score"><b>{cluster.risk_score}</b><small>/ 100 · DETECTOR RISK SCORE</small><strong>{money(cluster.total_amount)}</strong></div><div className="alert-typologies">{cluster.typologies.map(type => <TypologyBadge key={type} value={type}/>)}</div><p>{cluster.summary}</p><div className="live-alert-meta"><span>{cluster.accounts.length} accounts</span><span>{cluster.transaction_ids.length} transfers</span></div><button onClick={() => openInvestigation(cluster)}>Investigate evidence <span>↗</span></button></article>; })}</div> : <div className="live-alert-empty"><span>NO EVIDENCE-SUPPORTED ALERTS AT THIS PREFIX</span><p>Structural patterns remain visible in the graph and comparison. An alert appears only when separate connected evidence is found.</p></div>}</aside></div>
      <footer><span>Shell Shocker · EXCEPTION DEMO</span><span>SYNTHETIC DEMONSTRATION · NOT A REAL AML FINDING</span></footer>
    </>}
  </main>;
}

function resultForScenario(results, id) { return results.find(result => result.scenario.id === id) ?? { transactions: [] }; }

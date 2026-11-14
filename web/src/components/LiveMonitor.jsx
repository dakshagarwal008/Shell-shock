import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InvestigationMode from './InvestigationMode.jsx';
import { TypologyBadge } from './ClusterTable.jsx';
import DemoSelector from './DemoSelector.jsx';
import { formatTimestamp, money, riskBand, TYPOLOGY } from '../utils/clusterDisplay.js';
import { selectVisibleGraphTransactions } from '../utils/graphRetention.js';

const GraphView = lazy(() => import('./GraphView.jsx'));
const CHECKPOINT_SIZE = 50;

function reconcileAlerts(found, previous, nextIdRef) {
  const used = new Set();
  return found.map(cluster => {
    const tx = new Set(cluster.transaction_ids);
    let match = null, best = 0;
    for (const prior of previous) {
      if (used.has(prior.id) || !prior.transaction_ids?.length) continue;
      const overlap = prior.transaction_ids.reduce((n, id) => n + Number(tx.has(id)), 0);
      const ratio = overlap / Math.max(1, Math.min(prior.transaction_ids.length, tx.size));
      if (ratio > best && cluster.typologies.some(type => prior.typologies?.includes(type))) { best = ratio; match = prior; }
    }
    const id = match && best >= .2 ? match.id : `LIVE-${String(++nextIdRef.current).padStart(3, '0')}`;
    if (match && best >= .2) used.add(match.id);
    return { ...cluster, id, live: true };
  });
}

function Typologies({ values = [] }) { return <div className="alert-typologies">{values.map(value => <TypologyBadge key={value} value={value}/>)}</div>; }

export default function LiveMonitor({ active = true, selectedDemo = 'live', onSelectDemo = () => {} }) {
  const [transactions, setTransactions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('idle');
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [clusters, setClusters] = useState([]);
  const [graphItem, setGraphItem] = useState(null);
  const [investigatingId, setInvestigatingId] = useState(null);
  const [tps, setTps] = useState(0);
  const [notice, setNotice] = useState('');
  const workerRef = useRef(null), positionRef = useRef(0), transactionsRef = useRef([]), clustersRef = useRef([]);
  const busyRef = useRef(false), requestRef = useRef(0), nextIdRef = useRef(0), elapsedStartRef = useRef(null), lastTpsRef = useRef({ time: Date.now(), position: 0 });
  transactionsRef.current = transactions ?? [];
  clustersRef.current = clusters;

  useEffect(() => {
    let active = true;
    fetch('/data/transactions.json').then(response => { if (!response.ok) throw new Error(`Transaction feed returned HTTP ${response.status}.`); return response.json(); }).then(rows => {
      if (!Array.isArray(rows)) throw new Error('The historical transaction feed has an unsupported format.');
      const valid = rows.filter(row => row && row.id != null && row.source != null && row.target != null && Number.isFinite(Number(row.amount)) && typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp))).map(row => ({ ...row, id: String(row.id), source: String(row.source), target: String(row.target), amount: Number(row.amount) })).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a.id.localeCompare(b.id));
      if (active) { setTransactions(valid); if (!valid.length) setLoadError('No usable historical transactions were found.'); }
    }).catch(error => { if (active) setLoadError(error.message || 'The historical transaction feed could not be loaded.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/liveDetection.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = event => {
      const { requestId, clusters: found, error } = event.data ?? {};
      if (requestId !== requestRef.current) return;
      busyRef.current = false;
      if (error) { setNotice(`Detection update failed: ${error}`); return; }
      const previousIds = new Set(clustersRef.current.map(cluster => cluster.id));
      const next = reconcileAlerts(found ?? [], clustersRef.current, nextIdRef);
      clustersRef.current = next;
      setClusters(next);
      const newAlerts = next.filter(cluster => !previousIds.has(cluster.id)).length;
      setNotice(newAlerts ? `${newAlerts} new alert${newAlerts === 1 ? '' : 's'} detected from the latest transaction prefix.` : next.length ? `${next.length} developing alert${next.length === 1 ? '' : 's'} in this transaction prefix.` : 'No suspicious patterns meet detection thresholds yet.');
    };
    worker.onerror = () => { busyRef.current = false; setNotice('Prefix analysis worker encountered an error.'); };
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  const analyze = useCallback(prefix => {
    if (!workerRef.current || busyRef.current) return;
    busyRef.current = true;
    const requestId = ++requestRef.current;
    workerRef.current.postMessage({ requestId, transactions: prefix });
  }, []);

  useEffect(() => {
    if (!active || status !== 'running' || !transactions?.length) return undefined;
    const cadence = 100;
    const timer = window.setInterval(() => {
      if (busyRef.current) return;
      const current = positionRef.current;
      if (current >= transactionsRef.current.length) { setStatus('complete'); return; }
      const step = Math.max(1, speed);
      const nextPosition = Math.min(current + step, transactionsRef.current.length);
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      if (!elapsedStartRef.current) elapsedStartRef.current = Date.now();
      if (nextPosition % CHECKPOINT_SIZE < step || nextPosition === transactionsRef.current.length) analyze(transactionsRef.current.slice(0, nextPosition));
      if (nextPosition === transactionsRef.current.length) setStatus('complete');
    }, cadence);
    return () => window.clearInterval(timer);
  }, [active, status, speed, transactions, analyze]);

  useEffect(() => { if (!active && status === 'running') setStatus('paused'); }, [active, status]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now(), prior = lastTpsRef.current, current = positionRef.current;
      setTps(Math.max(0, Math.round((current - prior.position) / Math.max(.25, (now - prior.time) / 1000))));
      lastTpsRef.current = { time: now, position: current };
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const processed = useMemo(() => (transactions ?? []).slice(0, position), [transactions, position]);
  const latest = processed.at(-1) ?? null;
  const clusterIdsByAccount = useMemo(() => {
    const map = new Map();
    clusters.forEach(cluster => cluster.accounts.forEach(account => { if (!map.has(account)) map.set(account, []); map.get(account).push(cluster.id); }));
    return map;
  }, [clusters]);
  const graph = useMemo(() => {
    const clusterByTransaction = new Map();
    clusters.forEach(cluster => cluster.transaction_ids.forEach(id => { if (!clusterByTransaction.has(id)) clusterByTransaction.set(id, cluster.id); }));
    const { transactions: visibleTransactions, suspiciousIds } = selectVisibleGraphTransactions(processed, clusters);
    const accountIds = new Set(visibleTransactions.flatMap(transaction => [transaction.source, transaction.target]));
    clusters.forEach(cluster => cluster.accounts.forEach(account => accountIds.add(account)));
    const riskByAccount = new Map();
    clusters.forEach(cluster => cluster.accounts.forEach(account => riskByAccount.set(account, Math.max(riskByAccount.get(account) ?? 0, Number(cluster.risk_score ?? 0) / 100))));
    return {
      nodes: [...accountIds].map(id => ({ id, label: id, cluster_ids: clusterIdsByAccount.get(id) ?? [], risk: riskByAccount.get(id) ?? null })),
      edges: visibleTransactions.map(transaction => ({ ...transaction, cluster_id: clusterByTransaction.get(transaction.id) ?? '', display_status: suspiciousIds.has(String(transaction.id)) ? (transaction.id === latest?.id ? 'suspicious' : 'retained-suspicious') : 'normal' }))
    };
  }, [processed, clusters, clusterIdsByAccount, position, latest?.id]);
  const selected = clusters.find(cluster => cluster.id === (investigatingId ?? graphItem?.clusterId)) ?? clusters[0] ?? null;
  const transactionsByCluster = useMemo(() => selected ? processed.filter(transaction => selected.transaction_ids.includes(transaction.id)) : [], [processed, selected]);
  const period = useMemo(() => {
    if (!transactionsByCluster.length) return { start: null, end: null };
    const ordered = [...transactionsByCluster].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    return { start: ordered[0].timestamp, end: ordered.at(-1).timestamp };
  }, [transactionsByCluster]);
  const onGraphSelect = useCallback((id, item) => { setGraphItem(item ? { ...item, clusterId: id } : null); }, []);
  const restart = () => {
    requestRef.current += 1;
    positionRef.current = 0; setPosition(0); setClusters([]); clustersRef.current = []; setGraphItem(null); setInvestigatingId(null); setTps(0); setNotice('Replay reset. Start to process historical activity.'); setStatus('idle'); busyRef.current = false; nextIdRef.current = 0; elapsedStartRef.current = null; lastTpsRef.current = { time: Date.now(), position: 0 };
  };
  const seek = value => {
    const next = Number(value);
    requestRef.current += 1; busyRef.current = false; setClusters([]); clustersRef.current = [];
    positionRef.current = next; setPosition(next); setGraphItem(null); setStatus('paused');
    const aligned = next === 0 ? [] : transactionsRef.current.slice(0, next);
    if (next === 0) { setClusters([]); clustersRef.current = []; } else analyze(aligned);
  };
  const alertClick = cluster => { setInvestigatingId(cluster.id); setGraphItem(null); if (status === 'running') setStatus('paused'); };

  if (investigatingId && selected) {
    const investigationData = { clusters, graph };
    return <InvestigationMode key={`live-${selected.id}`} cluster={selected} data={investigationData} graphItem={graphItem} onGraphSelect={onGraphSelect} onBack={() => setInvestigatingId(null)} period={period} transactions={transactionsByCluster} headerExtra={<DemoSelector value={selectedDemo} onChange={onSelectDemo}/>}/>;
  }

  return <main className="app-shell live-monitor-shell">
    <header className="topbar"><a className="brand" href="#/" aria-label="Return to Shell Shocker home"><span className="brand-mark">SS</span><span>Shell Shocker<small>FINANCIAL CRIME INTELLIGENCE</small></span></a><div className="dashboard-nav"><span className="dashboard-current">LIVE MONITOR</span><span className="topbar-date">HISTORICAL SIMULATION</span><DemoSelector value={selectedDemo} onChange={onSelectDemo}/></div></header>
    <section className="live-title"><div><span className="eyebrow">REPLAY ENVIRONMENT · HISTORICAL DATA ONLY</span><h1>Live Monitor</h1><p>Replay real recorded transactions through the existing detection rules. This is a simulation, not live banking data.</p></div><span className={`live-state ${status}`}><i/>{status === 'running' ? 'LIVE SIMULATION' : status === 'complete' ? 'REPLAY COMPLETE' : status === 'paused' ? 'PAUSED' : 'READY'}</span></section>
    {loadError && <div className="live-error" role="alert">{loadError}</div>}
    {transactions && <section className="live-stats" aria-label="Live simulation status">
      <div title="Current state of the historical replay."><small>STATUS</small><b>{status === 'running' ? 'Monitoring' : status === 'paused' ? 'Paused' : status === 'complete' ? 'Complete' : 'Ready'}</b><span className="live-stat-description">Replay state</span></div>
      <div title="Number of historical transaction records replayed so far, out of the full feed."><small>TRANSACTIONS PROCESSED</small><b>{position.toLocaleString()} <i>/ {transactions.length.toLocaleString()}</i></b><span className="live-stat-description">Processed / total records</span></div>
      <div title="Transaction records processed during the most recent one-second interval."><small>TRANSACTIONS / SECOND</small><b>{status === 'running' ? tps : 0}</b><span className="live-stat-description">Records in the last second</span></div>
      <div title="Suspicious clusters currently detected in the arrived transaction prefix."><small>SUSPICIOUS PATTERNS</small><b>{clusters.length}</b><span className="live-stat-description">Matches at current prefix</span></div>
      <div title="Current replay alerts; each detected cluster is represented once."><small>DEVELOPING ALERTS</small><b>{clusters.length}</b><span className="live-stat-description">Current prefix alerts</span></div>
    </section>}
    <section className="live-controls" aria-label="Transaction replay controls">
      <div className="live-control-buttons"><button className="live-start" disabled={!transactions?.length || status === 'running' || status === 'complete'} onClick={() => { setStatus('running'); lastTpsRef.current={time:Date.now(),position:positionRef.current}; }}>{status === 'paused' ? 'Resume replay' : 'Start replay'} <span>▶</span></button><button disabled={status !== 'running'} onClick={() => setStatus('paused')}>Pause</button><button disabled={!transactions?.length} onClick={restart}>Restart</button><label>Playback speed <select value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[1,2,5,10].map(value=><option value={value} key={value}>{value}x</option>)}</select></label></div>
      <div className="live-progress"><div><span>REPLAY PROGRESS</span><b>{transactions?.length ? Math.round(position / transactions.length * 100) : 0}%</b><small>{latest ? `${latest.id} · ${formatTimestamp(latest.timestamp)}` : 'Waiting for replay to start'}</small></div><input aria-label="Replay transaction position" aria-valuetext={`${position} of ${transactions?.length ?? 0} transactions processed`} type="range" min="0" max={transactions?.length ?? 0} value={position} disabled={!transactions?.length} onChange={event => seek(event.target.value)}/><div className="live-progress-ends"><span>Start</span><span>{transactions?.length ? `${position.toLocaleString()} / ${transactions.length.toLocaleString()} records` : 'Loading transaction feed'}</span><span>End</span></div></div>
    </section>
    {!transactions && !loadError && <div className="live-loading">Loading historical transactions…</div>}
    {transactions && <div className="live-layout">
      <section className="live-graph-column"><div className="live-section-title"><div><span className="eyebrow">INCREMENTAL TRANSACTION NETWORK</span><h2>Activity as it arrives</h2></div><span>{graph.nodes.length} ACCOUNTS · {graph.edges.length} VISIBLE / {processed.length} PROCESSED</span></div><p className="graph-retention-note">Normal edges stay visible for at least 40 later replay records; above 160 ordinary edges, the oldest eligible edge expires first. Suspicious paths remain pinned. Replay history and detection always retain every processed transaction.</p><Suspense fallback={<div className="graph-loading">Loading transaction network…</div>}><GraphView graph={graph} clusters={clusters} selected={selected} graphItem={graphItem} onSelect={onGraphSelect} incremental latestTransactionId={latest?.id}/></Suspense>
      <div className="live-feed"><div className="live-section-title"><div><span className="eyebrow">LATEST RECORDS</span><h2>Recent transaction feed</h2></div><span>{processed.length ? `LATEST ${Math.min(8, processed.length)} OF ${processed.length}` : 'AWAITING ACTIVITY'}</span></div>{processed.length ? <div className="live-feed-list"><div className="live-feed-head"><span>TRANSACTION</span><span>SENDER → RECEIVER</span><span>AMOUNT</span><span>TIMESTAMP</span></div>{processed.slice(-8).reverse().map(transaction=><div className={`live-feed-row ${transaction.id===latest?.id?'newest':''}`} key={transaction.id}><span>{transaction.id}</span><b>{transaction.source} <i>→</i> {transaction.target}</b><strong>{money(transaction.amount)}</strong><time>{formatTimestamp(transaction.timestamp)}</time></div>)}</div> : <p className="live-empty">Transactions will appear here as the replay advances.</p>}</div></section>
      <aside className="live-alert-column"><div className="live-section-title"><div><span className="eyebrow">PREFIX-BASED DETECTION</span><h2>Developing alerts <span>{clusters.length}</span></h2></div></div><p className="live-alert-note">Recomputed from arrived transactions only using the existing fan-in, fan-out, cycle, pass-through and scoring rules.</p>{notice && <p className="live-notice" aria-live="polite">{notice}</p>}{clusters.length ? <div className="live-alert-list">{clusters.map(cluster=>{const band=riskBand(cluster.risk_score);return <article className="live-alert" key={cluster.id}><div className="live-alert-top"><span>{cluster.id}</span><span className={`severity-badge ${band?.id??'unavailable'}`}>{band?.label??'Unavailable'}</span></div><div className="live-alert-score"><b>{cluster.risk_score}</b><small>/ 100 · RISK SCORE</small><strong>{money(cluster.total_amount)}</strong></div><Typologies values={cluster.typologies}/><p>{cluster.summary || 'Detection evidence is available from the current transaction prefix.'}</p><div className="live-alert-meta"><span>{cluster.accounts.length} accounts</span><span>{cluster.transaction_ids.length} transfers</span></div><button onClick={()=>alertClick(cluster)}>Investigate this alert <span>↗</span></button></article>;})}</div> : <div className="live-alert-empty"><span>NO ALERTS AT THIS PREFIX</span><p>As transactions are replayed, patterns will appear here when the current backend detection thresholds are met.</p></div>}</aside>
    </div>}
    <footer><span>Shell Shocker <i>·</i> LIVE SIMULATION</span><span>HISTORICAL TRANSACTIONS · NOT LIVE FINANCIAL DATA</span></footer>
  </main>;
}

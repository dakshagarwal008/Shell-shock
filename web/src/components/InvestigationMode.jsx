import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import DetailPanel from './DetailPanel.jsx';
import MoneyTrailReplay from './MoneyTrailReplay.jsx';
import { TypologyBadge } from './ClusterTable.jsx';
import { formatTimestamp, money, riskBand } from '../utils/clusterDisplay.js';

const GraphView = lazy(() => import('./GraphView.jsx'));

function periodLabel(period) {
  if (!period?.start || !period?.end) return 'Unavailable';
  const start = formatTimestamp(period.start);
  const end = formatTimestamp(period.end);
  return start === end ? start : `${start} — ${end}`;
}

export default function InvestigationMode({ cluster, data, graphItem, onGraphSelect, onBack, period, transactions }) {
  const [replayTransactionId, setReplayTransactionId] = useState(null);
  const [evidenceAccountIds, setEvidenceAccountIds] = useState([]);
  const band = riskBand(cluster.risk_score);
  const typologies = Array.isArray(cluster.typologies) ? cluster.typologies : [];
  const accounts = Array.isArray(cluster.accounts) ? cluster.accounts : [];
  const transactionIds = Array.isArray(cluster.transaction_ids) ? cluster.transaction_ids : [];
  const handleActiveTransaction = useCallback(id => setReplayTransactionId(id), []);
  const handleEvidenceFocus = useCallback(accountIds => setEvidenceAccountIds(accountIds), []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `Shell Shocker | ${cluster.id} Investigation`;
    return () => { document.title = previousTitle; };
  }, [cluster.id]);
  useEffect(() => {
    setEvidenceAccountIds([]);
    setReplayTransactionId(null);
  }, [cluster.id]);

  return <main className="app-shell investigation-mode-shell">
    <header className="topbar investigation-topbar">
      <a className="brand" href="#/" aria-label="Return to Shell Shocker home"><span className="brand-mark">SS</span><span>Shell Shocker<small>FINANCIAL CRIME INTELLIGENCE</small></span></a>
      <div className="investigation-actions"><span className="investigation-route-label">INVESTIGATION MODE</span><button className="refresh-button" onClick={onBack}>Back to alerts</button><button className="report-button" onClick={() => window.print()}>Export Investigation Report <span>PDF / Print</span></button></div>
    </header>

    <section className="investigation-page-heading"><div><span className="eyebrow">CLUSTER ALERT · {cluster.id} · DETECTION RANK {String(cluster.rank ?? '—').padStart(2, '0')}</span><h1>Investigation Mode</h1><p>Review the alert, replay its timestamped transfers, and inspect the backend evidence.</p></div><span className="investigation-page-score" style={band ? { '--severity-color': band.color } : undefined}><small>RISK SCORE</small><b>{cluster.risk_score ?? 'Unavailable'}<i>{cluster.risk_score != null ? '/100' : ''}</i></b><span className={`severity-badge ${band?.id ?? 'unavailable'}`}>{band?.label ?? 'Unavailable'}</span></span></section>

    <section className="investigation-overview" aria-label="Alert overview">
      <div><small>CLUSTER / ALERT ID</small><b>{cluster.id}</b></div>
      <div><small>TOTAL TRANSACTION AMOUNT</small><b>{money(cluster.total_amount)}</b></div>
      <div><small>ACCOUNTS INVOLVED</small><b>{accounts.length || 'Unavailable'}</b></div>
      <div><small>TRANSACTIONS</small><b>{transactionIds.length || 'Unavailable'}</b></div>
      <div><small>TIME SPAN</small><b>{cluster.time_span_hours != null ? `${cluster.time_span_hours} hours` : 'Unavailable'}</b></div>
      <div className="overview-period"><small>TRANSACTION PERIOD</small><b>{periodLabel(period)}</b></div>
      <div className="overview-typologies"><small>DETECTED TYPOLOGY</small>{typologies.length ? <div className="alert-typologies">{typologies.map(value => <TypologyBadge key={value} value={value}/>)}</div> : <b>Unavailable</b>}</div>
    </section>

    <div className="investigation-main-grid">
      <div className="investigation-graph-column">
        <div className="investigation-graph-caption"><div><span className="eyebrow">SUSPICIOUS TRANSACTION PATH</span><p>Accounts are nodes. Directed edges represent the supplied transfers.</p></div><span>{accounts.length} ACCOUNTS · {transactions.length} GRAPH RECORDS</span></div>
        <Suspense fallback={<div className="graph-loading">Loading transaction network…</div>}><GraphView graph={data.graph} clusters={data.clusters} selected={cluster} graphItem={graphItem} onSelect={onGraphSelect} replayTransactionId={replayTransactionId} evidenceAccountIds={evidenceAccountIds}/></Suspense>
      </div>
      <MoneyTrailReplay key={cluster.id} cluster={cluster} graph={data.graph} onActiveTransaction={handleActiveTransaction}/>
    </div>

    <DetailPanel cluster={cluster} graphItem={graphItem} period={period} transactions={transactions} investigationMode onFocusEvidence={handleEvidenceFocus}/>
    <footer className="investigation-footer"><span>Shell Shocker · INVESTIGATION REPORT</span><span>Generated from supplied cluster and transaction data</span></footer>
  </main>;
}

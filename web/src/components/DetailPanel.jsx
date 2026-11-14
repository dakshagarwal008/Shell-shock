import { TypologyBadge } from './ClusterTable.jsx';
import { formatTimestamp, money, riskBand } from '../utils/clusterDisplay.js';

function EvidenceSummary({ summary, accounts = [], onFocusEvidence }) {
  if (typeof summary !== 'string' || !summary.trim()) return <p className="muted compact">Detection evidence summary was not supplied for this alert.</p>;
  const evidenceText = summary.replace(/\s*Typologies:.*\.?$/i, '').trim();
  const statements = evidenceText.split(/;\s*/).map(statement => statement.replace(/\.$/, '').trim()).filter(Boolean);
  const accountReferences = statement => accounts.filter(account => {
    const escaped = String(account).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i').test(statement);
  });
  return statements.length > 1 || onFocusEvidence
    ? <ol className="evidence-list">{statements.map((statement, index) => {
      const references = accountReferences(statement);
      return <li key={`${statement}-${index}`}><p>{statement}</p>{onFocusEvidence && <button className="evidence-focus-button" disabled={!references.length} onClick={() => onFocusEvidence(references)}>{references.length ? `Focus graph accounts: ${references.join(' · ')}` : 'No account references in this evidence'}</button>}</li>;
    })}</ol>
    : <p className="evidence-copy">{evidenceText || summary}</p>;
}

function periodLabel(period) {
  if (!period?.start || !period?.end) return 'Unavailable';
  const start = formatTimestamp(period.start);
  const end = formatTimestamp(period.end);
  return start === end ? start : `${start} — ${end}`;
}

export default function DetailPanel({ cluster, graphItem, period, transactions = [], onInvestigate, investigationMode = false, onFocusEvidence }) {
  if (!cluster) return <section className="detail-card empty-detail"><span className="eyebrow">CLUSTER ALERT INVESTIGATION</span><p>Select an alert to review its evidence and transaction trail.</p></section>;
  const factors = Array.isArray(cluster.risk_factors) ? cluster.risk_factors.filter(Boolean) : [];
  const transactionIds = Array.isArray(cluster.transaction_ids) ? cluster.transaction_ids : [];
  const accounts = Array.isArray(cluster.accounts) ? cluster.accounts : [];
  const typologies = Array.isArray(cluster.typologies) ? cluster.typologies : [];
  const band = riskBand(cluster.risk_score);
  const transactionById = new Map(transactions.map(transaction => [String(transaction.id), transaction]));
  const chronologicalIds = [...transactionIds].sort((left, right) => {
    const leftTime = Date.parse(transactionById.get(String(left))?.timestamp ?? '');
    const rightTime = Date.parse(transactionById.get(String(right))?.timestamp ?? '');
    const leftKnown = Number.isFinite(leftTime);
    const rightKnown = Number.isFinite(rightTime);
    if (leftKnown && rightKnown) return leftTime - rightTime;
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
    return String(left).localeCompare(String(right));
  });

  return <section className="detail-card investigation-card" aria-label={`Investigation for cluster alert ${cluster.id}`}>
    <div className="investigation-heading">
      <div><span className="eyebrow">CLUSTER ALERT · {cluster.id}</span><h3>Cluster money trail</h3><span className="investigation-rank">DETECTION RANK {String(cluster.rank ?? '—').padStart(2, '0')}</span>{onInvestigate && !investigationMode && <button className="open-investigation-button" onClick={onInvestigate}>Open Investigation Mode <span aria-hidden="true">↗</span></button>}</div>
      <div className="investigation-score" style={band ? { '--severity-color': band.color } : undefined}><small title="Backend suspiciousness score used to prioritize investigation. It is not proof of criminal activity.">RISK SCORE</small><b title="A prioritization score, not a determination of criminal activity.">{cluster.risk_score ?? '—'}<span>/100</span></b><span className={`severity-badge ${band?.id ?? 'unavailable'}`}>{band?.label ?? 'Unavailable'}</span></div>
    </div>

    <div className="investigation-typologies"><span className="detail-subhead-label">DETECTED TYPOLOGY</span>{typologies.length ? <div className="alert-typologies">{typologies.map(value => <TypologyBadge key={value} value={value}/>)}</div> : <span className="muted compact">Unavailable</span>}</div>

    <div className="investigation-stats">
      <div title="Sum of the transaction amounts included in this detected cluster."><small>TOTAL TRANSACTION AMOUNT</small><b>{money(cluster.total_amount)}</b></div>
      <div title="Elapsed time between the earliest and latest transaction in this cluster."><small>TIME SPAN</small><b>{cluster.time_span_hours != null ? `${cluster.time_span_hours} hours` : 'Unavailable'}</b></div>
      <div><small>TRANSACTION PERIOD</small><b>{periodLabel(period)}</b></div>
      <div><small>ACCOUNTS / TRANSACTIONS</small><b>{accounts.length} / {transactionIds.length}</b></div>
    </div>

    {graphItem && <div className="selected-graph-item"><div className="detail-subhead"><span>SELECTED {graphItem.type === 'account' ? 'ACCOUNT' : 'TRANSACTION'}</span><small>{graphItem.id}</small></div>{graphItem.type === 'account' ? <><div className="selected-item-meta"><span>Account <b>{graphItem.label}</b></span>{graphItem.risk != null && <span>Risk value <b>{Number(graphItem.risk).toLocaleString(undefined, { maximumFractionDigits: 3 })}</b></span>}<span>Related transfers <b>{graphItem.connections?.length ?? 0}</b></span></div>{graphItem.connections?.length > 0 && <div className="connection-list">{graphItem.connections.map(connection => <span key={connection.id}><b>{connection.source} → {connection.target}</b><small>{connection.id} · {money(connection.amount)} · {formatTimestamp(connection.timestamp)}</small></span>)}</div>}</> : <div className="selected-item-meta"><span>From <b>{graphItem.source}</b></span><span>To <b>{graphItem.target}</b></span><span>Amount <b>{money(graphItem.amount)}</b></span><span>Time <b>{formatTimestamp(graphItem.timestamp)}</b></span></div>}</div>}

    <div className="detail-divider"/>
    <section className="explanation-section" aria-labelledby="flagged-heading"><div className="investigation-section-heading"><div><span className="eyebrow">DETECTION RATIONALE</span><h4 id="flagged-heading">{investigationMode ? 'Why Shell Shocker flagged this' : 'Why was this flagged?'}</h4></div><span className="evidence-source">BACKEND SUMMARY</span></div><EvidenceSummary summary={cluster.summary} accounts={accounts} onFocusEvidence={investigationMode ? onFocusEvidence : null}/>{investigationMode && <p className="evidence-provenance">The backend supplies this explanation at cluster level. Account references focus their actual cluster nodes and connected transfers; replay follows timestamped transaction records.</p>}</section>

    <div className="detail-divider"/>
    <div className="detail-subhead"><span>ACCOUNTS IN THE NETWORK</span><small>{accounts.length} ACCOUNTS</small></div>
    {accounts.length ? <div className="account-list">{accounts.map((account, index) => <span key={`${account}-${index}`}><i>{String(index + 1).padStart(2, '0')}</i>{account}</span>)}</div> : <p className="muted compact">Account list unavailable.</p>}

    <div className="detail-divider"/>
    <div className="detail-subhead"><span>TRANSACTION TRAIL</span><small>{transactionIds.length} TRANSFERS</small></div>
    {transactionIds.length ? <div className="transaction-trail">{chronologicalIds.map(id => {
      const transaction = transactionById.get(String(id));
      return <div className="transaction-row" key={id}><span className="transaction-id">{id}</span><span className="transaction-route">{transaction ? <>{transaction.source} <i>→</i> {transaction.target}</> : 'Route unavailable'}</span><span className="transaction-amount">{transaction ? money(transaction.amount) : 'Amount unavailable'}</span><time>{transaction?.timestamp ? formatTimestamp(transaction.timestamp) : 'Timestamp unavailable'}</time></div>;
    })}</div> : <p className="muted compact">Transaction list unavailable.</p>}

    <div className="detail-divider"/>
    <div className="detail-subhead"><span>BACKEND RISK FACTORS</span><small>VALUE · WEIGHT</small></div>
    {factors.length ? <div className="factor-list">{factors.map((factor, index) => {
      const value = Math.max(0, Math.min(1, Number(factor.value) || 0));
      const weight = Number(factor.weight);
      return <div className="factor" key={`${factor.name}-${index}`}><div><span>{String(factor.name ?? 'Risk factor').replaceAll('_', ' ')}</span><b>{Math.round(value * 100)}<small>%</small></b></div><div className="factor-track"><i style={{ width: `${value * 100}%` }}/></div>{Number.isFinite(weight) && <small className="factor-weight">Weight {Math.round(weight * 100)}%</small>}</div>;
    })}</div> : <p className="muted compact">Risk factor breakdown unavailable.</p>}
  </section>;
}

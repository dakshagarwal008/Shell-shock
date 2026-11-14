import { useEffect, useMemo, useState } from 'react';
import { formatTimestamp, money } from '../utils/clusterDisplay.js';
import { buildTransactionSequence, elapsedLabel } from '../utils/investigation.js';

export default function MoneyTrailReplay({ cluster, graph, onActiveTransaction }) {
  const sequence = useMemo(() => buildTransactionSequence(cluster, graph), [cluster, graph]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hasReplayFocus, setHasReplayFocus] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const transactions = sequence.transactions;
  const current = transactions[index] ?? null;
  const previous = index > 0 ? transactions[index - 1] : null;

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return undefined;
    const update = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) setPlaying(false);
    };
    if (preference.addEventListener) preference.addEventListener('change', update);
    else preference.addListener?.(update);
    return () => {
      if (preference.removeEventListener) preference.removeEventListener('change', update);
      else preference.removeListener?.(update);
    };
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion || transactions.length < 2) return undefined;
    if (index >= transactions.length - 1) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setIndex(value => Math.min(value + 1, transactions.length - 1)), 1350 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, reducedMotion, transactions.length, index, speed]);

  useEffect(() => {
    onActiveTransaction?.(hasReplayFocus ? current?.id ?? null : null);
  }, [current?.id, hasReplayFocus, onActiveTransaction]);

  const startReplay = () => {
    if (!transactions.length || reducedMotion) return;
    if (transactions.length === 1) {
      setIndex(0);
      setHasReplayFocus(true);
      setPlaying(false);
      return;
    }
    if (index >= transactions.length - 1) setIndex(0);
    setHasReplayFocus(true);
    setPlaying(true);
  };
  const restartReplay = () => {
    setPlaying(false);
    setIndex(0);
    setHasReplayFocus(transactions.length > 0);
  };
  const moveTo = value => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(Number(value), transactions.length - 1)));
    setHasReplayFocus(transactions.length > 0);
  };

  return <section className="replay-card" aria-label="Money trail replay">
    <div className="replay-heading"><div><span className="eyebrow">CHRONOLOGICAL TRANSACTION REVIEW</span><h3>Money trail replay</h3></div><span className="replay-alert-id">{cluster.id}</span></div>
    <p className="replay-intro">Follow the cluster's supplied transactions in timestamp order. The graph highlights each actual transfer and its account endpoints.</p>

    <button className="button button-primary replay-launch" onClick={startReplay} disabled={!transactions.length || reducedMotion} title={reducedMotion ? 'Automatic playback is disabled by your reduced-motion preference.' : undefined}>Replay Money Trail <span aria-hidden="true">▶</span></button>

    {current ? <div className="replay-current" aria-live="polite">
      <div className="replay-current-top"><span>TRANSACTION {String(index + 1).padStart(2, '0')} / {String(transactions.length).padStart(2, '0')}</span><span>{elapsedLabel(previous, current) ? `${elapsedLabel(previous, current)} since prior timestamped transfer` : index === 0 ? 'Start of sequence' : 'Elapsed time unavailable'}</span></div>
      <div className="replay-route">{current.source || 'Account unavailable'} <i>→</i> {current.target || 'Account unavailable'}</div>
      <div className="replay-transaction-meta"><span><small>TRANSACTION</small><b>{current.id}</b></span><span><small>AMOUNT</small><b>{current.amount != null && Number.isFinite(Number(current.amount)) ? money(current.amount) : 'Unavailable'}</b></span><span><small>TIMESTAMP</small><b>{formatTimestamp(current.timestamp)}</b></span></div>
    </div> : <div className="replay-empty">No timestamped transaction records are available for chronological replay.</div>}

    <div className="replay-timeline"><div className="timeline-labels"><label htmlFor={`trail-timeline-${cluster.id}`}>TRANSACTION SEQUENCE</label><span>{transactions.length ? `${index + 1} of ${transactions.length}` : '0 of 0'}</span></div><input id={`trail-timeline-${cluster.id}`} type="range" min="0" max={Math.max(0, transactions.length - 1)} step="1" value={transactions.length ? index : 0} disabled={!transactions.length} onChange={event => moveTo(event.target.value)} aria-valuetext={current ? `${current.id}, ${formatTimestamp(current.timestamp)}` : 'No timestamped transactions'}/><div className="timeline-endpoints"><span>{transactions[0] ? formatTimestamp(transactions[0].timestamp) : 'Unavailable'}</span><span>{transactions.at(-1) ? formatTimestamp(transactions.at(-1).timestamp) : 'Unavailable'}</span></div></div>

    <div className="replay-controls"><button onClick={() => moveTo(index - 1)} disabled={!transactions.length || index === 0} aria-label="Previous transaction">‹</button><button onClick={startReplay} disabled={!transactions.length || reducedMotion} aria-label="Play money trail">Play</button><button onClick={() => setPlaying(false)} disabled={!playing} aria-label="Pause money trail">Pause</button><button onClick={() => moveTo(index + 1)} disabled={!transactions.length || index >= transactions.length - 1} aria-label="Next transaction">›</button><button onClick={restartReplay} disabled={!transactions.length} aria-label="Restart money trail">Restart</button><label className="speed-control">Speed<select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label></div>

    {reducedMotion && <p className="replay-notice" role="status">Reduced motion is enabled. Use the timeline or step controls to review transfers.</p>}
    {(sequence.untimed.length > 0 || sequence.unavailable.length > 0) && <p className="replay-notice" role="status">Timed replay includes {transactions.length} of {sequence.total} cluster transactions. {sequence.untimed.length > 0 && `${sequence.untimed.length} graph records have no usable timestamp.`} {sequence.unavailable.length > 0 && `${sequence.unavailable.length} transaction IDs have no matching graph record.`} Those records remain listed in the investigation report without invented timing.</p>}
  </section>;
}

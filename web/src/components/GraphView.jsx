import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { TYPOLOGY, money } from '../utils/clusterDisplay.js';

function focusGraph(cy, elements, padding = 70) {
  if (!elements?.length) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) cy.fit(elements, padding);
  else cy.animate({ fit: { eles: elements, padding }, duration: 350 });
}

export default function GraphView({ graph, clusters, selected, graphItem, onSelect, replayTransactionId = null, evidenceAccountIds = [], incremental = false, latestTransactionId = null }) {
  const container = useRef(null);
  const cyRef = useRef(null);
  const selectedRef = useRef(selected);
  const clusterMapRef = useRef(new Map());
  const didInitialLiveFit = useRef(false);
  const [notice, setNotice] = useState('');
  const [graphError, setGraphError] = useState('');
  selectedRef.current = selected;
  clusterMapRef.current = new Map(clusters.map(cluster => [cluster.id, cluster]));

  useEffect(() => {
    if (!container.current) return;
    const clusterById = new Map(clusters.map(c => [c.id, c]));
    const seenNodeIds = new Set();
    const nodes = (graph.nodes ?? []).filter(n => n?.id != null && !seenNodeIds.has(String(n.id)) && seenNodeIds.add(String(n.id))).map(n => {
      const linkedClusters = (Array.isArray(n.cluster_ids) ? n.cluster_ids : []).map(id => clusterById.get(String(id))).filter(Boolean);
      const linked = linkedClusters[0] ?? clusters.find(c => (Array.isArray(c.accounts) ? c.accounts : []).includes(String(n.id)));
      return { data: { id: String(n.id), label: String(n.label ?? n.id), risk: n.risk != null && Number.isFinite(Number(n.risk)) ? Number(n.risk) : null, clusters: linkedClusters.length ? linkedClusters.map(c => c.id) : (linked ? [linked.id] : []), color: TYPOLOGY[linked?.typologies?.[0]]?.color ?? '#456171' } };
    });
    const nodeIds = new Set(nodes.map(n => n.data.id));
    const seenEdgeIds = new Set();
    const edges = (graph.edges ?? []).filter(e => e?.id != null && !seenEdgeIds.has(String(e.id)) && seenEdgeIds.add(String(e.id)) && nodeIds.has(String(e.source)) && nodeIds.has(String(e.target))).map(e => {
      const cluster = clusterById.get(e.cluster_id);
      const color = TYPOLOGY[cluster?.typologies?.[0]]?.color ?? '#7490a4';
      const amount = e.amount != null && Number.isFinite(Number(e.amount)) ? Number(e.amount) : null;
      const timestamp = typeof e.timestamp === 'string' ? e.timestamp : null;
      return { data: { id: String(e.id), source: String(e.source), target: String(e.target), amount, timestamp, title: `${money(amount)} · ${timestamp ?? 'time unavailable'}`, color, clusterId: String(e.cluster_id ?? ''), width: Math.max(1.5, Math.min(7, 1.5 + Math.log10(Math.max(1, amount || 1) / 10000))) } };
    });
    let cy;
    try { cy = cytoscape({ container: container.current, elements: [...nodes, ...edges], minZoom: 0.35, maxZoom: 2.8, wheelSensitivity: 0.18, layout: { name: 'cose', animate: false, fit: true, padding: 38, nodeRepulsion: 6500, idealEdgeLength: 115, gravity: 0.18, numIter: nodes.length > 300 ? 250 : 700 }, style: [
      { selector: 'node', style: { label: 'data(label)', width: 36, height: 36, 'background-color': 'data(color)', 'background-opacity': 0.2, 'border-width': 2, 'border-color': 'data(color)', color: '#e3edf1', 'font-size': 10, 'min-zoomed-font-size': 8, 'font-family': 'IBM Plex Mono, monospace', 'text-valign': 'center', 'text-halign': 'center', 'text-outline-color': '#101920', 'text-outline-width': 2 } },
      { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', width: 'data(width)', opacity: 0.8, label: incremental ? '' : 'data(title)', 'font-size': 8, 'min-zoomed-font-size': 7, 'font-family': 'IBM Plex Mono, monospace', color: '#b4c3cb', 'text-background-color': '#101920', 'text-background-opacity': 0.86, 'text-background-padding': 2, 'text-rotation': 'autorotate' } },
      { selector: '.dimmed', style: { opacity: 0.12 } },
      { selector: 'node.active', style: { 'background-color': 'data(color)', 'background-opacity': 0.42, 'border-color': 'data(color)', 'border-width': 3, width: 43, height: 43 } },
      { selector: 'node.node-focus', style: { 'border-color': '#ffffff', 'border-width': 4, width: 47, height: 47 } },
      { selector: 'edge.connected-focus', style: { opacity: 1, width: 5 } },
      { selector: 'edge.active', style: { opacity: 1, width: 'mapData(width, 1, 7, 2.5, 8)', label: 'data(title)' } },
      { selector: 'node.replay-account', style: { 'background-opacity': 0.82, 'border-width': 4, width: 49, height: 49, 'shadow-blur': 12, 'shadow-color': 'data(color)', 'shadow-opacity': 0.48 } },
      { selector: 'edge.replay-current', style: { opacity: 1, width: 8, 'shadow-blur': 10, 'shadow-color': 'data(color)', 'shadow-opacity': 0.55 } },
      { selector: 'node.evidence-account', style: { 'border-color': '#e9f0ed', 'border-width': 3, 'border-style': 'dashed', width: 46, height: 46 } },
      { selector: 'edge.evidence-transfer', style: { opacity: 1, width: 5, 'line-style': 'dashed' } }
    ] }); } catch (error) { setGraphError(error.message || 'The transaction graph could not be rendered.'); return undefined; }
    setGraphError('');
    cyRef.current = cy;
    const applySelection = cluster => {
      cy.elements().removeClass('active dimmed');
      if (!cluster) return;
      const nodesInCluster = cy.nodes().filter(n => (n.data('clusters') ?? []).includes(cluster.id));
      const transactionIds = Array.isArray(cluster.transaction_ids) ? cluster.transaction_ids : [];
      const edgesInCluster = cy.edges().filter(e => transactionIds.includes(e.id()) || e.data('clusterId') === cluster.id);
      const active = nodesInCluster.union(edgesInCluster);
      cy.elements().difference(active).addClass('dimmed'); active.addClass('active');
      focusGraph(cy, active);
    };
    cy.on('tap', 'node, edge', event => {
      const element = event.target;
      cy.elements().removeClass('node-focus connected-focus');
      if (element.isNode()) { element.addClass('node-focus'); element.connectedEdges().addClass('connected-focus'); }
      const linkedIds = element.isNode() ? element.data('clusters') : [element.data('clusterId')];
      const currentClusters = clusterMapRef.current;
      const cluster = linkedIds.map(id => currentClusters.get(id)).find(Boolean) ?? [...currentClusters.values()].find(c => element.isNode() ? (Array.isArray(c.accounts) && c.accounts.includes(element.id())) : (Array.isArray(c.transaction_ids) && c.transaction_ids.includes(element.id())));
      if (cluster) {
        onSelect(cluster.id, element.isNode() ? { type: 'account', id: element.id(), label: element.data('label'), risk: element.data('risk'), connections: element.connectedEdges().map(edge => ({ id: edge.id(), source: edge.data('source'), target: edge.data('target'), amount: edge.data('amount'), timestamp: edge.data('timestamp'), title: edge.data('title') })) } : { type: 'transaction', id: element.id(), source: element.data('source'), target: element.data('target'), amount: element.data('amount'), timestamp: element.data('timestamp'), title: element.data('title') });
        setNotice(element.isNode() ? `Selected account ${element.data('label')} in ${cluster.id}` : `Selected transaction ${element.id()} · ${money(element.data('amount'))}`);
      }
      else setNotice(`${element.isNode() ? 'Account' : 'Transaction'} ${element.data('label') ?? element.id()} is not linked to a cluster.`);
    });
    cy.on('mouseover', 'node, edge', event => { const item = event.target; setNotice(item.isNode() ? `Account ${item.data('label')} · risk value ${item.data('risk')}` : `Transaction ${item.id()} · ${money(item.data('amount'))} · ${item.data('title')}`); });
    cy.on('mouseout', 'node, edge', () => setNotice('Click a node or transaction to inspect its details. Drag to pan; scroll to zoom.'));
    applySelection(selectedRef.current);
    return () => { cy.destroy(); cyRef.current = null; };
  }, [incremental ? null : graph, incremental ? null : clusters, onSelect, incremental]);

  useEffect(() => {
    if (!incremental) return;
    const cy = cyRef.current;
    if (!cy) return;
    const clusterById = new Map(clusters.map(cluster => [cluster.id, cluster]));
    const clusterForAccount = account => clusters.find(cluster => cluster.accounts?.includes(account));
    const clusterForEdge = edge => clusterById.get(edge.cluster_id) ?? clusters.find(cluster => cluster.transaction_ids?.includes(String(edge.id)));
    const nodeIds = new Set((graph.nodes ?? []).filter(node => node?.id != null).map(node => String(node.id)));
    const edgeIds = new Set((graph.edges ?? []).filter(edge => edge?.id != null).map(edge => String(edge.id)));
    cy.edges().filter(edge => !edgeIds.has(edge.id())).remove();
    cy.nodes().filter(node => !nodeIds.has(node.id())).remove();
    const additions = [];
    const graphWasEmpty = cy.nodes().length === 0;
    for (const node of graph.nodes ?? []) {
      if (node?.id == null) continue;
      const id = String(node.id);
      const linked = (Array.isArray(node.cluster_ids) ? node.cluster_ids : []).map(clusterId => clusterById.get(String(clusterId))).filter(Boolean);
      const related = linked[0] ?? clusterForAccount(id);
      const color = TYPOLOGY[related?.typologies?.[0]]?.color ?? '#456171';
      const existing = cy.getElementById(id);
      const data = { id, label: String(node.label ?? id), risk: node.risk != null && Number.isFinite(Number(node.risk)) ? Number(node.risk) : null, clusters: linked.length ? linked.map(cluster => cluster.id) : related ? [related.id] : [], color };
      if (existing.length) existing.data(data);
      else {
        const linkedEdge = (graph.edges ?? []).find(edge => String(edge.source) === id || String(edge.target) === id);
        const neighborId = linkedEdge ? (String(linkedEdge.source) === id ? String(linkedEdge.target) : String(linkedEdge.source)) : null;
        const neighbor = neighborId ? cy.getElementById(neighborId) : null;
        const angle = cy.nodes().length * 2.399963;
        const position = neighbor?.length ? { x: neighbor.position('x') + Math.cos(angle) * 70, y: neighbor.position('y') + Math.sin(angle) * 70 } : { x: cy.width() / 2 + Math.cos(angle) * 95, y: cy.height() / 2 + Math.sin(angle) * 95 };
        additions.push({ data, position });
      }
    }
    if (additions.length) cy.add(additions);
    const edgeAdditions = [];
    for (const edge of graph.edges ?? []) {
      if (edge?.id == null || !nodeIds.has(String(edge.source)) || !nodeIds.has(String(edge.target))) continue;
      const id = String(edge.id), cluster = clusterForEdge(edge), color = TYPOLOGY[cluster?.typologies?.[0]]?.color ?? '#7490a4';
      const amount = edge.amount != null && Number.isFinite(Number(edge.amount)) ? Number(edge.amount) : null;
      const timestamp = typeof edge.timestamp === 'string' ? edge.timestamp : null;
      const data = { id, source: String(edge.source), target: String(edge.target), amount, timestamp, title: `${money(amount)} · ${timestamp ?? 'time unavailable'}`, color, clusterId: String(edge.cluster_id ?? cluster?.id ?? ''), width: Math.max(1.5, Math.min(7, 1.5 + Math.log10(Math.max(1, amount || 1) / 10000))) };
      const existing = cy.getElementById(id);
      if (existing.length) existing.data(data);
      else edgeAdditions.push({ data });
    }
    if (edgeAdditions.length) cy.add(edgeAdditions);
    if (graphWasEmpty && cy.nodes().length && !didInitialLiveFit.current) { cy.fit(undefined, 45); didInitialLiveFit.current = true; }
    cy.elements().removeClass('replay-current');
    if (latestTransactionId) cy.getElementById(String(latestTransactionId)).addClass('replay-current');
    cy.elements().removeClass('active dimmed');
    const activeCluster = selectedRef.current;
    if (activeCluster) {
      const activeNodes = cy.nodes().filter(node => (node.data('clusters') ?? []).includes(activeCluster.id));
      const ids = new Set((activeCluster.transaction_ids ?? []).map(String));
      const activeEdges = cy.edges().filter(edge => ids.has(edge.id()) || edge.data('clusterId') === activeCluster.id);
      const active = activeNodes.union(activeEdges);
      cy.elements().difference(active).addClass('dimmed');
      active.addClass('active');
    }
  }, [incremental, graph, clusters, latestTransactionId]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.elements().removeClass('active dimmed node-focus connected-focus');
    if (!selected) return;
    const nodes = cy.nodes().filter(n => (n.data('clusters') ?? []).includes(selected.id));
    const transactionIds = Array.isArray(selected.transaction_ids) ? selected.transaction_ids : [];
    const edges = cy.edges().filter(e => transactionIds.includes(e.id()) || e.data('clusterId') === selected.id);
    const active = nodes.union(edges); cy.elements().difference(active).addClass('dimmed'); active.addClass('active');
    if (graphItem?.type === 'account') { const focused = cy.getElementById(graphItem.id); if (focused.length) { focused.addClass('node-focus'); focused.connectedEdges().addClass('connected-focus'); } }
    if (!incremental) focusGraph(cy, active);
  }, [selected?.id, graphItem?.type, graphItem?.id, incremental]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('replay-current replay-account');
    if (!replayTransactionId) return;
    const transaction = cy.getElementById(String(replayTransactionId));
    if (!transaction.length || !transaction.isEdge()) return;
    transaction.addClass('replay-current');
    transaction.source().addClass('replay-account');
    transaction.target().addClass('replay-account');
  }, [replayTransactionId, graph, clusters]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('evidence-account evidence-transfer');
    if (!selected || !Array.isArray(evidenceAccountIds) || !evidenceAccountIds.length) return;
    const accounts = new Set(evidenceAccountIds.map(String));
    const transactionIds = new Set(Array.isArray(selected.transaction_ids) ? selected.transaction_ids.map(String) : []);
    const accountNodes = cy.nodes().filter(node => accounts.has(node.id()));
    const relatedEdges = cy.edges().filter(edge => {
      const inCluster = transactionIds.has(edge.id()) || edge.data('clusterId') === selected.id;
      return inCluster && (accounts.has(edge.data('source')) || accounts.has(edge.data('target')));
    });
    accountNodes.addClass('evidence-account');
    relatedEdges.addClass('evidence-transfer');
  }, [evidenceAccountIds, selected, graph, clusters]);

  useEffect(() => {
    const element = container.current;
    const cy = cyRef.current;
    if (!element || !cy || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => { if (element.clientWidth && element.clientHeight) cy.resize(); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [incremental]);

  return <section className="graph-card">
    <div className="graph-heading"><div><span className="eyebrow">TRANSACTION NETWORK</span><h3>{selected ? <>{selected.id} <small>· {Array.isArray(selected.accounts) ? selected.accounts.length : 0} ACCOUNTS</small></> : 'Cluster graph'}</h3></div><div className="graph-controls"><button onClick={() => { const cy = cyRef.current; if (cy) cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }} aria-label="Zoom in">+</button><button onClick={() => { const cy = cyRef.current; if (cy) cy.zoom({ level: cy.zoom() / 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }} aria-label="Zoom out">−</button><button onClick={() => cyRef.current?.fit(undefined, 45)} aria-label="Fit graph">Fit</button><button onClick={() => { const cy = cyRef.current; if (cy) { cy.reset(); cy.fit(undefined, 45); } }} aria-label="Reset graph view">Reset</button></div></div>
    <div className="graph-stage">
      <div className="graph-canvas" ref={container}/>
      {(graphError || !(graph.nodes ?? []).some(node => node?.id != null)) && <div className="graph-empty" role={graphError ? 'alert' : 'status'}>{graphError || 'No transaction graph in this run.'}</div>}
    </div>
    <div className="graph-legend"><span className="account-legend"><i/>ACCOUNT NODE</span><span className="transfer-legend"><i/>DIRECTED TRANSFER</span><span className="legend-separator" aria-hidden="true"/>{Object.entries(TYPOLOGY).map(([key, typology]) => <span key={key}><i style={{ '--legend-color': typology.color }}/>{typology.short}</span>)}<small>EDGE WIDTH ∝ AMOUNT</small></div>
    <div className="graph-status" aria-live="polite">{notice || 'Click a node or transaction to inspect its details. Drag to pan; scroll to zoom.'}</div>
  </section>;
}

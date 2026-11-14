import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { TYPOLOGY, money } from '../utils/clusterDisplay.js';

export default function GraphView({ graph, clusters, selected, graphItem, onSelect }) {
  const container = useRef(null);
  const cyRef = useRef(null);
  const selectedRef = useRef(selected);
  const [notice, setNotice] = useState('');
  const [graphError, setGraphError] = useState('');
  selectedRef.current = selected;

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
      return { data: { id: String(e.id), source: String(e.source), target: String(e.target), amount, title: `${money(amount)} · ${e.timestamp ?? 'time unavailable'}`, color, clusterId: String(e.cluster_id ?? ''), width: Math.max(1.5, Math.min(7, 1.5 + Math.log10(Math.max(1, amount || 1) / 10000))) } };
    });
    let cy;
    try { cy = cytoscape({ container: container.current, elements: [...nodes, ...edges], minZoom: 0.35, maxZoom: 2.8, wheelSensitivity: 0.18, layout: { name: 'cose', animate: false, fit: true, padding: 38, nodeRepulsion: 6500, idealEdgeLength: 115, gravity: 0.18, numIter: nodes.length > 300 ? 250 : 700 }, style: [
      { selector: 'node', style: { label: 'data(label)', width: 36, height: 36, 'background-color': '#172a35', 'border-width': 2, 'border-color': 'data(color)', color: '#e3edf1', 'font-size': 10, 'min-zoomed-font-size': 8, 'font-family': 'IBM Plex Mono, monospace', 'text-valign': 'center', 'text-halign': 'center', 'text-outline-color': '#101920', 'text-outline-width': 2 } },
      { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', width: 'data(width)', opacity: 0.8, label: 'data(title)', 'font-size': 8, 'min-zoomed-font-size': 7, 'font-family': 'IBM Plex Mono, monospace', color: '#b4c3cb', 'text-background-color': '#101920', 'text-background-opacity': 0.86, 'text-background-padding': 2, 'text-rotation': 'autorotate' } },
      { selector: '.dimmed', style: { opacity: 0.12 } },
      { selector: 'node.active', style: { 'background-color': '#142931', 'border-color': 'data(color)', 'border-width': 3, width: 43, height: 43 } },
      { selector: 'node.node-focus', style: { 'border-color': '#ffffff', 'border-width': 4, width: 47, height: 47 } },
      { selector: 'edge.connected-focus', style: { opacity: 1, width: 5 } },
      { selector: 'edge.active', style: { opacity: 1, width: 'mapData(width, 1, 7, 2.5, 8)' } }
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
      if (active.length) cy.animate({ fit: { eles: active, padding: 70 }, duration: 350 });
    };
    cy.on('tap', 'node, edge', event => {
      const element = event.target;
      cy.elements().removeClass('node-focus connected-focus');
      if (element.isNode()) { element.addClass('node-focus'); element.connectedEdges().addClass('connected-focus'); }
      const linkedIds = element.isNode() ? element.data('clusters') : [element.data('clusterId')];
      const cluster = linkedIds.map(id => clusterById.get(id)).find(Boolean) ?? [...clusterById.values()].find(c => element.isNode() ? (Array.isArray(c.accounts) && c.accounts.includes(element.id())) : (Array.isArray(c.transaction_ids) && c.transaction_ids.includes(element.id())));
      if (cluster) {
        onSelect(cluster.id, element.isNode() ? { type: 'account', id: element.id(), label: element.data('label'), risk: element.data('risk'), connections: element.connectedEdges().map(edge => ({ id: edge.id(), source: edge.data('source'), target: edge.data('target'), amount: edge.data('amount'), title: edge.data('title') })) } : { type: 'transaction', id: element.id(), source: element.data('source'), target: element.data('target'), amount: element.data('amount'), title: element.data('title') });
        setNotice(element.isNode() ? `Selected account ${element.data('label')} in ${cluster.id}` : `Selected transaction ${element.id()} · ${money(element.data('amount'))}`);
      }
      else setNotice(`${element.isNode() ? 'Account' : 'Transaction'} ${element.data('label') ?? element.id()} is not linked to a cluster.`);
    });
    cy.on('mouseover', 'node, edge', event => { const item = event.target; setNotice(item.isNode() ? `Account ${item.data('label')} · risk value ${item.data('risk')}` : `Transaction ${item.id()} · ${money(item.data('amount'))} · ${item.data('title')}`); });
    cy.on('mouseout', 'node, edge', () => setNotice('Click a node or transaction to inspect its details. Drag to pan; scroll to zoom.'));
    applySelection(selectedRef.current);
    return () => { cy.destroy(); cyRef.current = null; };
  }, [graph, clusters, onSelect]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.elements().removeClass('active dimmed node-focus connected-focus');
    if (!selected) return;
    const nodes = cy.nodes().filter(n => (n.data('clusters') ?? []).includes(selected.id));
    const transactionIds = Array.isArray(selected.transaction_ids) ? selected.transaction_ids : [];
    const edges = cy.edges().filter(e => transactionIds.includes(e.id()) || e.data('clusterId') === selected.id);
    const active = nodes.union(edges); cy.elements().difference(active).addClass('dimmed'); active.addClass('active');
    if (graphItem?.type === 'account') { const focused = cy.getElementById(graphItem.id); if (focused.length) { focused.addClass('node-focus'); focused.connectedEdges().addClass('connected-focus'); } }
    if (active.length) cy.animate({ fit: { eles: active, padding: 70 }, duration: 350 });
  }, [selected, graphItem]);

  return <section className="graph-card">
    <div className="graph-heading"><div><span className="eyebrow">TRANSACTION NETWORK</span><h3>{selected ? <>{selected.id} <small>· {Array.isArray(selected.accounts) ? selected.accounts.length : 0} ACCOUNTS</small></> : 'Cluster graph'}</h3></div><div className="graph-controls"><button onClick={() => { const cy = cyRef.current; if (cy) cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }} aria-label="Zoom in">+</button><button onClick={() => { const cy = cyRef.current; if (cy) cy.zoom({ level: cy.zoom() / 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }} aria-label="Zoom out">−</button><button onClick={() => cyRef.current?.fit(undefined, 45)} aria-label="Fit graph">Fit</button><button onClick={() => { const cy = cyRef.current; if (cy) { cy.reset(); cy.fit(undefined, 45); } }} aria-label="Reset graph view">Reset</button></div></div>
    <div className="graph-canvas" ref={container}>{graphError ? <div className="graph-empty">{graphError}</div> : !(graph.nodes ?? []).some(node => node?.id != null) && <div className="graph-empty">No transaction graph in this run.</div>}</div>
    <div className="graph-legend">{Object.entries(TYPOLOGY).map(([key, typology]) => <span key={key}><i style={{ '--legend-color': typology.color }}/>{typology.short}</span>)}<small>EDGE WIDTH ∝ AMOUNT</small></div>
    <div className="graph-status" aria-live="polite">{notice || 'Click a node or transaction to inspect its details. Drag to pan; scroll to zoom.'}</div>
  </section>;
}

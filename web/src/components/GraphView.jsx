import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { TYPOLOGY, money } from './ClusterTable.jsx';

export default function GraphView({ graph, clusters, selected }) {
  const container = useRef(null);
  const cyRef = useRef(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    if (!container.current) return;
    const clusterById = new Map(clusters.map(c => [c.id, c]));
    const elements = [
      ...(graph.nodes ?? []).map(n => ({ data: { id:n.id, label:n.label ?? n.id, risk:n.risk ?? 0, clusters:(n.cluster_ids ?? []).join(',') } })),
      ...(graph.edges ?? []).map(e => { const c = clusterById.get(e.cluster_id); const typ = c?.typologies?.[0]; const color = TYPOLOGY[typ]?.color ?? '#7490a4'; return { data: { id:e.id, source:e.source, target:e.target, amount:Number(e.amount ?? 0), title:`${money(e.amount)} · ${e.timestamp ?? 'time unavailable'}`, color, width:Math.max(1.5,Math.min(7,1.5+Math.log10(Math.max(1,Number(e.amount)||1)/10000))) } }; })
    ];
    const cy = cytoscape({ container:container.current, elements, minZoom:0.35, maxZoom:2.8, wheelSensitivity:0.18, layout:{name:'cose',animate:false,fit:true,padding:38,nodeRepulsion:6500,idealEdgeLength:115,gravity:0.18}, style:[
      {selector:'node',style:{'label':'data(label)','width':36,'height':36,'background-color':'#172a35','border-width':2,'border-color':'#456171','color':'#e3edf1','font-size':10,'font-family':'DM Mono, monospace','text-valign':'center','text-halign':'center','text-outline-color':'#101920','text-outline-width':2}},
      {selector:'edge',style:{'curve-style':'bezier','target-arrow-shape':'triangle','arrow-scale':0.8,'line-color':'data(color)','target-arrow-color':'data(color)','width':'data(width)','opacity':0.8,'label':'data(title)','font-size':8,'font-family':'DM Mono, monospace','color':'#b4c3cb','text-background-color':'#101920','text-background-opacity':0.86,'text-background-padding':2,'text-rotation':'autorotate'}},
      {selector:'.dimmed',style:{'opacity':0.12}},
      {selector:'node.active',style:{'background-color':'#1d3744','border-color':'#74c4a4','border-width':3,'width':43,'height':43}},
      {selector:'edge.active',style:{'opacity':1,'width':'mapData(width, 1, 7, 2.5, 8)'}}
    ]});
    cyRef.current = cy;
    const applySelection = cluster => {
      cy.elements().removeClass('active dimmed');
      if (!cluster) return;
      const nodes = cy.nodes().filter(n => (n.data('clusters') ?? '').split(',').includes(cluster.id));
      const edges = cy.edges().filter(e => (cluster.transaction_ids ?? []).includes(e.id()));
      const active = nodes.union(edges);
      cy.elements().difference(active).addClass('dimmed'); active.addClass('active');
      if (nodes.length) cy.animate({fit:{eles:active, padding:70}, duration:420});
    };
    applySelection(selectedRef.current);
    return () => { cy.destroy(); cyRef.current = null; };
  }, [graph, clusters]);
  useEffect(() => {
    const cy=cyRef.current; if(!cy) return;
    cy.elements().removeClass('active dimmed');
    if (!selected) return;
    const nodes=cy.nodes().filter(n=>(n.data('clusters')??'').split(',').includes(selected.id));
    const edges=cy.edges().filter(e=>(selected.transaction_ids??[]).includes(e.id()));
    const active=nodes.union(edges); cy.elements().difference(active).addClass('dimmed'); active.addClass('active');
    if(nodes.length) cy.animate({fit:{eles:active,padding:70},duration:420});
  }, [selected]);
  return <section className="graph-card"><div className="graph-heading"><div><span className="eyebrow">TRANSACTION NETWORK</span><h3>{selected ? <>{selected.id} <small>· {selected.accounts?.length ?? 0} ACCOUNTS</small></> : 'Cluster graph'}</h3></div><div className="graph-controls"><button onClick={()=>cyRef.current?.zoom(cyRef.current.zoom()*1.2)} aria-label="Zoom in">+</button><button onClick={()=>cyRef.current?.zoom(cyRef.current.zoom()/1.2)} aria-label="Zoom out">−</button><button onClick={()=>cyRef.current?.fit(undefined,45)} aria-label="Fit graph">⌖</button></div></div><div className="graph-canvas" ref={container}>{(graph.nodes?.length ?? 0)===0 && <div className="graph-empty">No transaction graph in this run.</div>}</div><div className="graph-legend"><span><i style={{'--legend-color':'#bc9cf4'}}/> ROUND-TRIPPING</span><span><i style={{'--legend-color':'#ef9c66'}}/> DISPERSION</span><span><i style={{'--legend-color':'#e9c36b'}}/> PASS-THROUGH</span><small>EDGE WIDTH ∝ AMOUNT</small></div></section>;
}

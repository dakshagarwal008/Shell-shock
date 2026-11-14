// Browser-side prefix evaluation of the rules in src/detectors.py and
// src/scoring.py. Each call receives only transactions already replayed.
const round = (value, digits = 0) => Number(value.toFixed(digits));
const sorted = values => [...values].sort((a, b) => String(a).localeCompare(String(b)));
const unique = values => [...new Set(values)];

function recurringPayroll(edges, window) {
  const ids = new Set(window.map(edge => edge.id));
  const targets = new Map(window.map(edge => [edge.target, edge.amount]));
  const others = edges.filter(edge => !ids.has(edge.id));
  if (!others.length) return false;
  let repeats = 0;
  for (const edge of others) {
    const amount = targets.get(edge.target);
    if (amount > 0 && Math.abs(edge.amount - amount) / amount <= .05 && window.some(item => item.target === edge.target && Math.abs(edge.ts - item.ts) >= 5 * 86400)) repeats++;
  }
  return repeats >= Math.max(3, Math.trunc(.5 * targets.size));
}

function fan(edges, direction) {
  const result = [];
  const nodes = sorted(unique(edges.flatMap(edge => [edge.source, edge.target])));
  for (const node of nodes) {
    const list = edges.filter(edge => direction === 'out' ? edge.source === node : edge.target === node).sort((a, b) => a.ts - b.ts);
    const minimum = direction === 'out' ? 5 : 5;
    if (list.length < minimum) continue;
    let best = null, left = 0;
    for (let right = 0; right < list.length; right++) {
      while (list[right].ts - list[left].ts > 86400) left++;
      const window = list.slice(left, right + 1);
      const counterparties = unique(window.map(edge => direction === 'out' ? edge.target : edge.source));
      const total = window.reduce((sum, edge) => sum + edge.amount, 0);
      if (counterparties.length >= minimum && total >= 150000 && (!best || counterparties.length > unique(best.map(edge => direction === 'out' ? edge.target : edge.source)).length)) best = window;
    }
    if (!best) continue;
    const amounts = best.map(edge => edge.amount).sort((a, b) => a - b);
    const median = amounts.length % 2 ? amounts[(amounts.length - 1) / 2] : (amounts[amounts.length / 2 - 1] + amounts[amounts.length / 2]) / 2;
    if (direction === 'out') {
      if (median < 15000 || recurringPayroll(list, best)) continue;
      const accounts = sorted(unique([node, ...best.map(edge => edge.target)]));
      const span = Math.max(.1, (best.at(-1).ts - best[0].ts) / 3600);
      const totalAmount = best.reduce((sum, edge) => sum + edge.amount, 0);
      result.push({ typology: 'fan_out_dispersion', accounts, transactions: sorted(best.map(edge => edge.id)), evidence: { hub: node, counterparties: accounts.length - 1, total_amount: round(totalAmount, 2), time_span_hours: round(span, 2), amount_cv: round(Math.sqrt(amounts.reduce((sum, x) => sum + (x - amounts.reduce((a, b) => a + b, 0) / amounts.length) ** 2, 0) / amounts.length) / (amounts.reduce((a, b) => a + b, 0) / amounts.length + 1e-9), 3), strength: Math.min(1, (accounts.length - 1) / 10) } });
    } else {
      const lifetime = list.reduce((sum, edge) => sum + edge.amount, 0), windowAmount = best.reduce((sum, edge) => sum + edge.amount, 0);
      const out = edges.filter(edge => edge.source === node);
      const start = best[0].ts, end = best.at(-1).ts + 48 * 3600;
      const outSum = out.filter(edge => start <= edge.ts && edge.ts <= end).reduce((sum, edge) => sum + edge.amount, 0);
      const concentration = windowAmount / (lifetime + 1e-9), rapid = outSum / (windowAmount + 1e-9);
      if (!((median >= 15000 && concentration >= .55) || (rapid >= .60 && median >= 10000))) continue;
      const accounts = sorted(unique([node, ...best.map(edge => edge.source)]));
      result.push({ typology: 'fan_in_aggregation', accounts, transactions: sorted(best.map(edge => edge.id)), evidence: { hub: node, counterparties: accounts.length - 1, total_amount: round(windowAmount, 2), time_span_hours: round(Math.max(.1, (best.at(-1).ts - best[0].ts) / 3600), 2), burst_concentration: round(concentration, 3), strength: Math.min(1, (accounts.length - 1) / 10) } });
    }
  }
  return result;
}

function cycles(edges) {
  const adj = new Map();
  for (const edge of edges) if (edge.source !== edge.target && edge.amount >= 20000) { if (!adj.has(edge.source)) adj.set(edge.source, []); adj.get(edge.source).push(edge); }
  for (const list of adj.values()) list.sort((a, b) => a.ts - b.ts);
  const result = [], seen = new Set();
  for (const start of sorted(adj.keys())) for (const first of adj.get(start)) {
    if (first.target < start) continue;
    const stack = [[first.target, [start, first.target], [first]]];
    while (stack.length) {
      const [node, path, pathEdges] = stack.pop(), last = pathEdges.at(-1);
      for (const edge of adj.get(node) ?? []) {
        const dt = edge.ts - last.ts, total = edge.ts - first.ts;
        if (dt <= 0 || total > 72 * 3600 || !((.85 * last.amount <= edge.amount && edge.amount <= 1.05 * last.amount) && (.775 * first.amount <= edge.amount && edge.amount <= 1.05 * first.amount))) continue;
        if (edge.target === start && path.length >= 3) {
          const cycle = [...pathEdges, edge], tx = sorted(cycle.map(item => item.id)), key = tx.join('|');
          if (seen.has(key)) continue; seen.add(key);
          const amounts = cycle.map(item => item.amount), similarity = Math.min(...amounts) / (Math.max(...amounts) + 1e-9);
          result.push({ typology: 'cyclic_round_tripping', accounts: sorted(unique(path)), transactions: tx, evidence: { cycle_nodes: [...path, start], cycle_length: path.length, total_amount: round(amounts.reduce((a,b)=>a+b,0), 2), time_span_hours: round(Math.max(.1, total / 3600), 2), amount_similarity: round(similarity, 3), strength: round(similarity, 3) } });
        } else if (edge.target > start && !path.includes(edge.target) && path.length < 6) stack.push([edge.target, [...path, edge.target], [...pathEdges, edge]]);
      }
    }
  }
  return result;
}

function passThrough(edges) {
  const nodes = sorted(unique(edges.flatMap(e => [e.source, e.target]))), next = new Map(), prev = new Map(), byId = new Map(edges.map(e => [e.id, e]));
  for (const node of nodes) {
    const incoming = edges.filter(e => e.target === node && e.amount >= 20000).sort((a,b)=>a.ts-b.ts);
    const outgoing = edges.filter(e => e.source === node && e.amount >= 20000).sort((a,b)=>a.ts-b.ts);
    const used = new Set();
    for (const before of incoming) {
      let best = null, bestScore = Infinity;
      for (const after of outgoing) {
        if (used.has(after.id) || after.target === before.source) continue;
        const dt = after.ts - before.ts;
        if (dt <= 0 || dt > 6 * 3600 || !(after.amount >= .88 * before.amount && after.amount <= 1.03 * before.amount)) continue;
        const score = Math.abs(after.amount-before.amount)/(before.amount+1e-9) + (dt/(6*3600))*.25;
        if (score < bestScore) { bestScore = score; best = after; }
      }
      if (best) { next.set(before.id, best.id); prev.set(best.id, before.id); used.add(best.id); }
    }
  }
  const results = [], visited = new Set();
  for (const head of sorted(next.keys()).filter(id => !prev.has(id))) {
    if (visited.has(head)) continue;
    const ids = [head]; visited.add(head); let curr = head;
    while (next.has(curr) && !visited.has(next.get(curr))) { curr = next.get(curr); ids.push(curr); visited.add(curr); }
    if (ids.length < 2) continue;
    const chain = ids.map(id => byId.get(id)), first = chain[0].source, last = chain.at(-1).target;
    if (first === last) continue;
    const accounts = [first, ...chain.map(edge => edge.target)];
    if (unique(accounts).length < 3) continue;
    const amounts = chain.map(edge => edge.amount), span = Math.max(.05, (chain.at(-1).ts - chain[0].ts) / 3600), retention = amounts.at(-1)/(amounts[0]+1e-9);
    results.push({ typology: 'rapid_pass_through', accounts: sorted(unique(accounts)), transactions: sorted(ids), evidence: { chain_accounts: accounts, hops: chain.length, total_amount: round(amounts.reduce((a,b)=>a+b,0), 2), time_span_hours: round(span, 2), avg_hop_hours: round(span/Math.max(1,chain.length-1), 2), amount_retention: round(retention, 3), strength: round(Math.min(1,.5+.15*chain.length),3) } });
  }
  return results;
}

function merge(candidates) {
  const parent = candidates.map((_, i) => i), root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const seen = new Map();
  candidates.forEach((candidate, i) => [...candidate.accounts.map(x => `a:${x}`), ...candidate.transactions.map(x => `t:${x}`)].forEach(key => { if (seen.has(key)) parent[root(i)] = root(seen.get(key)); else seen.set(key, i); }));
  const groups = new Map(); candidates.forEach((candidate, i) => { const r=root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(candidate); });
  return [...groups.values()].map(group => ({ typologies: sorted(unique(group.map(c=>c.typology))), accounts: sorted(unique(group.flatMap(c=>c.accounts))), transaction_ids: sorted(unique(group.flatMap(c=>c.transactions))), _evidences: group.map(c=>({typology:c.typology,...c.evidence})) }));
}

function score(groups, edges) {
  const lookup = new Map(edges.map(edge=>[edge.id,edge]));
  const scored = groups.map(group => {
    const txs=group.transaction_ids.map(id=>lookup.get(id)).filter(Boolean); if (!txs.length) return null;
    const amount=txs.reduce((sum,e)=>sum+e.amount,0), min=Math.min(...txs.map(e=>e.ts)), max=Math.max(...txs.map(e=>e.ts)), hours=round(Math.max(.1,(max-min)/3600),1);
    const pattern=round(Math.min(1,Math.max(...group._evidences.map(e=>Number(e.strength ?? .7)))),3), velocity=round(Math.max(.05,Math.min(1,1-hours/72)),3), value=round(Math.min(1,amount/900000),3), size=round(Math.min(1,group.accounts.length/14),3), multi=group.typologies.length>=2?1:.5;
    const factors=[['pattern_strength',.35,pattern],['velocity_speed',.25,velocity],['total_value',.15,value],['network_size',.15,size],['multi_typology',.1,multi]].map(([name,weight,v])=>({name,weight,value:v}));
    const raw=factors.reduce((sum,f)=>sum+f.weight*f.value,0)*100;
    return {...group,risk_score:Math.max(1,Math.min(99,Math.round(raw))),total_amount:round(amount,2),time_span_hours:hours,risk_factors:factors};
  }).filter(Boolean).sort((a,b)=>b.risk_score-a.risk_score||b.total_amount-a.total_amount);
  return scored.map((c,index)=>({...c,rank:index+1,id:`C-${String(index+1).padStart(3,'0')}`}));
}

export function evaluatePrefix(transactions) {
  const edges = transactions.map(t=>({id:String(t.id),source:String(t.source),target:String(t.target),amount:Number(t.amount),timestamp:t.timestamp,ts:Date.parse(t.timestamp)/1000})).filter(e=>e.id&&e.source&&e.target&&Number.isFinite(e.amount)&&Number.isFinite(e.ts)).sort((a,b)=>a.ts-b.ts||a.id.localeCompare(b.id));
  const groups=score(merge([...fan(edges,'out'),...fan(edges,'in'),...cycles(edges),...passThrough(edges)]),edges);
  return groups.map(cluster=>({...cluster,summary:cluster._evidences.map(e=>`${e.typology.replaceAll('_',' ')}: ${e.counterparties ? `${e.counterparties} counterparties at ${e.hub}` : e.chain_accounts ? e.chain_accounts.join(' → ') : e.cycle_nodes ? e.cycle_nodes.join(' → ') : 'detected'}; ${e.total_amount} amount; ${e.time_span_hours} hours`).join('. ')}));
}

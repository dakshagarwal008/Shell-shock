export const TYPOLOGY = {
  fan_out_dispersion: { label: 'Fan-out dispersion', color: '#62b7a7', short: 'DISPERSION' },
  fan_in_aggregation: { label: 'Fan-in aggregation', color: '#619bc6', short: 'AGGREGATION' },
  cyclic_round_tripping: { label: 'Round-tripping cycle', color: '#829ed2', short: 'ROUND-TRIPPING' },
  rapid_pass_through: { label: 'Rapid pass-through', color: '#55a9bf', short: 'PASS-THROUGH' }
};

export const money = n => n != null && Number.isFinite(Number(n)) ? `₹${Number(n).toLocaleString('en-IN')}` : '₹—';

export const TYPOLOGY = {
  fan_out_dispersion: { label: 'Fan-out dispersion', color: '#62c7b4', short: 'DISPERSION' },
  fan_in_aggregation: { label: 'Fan-in aggregation', color: '#78a9ed', short: 'AGGREGATION' },
  cyclic_round_tripping: { label: 'Round-tripping cycle', color: '#b19be5', short: 'ROUND-TRIPPING' },
  rapid_pass_through: { label: 'Rapid pass-through', color: '#62bfd4', short: 'PASS-THROUGH' }
};

// Display-only bands based on the backend-provided score; scoring stays in the backend.
export const RISK_BANDS = [
  { id: 'critical', label: 'Critical', min: 90, color: '#e78378' },
  { id: 'high', label: 'High', min: 75, color: '#e1b765' },
  { id: 'elevated', label: 'Elevated', min: 60, color: '#c7a96b' },
  { id: 'moderate', label: 'Moderate', min: 0, color: '#9aa9a8' }
];

export function riskBand(score) {
  if (score == null || score === '') return null;
  const value = Number(score);
  return RISK_BANDS.find(band => Number.isFinite(value) && value >= band.min) ?? null;
}

export function formatTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Unavailable';
  return value.includes('T') ? value.replace('T', ' ').slice(0, 16) : value;
}

export const money = n => n != null && Number.isFinite(Number(n)) ? `₹${Number(n).toLocaleString('en-IN')}` : '₹—';

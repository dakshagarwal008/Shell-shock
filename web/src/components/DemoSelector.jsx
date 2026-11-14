const OPTIONS = [
  ['live', 'Live Demo'],
  ['exception', 'Exception Demo'],
  ['standard', 'Demo']
];

export default function DemoSelector({ value, onChange }) {
  return <label className="demo-selector">
    <span>SELECT DEMO</span>
    <select value={value} onChange={event => onChange(event.target.value)} aria-label="Select demo experience">
      {OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  </label>;
}

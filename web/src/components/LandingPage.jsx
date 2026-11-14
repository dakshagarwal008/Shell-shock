import AnimatedNetworkBackground from './AnimatedNetworkBackground.jsx';

const steps = [
  { number: '01', title: 'Transaction analysis', text: 'Examine transfers as connected activity, preserving direction, value, and timing.' },
  { number: '02', title: 'Graph construction', text: 'Build a transaction network that reveals how accounts connect across the flow of funds.' },
  { number: '03', title: 'Suspicious cluster detection', text: 'Surface connected groups with patterns associated with financial crime typologies.' },
  { number: '04', title: 'Risk intelligence', text: 'Review ranked findings with the evidence and model evaluation behind each result.' }
];

const capabilities = [
  { code: 'A', title: 'Network analysis', text: 'Trace relationships across accounts and transactions in a directed, weighted graph.' },
  { code: 'B', title: 'Typology detection', text: 'Explore aggregation, dispersion, circular movement, and rapid pass-through patterns.' },
  { code: 'C', title: 'Explainable risk scoring', text: 'See the risk signals and connected activity that contribute to each cluster assessment.' },
  { code: 'D', title: 'Model evaluation', text: 'Compare precision, recall, and F1 scores against the supplied evaluation baseline.' }
];

function NetworkIllustration() {
  return <div className="network-illustration" aria-hidden="true">
    <div className="network-illustration-head"><span>NETWORK STRUCTURE</span><span className="illustration-mark"><i/> TRANSACTION FLOW</span></div>
    <div className="network-canvas-stage"/>
    <div className="network-illustration-foot"><span>CONNECTED ACTIVITY</span><span>FLOW · VALUE · RELATIONSHIP</span></div>
  </div>;
}
export default function LandingPage() {
  return <div className="landing-page">
    <header className="landing-nav-wrap"><nav className="landing-nav" aria-label="Main navigation">
      <a className="brand" href="#/" aria-label="TRACE home"><span className="brand-mark">T</span><span>TRACE<small>FINANCIAL CRIME INTELLIGENCE</small></span></a>
      <div className="landing-nav-links"><a href="#platform">Platform</a><a href="#methodology">Methodology</a><a href="#about">About</a></div>
      <a className="button button-outline nav-launch" href="#/dashboard">Launch Dashboard <span aria-hidden="true">↗</span></a>
    </nav></header>
    <main>
      <section className="hero-section page-width">
        <AnimatedNetworkBackground/>
        <div className="hero-copy"><div className="eyebrow hero-eyebrow"><span className="status-indicator"/> GRAPH-BASED FINANCIAL INTELLIGENCE</div><h1>Follow the money.<br/><span>Uncover the network.</span></h1><p>TRACE transforms complex transaction data into actionable financial crime intelligence. Discover suspicious networks, identify transaction patterns, and understand the connections behind financial activity.</p><div className="hero-actions"><a className="button button-primary" href="#/dashboard">Launch Dashboard <span aria-hidden="true">→</span></a><a className="text-link" href="#methodology">Explore the methodology <span aria-hidden="true">↓</span></a></div><div className="hero-footnote"><span>NETWORK-FIRST ANALYSIS</span><span className="footnote-rule"/><span>EXPLAINABLE FINDINGS</span></div></div>
        <NetworkIllustration/>
      </section>
      <section className="how-section" id="platform"><div className="page-width"><div className="section-intro"><span className="eyebrow">FROM RAW ACTIVITY TO CLEAR SIGNAL</span><h2>How TRACE works</h2><p>A structured path from transaction activity to reviewable intelligence.</p></div><div className="steps-grid">{steps.map(step => <article className="step-item" key={step.number}><span className="step-number">{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></div></section>
      <section className="capabilities-section page-width" id="methodology"><div className="section-intro"><span className="eyebrow">BUILT FOR INVESTIGATION</span><h2>Clarity across the network</h2><p>Core capabilities connect detection, evidence, and evaluation in one workspace.</p></div><div className="capability-grid">{capabilities.map(capability => <article className="capability-item" key={capability.code}><span className="capability-code">{capability.code}</span><div><h3>{capability.title}</h3><p>{capability.text}</p></div><span className="capability-arrow" aria-hidden="true">↗</span></article>)}</div></section>
      <section className="about-band" id="about"><div className="page-width about-inner"><div><span className="eyebrow">TRACE / FINANCIAL CRIME INTELLIGENCE</span><h2>See the connections<br/>behind the activity.</h2></div><a className="button button-primary" href="#/dashboard">Open the investigation workspace <span aria-hidden="true">→</span></a></div></section>
    </main>
    <footer className="landing-footer page-width"><a className="footer-brand" href="#/">TRACE</a><span>Graph-based financial crime intelligence.</span><nav aria-label="Footer navigation"><a href="#platform">Platform</a><a href="#methodology">Methodology</a><a href="#about">About</a></nav><small>© TRACE · BUILT FOR INVESTIGATIVE REVIEW</small></footer>
  </div>;
}

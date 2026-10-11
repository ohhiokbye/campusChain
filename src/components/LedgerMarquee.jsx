import { useState } from 'react';
import { Pause, Play } from 'lucide-react';

const LEDGER_THOUGHTS = [
  'Shared rules. Transparent records.',
  'Smart contracts. Clear commitments.',
  'Every transaction leaves a trace.',
];

// Decorative blockchain thoughts; no booking data or contract behavior.
export default function LedgerMarquee() {
  const [paused, setPaused] = useState(false);
  return (
    <section
      className={`ledger-marquee ${paused ? 'is-paused' : ''}`}
      aria-label="Blockchain principles"
    >
      <div className="marquee-heading">
        <p className="eyebrow">THE IDEA BEHIND THE LEDGER</p>
        <button
          className="marquee-toggle"
          type="button"
          aria-label={paused ? 'Resume moving text' : 'Pause moving text'}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      </div>
      <p className="visually-hidden">{LEDGER_THOUGHTS.join(' ')}</p>
      <div className="marquee-window" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <div className="marquee-group" key={copy}>
              {LEDGER_THOUGHTS.map((thought) => (
                <span className="marquee-item" key={thought}>
                  {thought}
                  <span className="marquee-star">✳</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

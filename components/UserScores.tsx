'use client';

import { calculateNeed } from '@/lib/recommendation';

type Props = {
  subdomains: string[];
  scores: Record<string, number>;
  onChange: (subdomain: string, value: number) => void;
};

export default function UserScores({ subdomains, scores, onChange }: Props) {
  return (
    <section className="card">
      <h2>1. User scores</h2>
      <p className="muted">
        Set a score (0–100) per subdomain. Need is calculated as <code>100 − score</code>. Higher need = greater
        need for support.
      </p>
      <div className="score-grid">
        <div className="score-grid-header">
          <span>Subdomain</span>
          <span>Score</span>
          <span></span>
          <span>Need</span>
        </div>
        {subdomains.map((subdomain) => {
          const score = scores[subdomain] ?? 0;
          const need = calculateNeed(score);
          return (
            <div className="score-row" key={subdomain}>
              <label htmlFor={`score-${subdomain}`}>{subdomain}</label>
              <input
                id={`score-${subdomain}`}
                type="range"
                min={0}
                max={100}
                value={score}
                onChange={(e) => onChange(subdomain, Number(e.target.value))}
              />
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => onChange(subdomain, clamp(Number(e.target.value)))}
                className="score-number"
                aria-label={`${subdomain} score`}
              />
              <div className="need-bar-wrap" title={`Need: ${need}`}>
                <div className="need-bar" style={{ width: `${need}%` }} />
                <span className="need-value">{need}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

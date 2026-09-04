'use client';

import { useMemo, useRef, useState } from 'react';
import type { Program } from '@/lib/types';
import { selectRecommendations } from '@/lib/recommendation';
import UserScores from './UserScores';
import Recommendations from './Recommendations';
import RecommendationRounds from './RecommendationRounds';
import ProgramScores from './ProgramScores';

type Props = {
  programs: Program[];
  subdomains: string[];
  initialScores: Record<string, number>;
};

export default function AppClient({ programs, subdomains, initialScores }: Props) {
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const resultsRef = useRef<HTMLDivElement>(null);

  // The algorithm is pure and cheap for this dataset size, so we simply
  // recompute it on every score change - "change scores and immediately
  // rerun" from the brief, with no separate "stale" state to manage.
  const result = useMemo(() => selectRecommendations(programs, scores), [programs, scores]);

  const handleScoreChange = (subdomain: string, value: number) => {
    setScores((prev) => ({ ...prev, [subdomain]: value }));
  };

  const fillAll = (value: number) => {
    setScores(Object.fromEntries(subdomains.map((s) => [s, value])));
  };

  const randomize = () => {
    setScores(Object.fromEntries(subdomains.map((s) => [s, Math.round(Math.random() * 100)])));
  };

  const reset = () => setScores(initialScores);

  const scrollToResults = () => {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>Recommendation Algorithm Sandbox</h1>
        <p className="muted">
          A visual, inspectable prototype of the questionnaire-based recommendation logic. Not production code -
          change scores below and watch every round recalculate.
        </p>
      </header>

      <div className="toolbar">
        <button onClick={() => fillAll(0)}>All scores → 0 (max need)</button>
        <button onClick={() => fillAll(100)}>All scores → 100 (no need)</button>
        <button onClick={randomize}>Randomize</button>
        <button onClick={reset}>Reset to 50</button>
        <button className="primary" onClick={scrollToResults}>
          Run recommendation ↓
        </button>
      </div>

      <UserScores subdomains={subdomains} scores={scores} onChange={handleScoreChange} />

      <div ref={resultsRef}>
        <Recommendations recommendations={result.recommendations} />
      </div>

      <RecommendationRounds rounds={result.rounds} />

      <ProgramScores rounds={result.rounds} />

      {result.unmappedPrograms.length > 0 && (
        <section className="card">
          <h2>Programs without a subdomain mapping</h2>
          <p className="muted">
            These programs exist in table.tsv but have no "Subdomains primary match" value, so they are excluded
            from scoring entirely:
          </p>
          <ul>
            {result.unmappedPrograms.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

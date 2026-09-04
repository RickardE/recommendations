import type { ProgramScoreResult } from '@/lib/types';
import ProgramCalculation from './ProgramCalculation';
import { round1 } from '@/lib/recommendation';

type Props = {
  recommendations: ProgramScoreResult[];
};

export default function Recommendations({ recommendations }: Props) {
  return (
    <section className="card">
      <h2>2. Recommendations</h2>
      {recommendations.length === 0 ? (
        <p className="muted">No programs could be recommended for the current scores.</p>
      ) : (
        <div className="recommendation-grid">
          {recommendations.map((rec, i) => (
            <div className="recommendation-card" key={rec.program.id}>
              <div className="recommendation-header">
                <span className="recommendation-rank">#{i + 1}</span>
                <div>
                  <h3>{rec.program.name}</h3>
                  {rec.targetSubdomain && <span className="muted small">for {rec.targetSubdomain}</span>}
                </div>
                <span className="score-pill">{round1(rec.score)}</span>
              </div>
              <ProgramCalculation result={rec} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

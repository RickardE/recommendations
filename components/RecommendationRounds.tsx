import type { RoundResult } from '@/lib/types';
import ProgramCalculation from './ProgramCalculation';
import { round1 } from '@/lib/recommendation';

type Props = {
  rounds: RoundResult[];
};

export default function RecommendationRounds({ rounds }: Props) {
  return (
    <section className="card">
      <h2>3. Recommendation rounds</h2>
      <p className="muted">
        Covered subdomains are removed before the next round's scores are calculated. This is where you can see the
        algorithm actually behave, round by round.
      </p>
      <div className="rounds">
        {rounds.map((round) => (
          <div className="round" key={round.round}>
            <div className="round-header">
              <h3>Round {round.round}</h3>
              {round.selectionType === 'fallback' && <span className="badge badge-fallback">redundancy fallback</span>}
              {round.selectionType === 'none' && <span className="badge badge-none">no candidate found</span>}
            </div>

            <div className="round-covered">
              <span className="muted small">Covered coming in:</span>{' '}
              {round.coveredBefore.length === 0 ? (
                <span className="muted small">none</span>
              ) : (
                round.coveredBefore.map((s) => (
                  <span className="chip" key={s}>
                    {s}
                  </span>
                ))
              )}
            </div>

            {round.selected ? (
              <div className="round-selected">
                <div className="round-selected-header">
                  <strong>{round.selected.program.name}</strong>
                  <span className="score-pill">{round1(round.selected.score)}</span>
                </div>
                <ProgramCalculation result={round.selected} />
              </div>
            ) : (
              <p className="muted">No program was selected this round.</p>
            )}

            <div className="round-covered">
              <span className="muted small">Covered after this round:</span>{' '}
              {round.coveredAfter.map((s) => (
                <span className={`chip ${round.coveredBefore.includes(s) ? '' : 'chip-covered'}`} key={s}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

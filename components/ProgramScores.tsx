'use client';

import { Fragment, useState } from 'react';
import type { RoundResult } from '@/lib/types';
import ProgramCalculation from './ProgramCalculation';
import { round1 } from '@/lib/recommendation';

type Props = {
  rounds: RoundResult[];
};

export default function ProgramScores({ rounds }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="card">
      <h2>4. All program scores (debug)</h2>
      <p className="muted">
        Every remaining program mapped to that round's target subdomain (the highest-need subdomain still
        uncovered), scored using its original SINGLE/AND/OR mapping type. Click a row to see exactly how it was
        calculated.
      </p>
      <div className="rounds">
        {rounds.map((round) => (
          <div key={round.round} className="round-scores">
            <h3>
              Round {round.round}
              {round.targetSubdomain && <span className="muted"> — target subdomain: {round.targetSubdomain}</span>}
            </h3>
            <table className="score-table">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Mapping</th>
                  <th>Score</th>
                  <th>New coverage</th>
                </tr>
              </thead>
              <tbody>
                {round.allScores.map((result) => {
                  const key = `${round.round}-${result.program.id}`;
                  const isSelected = round.selected?.program.id === result.program.id;
                  const isOpen = expanded === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        className={isSelected ? 'selected-row' : ''}
                        onClick={() => setExpanded(isOpen ? null : key)}
                      >
                        <td>
                          {isSelected ? '★ ' : ''}
                          {result.program.name}
                        </td>
                        <td>{result.mappingType ?? '—'}</td>
                        <td>{round1(result.score)}</td>
                        <td>{result.newCoverage.length > 0 ? result.newCoverage.join(', ') : '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="detail-row">
                          <td colSpan={4}>
                            <ProgramCalculation result={result} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

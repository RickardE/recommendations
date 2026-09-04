import type { ProgramScoreResult } from '@/lib/types';
import { round1 } from '@/lib/recommendation';

type Props = {
  result: ProgramScoreResult;
  /** Show the "new coverage" checklist. Off by default in dense tables. */
  showCoverage?: boolean;
};

/**
 * Renders the full "why" for a single program's score: the subdomain that
 * caused it to be evaluated this round, its original mapping type,
 * subdomains considered vs. ignored (already covered), the exact formula,
 * and (optionally) which subdomains it would newly cover. Reused by
 * Recommendations, RecommendationRounds and ProgramScores so the
 * explanation looks identical everywhere in the UI.
 */
export default function ProgramCalculation({ result, showCoverage = true }: Props) {
  const {
    mappingType,
    targetSubdomain,
    consideredSubdomains,
    ignoredCoveredSubdomains,
    formula,
    newCoverage,
    driverSubdomains,
  } = result;

  if (mappingType === null) {
    return <p className="muted">No subdomain mapping for this program.</p>;
  }

  return (
    <div className="calculation">
      <div className="calc-row">
        <span className={`badge badge-${mappingType.toLowerCase()}`}>{mappingType}</span>
        <span className="muted">
          {consideredSubdomains.length} subdomain{consideredSubdomains.length === 1 ? '' : 's'} considered
        </span>
      </div>

      {targetSubdomain && (
        <div className="muted small">
          Evaluated for target subdomain: <strong>{targetSubdomain}</strong>
        </div>
      )}

      <table className="mini-table">
        <thead>
          <tr>
            <th>Subdomain</th>
            <th>Need</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {consideredSubdomains.map((entry) => (
            <tr key={entry.subdomain}>
              <td>{entry.subdomain}</td>
              <td>{round1(entry.need)}</td>
              <td>
                {mappingType === 'SINGLE'
                  ? 'matched'
                  : mappingType === 'AND'
                  ? 'averaged'
                  : driverSubdomains.includes(entry.subdomain)
                  ? 'strongest (driver)'
                  : '+10% bonus'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="formula">Calculation: {formula}</div>

      {ignoredCoveredSubdomains.length > 0 && (
        <div className="muted small">
          Ignored (already covered): {ignoredCoveredSubdomains.join(', ')}
        </div>
      )}

      {showCoverage && (
        <div className="coverage">
          <span className="muted small">New coverage:</span>{' '}
          {newCoverage.length === 0 ? (
            <span className="muted small">none</span>
          ) : (
            newCoverage.map((s) => (
              <span key={s} className="chip chip-covered">
                ✓ {s}
              </span>
            ))
          )}
        </div>
      )}

      {mappingType === 'OR' && driverSubdomains.length > 0 && (
        <div className="muted small">
          Driver (strongest need - explains the score, not what gets covered):{' '}
          {driverSubdomains.join(', ')}
        </div>
      )}
    </div>
  );
}

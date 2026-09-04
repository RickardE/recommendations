import type { ProgramScoreResult } from '@/lib/types';
import { round1 } from '@/lib/recommendation';

type Props = {
  result: ProgramScoreResult;
  /** Show the "new coverage" checklist. Off by default in dense tables. */
  showCoverage?: boolean;
};

/**
 * Renders the full "why" for a single program's score: mapping type,
 * subdomains considered, the exact formula, and (optionally) which
 * subdomains it would newly cover. Reused by Recommendations,
 * RecommendationRounds and ProgramScores so the explanation looks
 * identical everywhere in the UI.
 */
export default function ProgramCalculation({ result, showCoverage = true }: Props) {
  const { mappingType, consideredSubdomains, formula, contributingSubdomains, newCoverage, redundancy } = result;

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
                  : newCoverage.includes(entry.subdomain)
                  ? 'strongest (driver)'
                  : '+10% bonus'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="formula">Calculation: {formula}</div>

      {redundancy && (
        <div className="muted small">
          Redundancy: {redundancy.label} — {round1(redundancy.ratio * 100)}% of this program's full mapping was
          already covered, factor ×{redundancy.factor}.
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

      {mappingType === 'OR' && contributingSubdomains.length > newCoverage.length && (
        <div className="muted small">
          Contributed to score but not newly covered:{' '}
          {contributingSubdomains.filter((s) => !newCoverage.includes(s)).join(', ')}
        </div>
      )}
    </div>
  );
}

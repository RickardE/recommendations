import type { Program } from '@/lib/types';

type Props = {
  programs: Program[];
};

/**
 * A clean, one-row-per-program view of the parsed matrix - Program |
 * Mapping type | Subdomains - for cross-checking a program's mapping
 * against the source spreadsheet while testing. Unlike the raw
 * data/table.tsv file, this reflects the already-merged, already-typed
 * result of matrixParser.ts (continuation lines joined, mapping type
 * resolved), which is what the recommendation algorithm actually sees.
 */
export default function ProgramMatrix({ programs }: Props) {
  return (
    <section className="card">
      <h2>5. Program matrix</h2>
      <p className="muted">
        Every program from data/table.tsv with its parsed subdomain mapping, exactly as the algorithm sees it.
      </p>
      <div className="matrix-table-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th>Program</th>
              <th>Mapping</th>
              <th>Subdomains</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => {
              const mapping = program.mappings[0];
              return (
                <tr key={program.id}>
                  <td>{program.name}</td>
                  <td>
                    {mapping ? (
                      <span className={`badge badge-${mapping.type.toLowerCase()}`}>{mapping.type}</span>
                    ) : (
                      <span className="muted small">unmapped</span>
                    )}
                  </td>
                  <td>
                    {mapping ? (
                      mapping.subdomains.map((subdomain, i) => (
                        <span key={subdomain}>
                          {i > 0 && <span className="muted"> {mapping.type} </span>}
                          <span className="chip">{subdomain}</span>
                        </span>
                      ))
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

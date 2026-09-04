import type { ProgramMapping } from '../types';

/**
 * Determines which subdomains a mapping "meaningfully covers" if the
 * program is selected right now, given what's already covered.
 *
 * - AND: every currently-uncovered mapped subdomain becomes covered (all
 *   mapped subdomains matter equally).
 * - OR: only the subdomain(s) that drove the score become covered, i.e.
 *   the uncovered mapped subdomain(s) with the highest need. Ties count
 *   as all covered.
 *
 * Needs are static for the whole algorithm run (they only depend on the
 * user's scores), so this only needs the mapping and the running covered
 * set - not "which round" it is.
 */
export function getCoveredSubdomains(
  mapping: ProgramMapping | undefined,
  needs: Record<string, number>,
  alreadyCovered: ReadonlySet<string>
): string[] {
  if (!mapping) return [];

  const uncovered = mapping.subdomains.filter((s) => !alreadyCovered.has(s));
  if (uncovered.length === 0) return [];

  if (mapping.type === 'AND') {
    return uncovered;
  }

  // OR
  const withNeeds = uncovered.map((subdomain) => ({ subdomain, need: needs[subdomain] ?? 0 }));
  const maxNeed = Math.max(...withNeeds.map((e) => e.need));
  return withNeeds.filter((e) => e.need === maxNeed).map((e) => e.subdomain);
}

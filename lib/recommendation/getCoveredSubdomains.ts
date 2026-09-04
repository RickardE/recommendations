import type { ProgramMapping } from '../types';

/**
 * Determines which subdomains a mapping "meaningfully covers" if the
 * program is selected right now, given what's already covered.
 *
 * COVERAGE RULE: every currently-uncovered mapped subdomain becomes
 * covered - regardless of mapping type. This applies just as much to OR
 * as to SINGLE/AND: an OR program's "driver" (its strongest-need
 * subdomain) only explains *why* it scored the way it did, it does not
 * limit what gets covered. Selecting "Nutrition OR Physical activity"
 * covers both Nutrition and Physical activity, not just whichever one
 * happened to have the higher need - otherwise a later round could
 * recommend a different program purely to "re-cover" a subdomain this one
 * was already mapped to.
 *
 * `needs` is accepted for signature stability (earlier versions of this
 * function used it to pick the OR driver) but is unused now that coverage
 * no longer depends on need values at all.
 *
 * Needs are static for the whole algorithm run (they only depend on the
 * user's scores), so this only needs the mapping and the running covered
 * set - not "which round" it is.
 */
export function getCoveredSubdomains(
  mapping: ProgramMapping | undefined,
  _needs: Record<string, number>,
  alreadyCovered: ReadonlySet<string>
): string[] {
  if (!mapping) return [];

  return mapping.subdomains.filter((s) => !alreadyCovered.has(s));
}

import type { SubdomainNeedEntry } from '../types';
import { round1 } from './format';

export type ScoreCalculation = {
  score: number;
  formula: string;
  /**
   * false when at least one considered subdomain's need falls below
   * AND_ELIGIBILITY_MIN_NEED - the program must never be selectable in
   * that state, no matter how the rest of its subdomains look. true for
   * an empty entry list too (nothing to disqualify it).
   */
  eligible: boolean;
  /** Which considered subdomain(s) caused eligible=false. Empty otherwise. */
  belowFloorSubdomains: string[];
};

/**
 * Every mapped subdomain must clear this need before an AND program can be
 * selected at all - not just before it gets a bonus (contrast with OR's
 * OR_BONUS_MIN_NEED, which only gates the bonus, never eligibility itself).
 * Kept as its own constant, distinct from OR_BONUS_MIN_NEED, even though
 * both currently default to 60: they answer different questions ("is this
 * subdomain worth a bonus?" vs. "is this program allowed to be picked at
 * all?") and may need to be tuned independently later.
 */
export const AND_ELIGIBILITY_MIN_NEED = 60;

/**
 * AND: every mapped subdomain is equally important.
 *
 * Two rules, both keyed off the same AND_ELIGIBILITY_MIN_NEED floor:
 *
 * 1. ELIGIBILITY: if any considered subdomain's need is below the floor,
 *    the program is disqualified outright - score 0, eligible: false. This
 *    is enforced again, up front, in selectRecommendations.ts (so such a
 *    program can never win a round even when it's the only candidate), but
 *    calculateAndScore is the single source of truth for what "below
 *    floor" means, so both call sites can never disagree.
 * 2. BONUS: once every subdomain clears the floor, the average gets a
 *    single flat +10% bonus (not per-subdomain, not compounding with
 *    subdomain count) - capped at 100, same as OR's cap.
 */
export function calculateAndScore(
  entries: SubdomainNeedEntry[],
  minNeed: number = AND_ELIGIBILITY_MIN_NEED
): ScoreCalculation {
  if (entries.length === 0) {
    return { score: 0, formula: 'No subdomains to average.', eligible: true, belowFloorSubdomains: [] };
  }

  const sum = entries.reduce((total, e) => total + e.need, 0);
  const average = sum / entries.length;
  const averagePart = `(${entries.map((e) => e.need).join(' + ')}) / ${entries.length} = ${round1(average)}`;

  const belowFloor = entries.filter((e) => e.need < minNeed);
  if (belowFloor.length > 0) {
    const formula = `${averagePart} - disqualified: ${belowFloor
      .map((e) => e.subdomain)
      .join(', ')} below the minimum need of ${minNeed} required for every AND subdomain`;
    return { score: 0, formula, eligible: false, belowFloorSubdomains: belowFloor.map((e) => e.subdomain) };
  }

  const score = Math.min(100, average * 1.1);
  const formula = `${averagePart}, all subdomains ≥ ${minNeed} so +10% bonus applies = ${round1(score)}`;
  return { score, formula, eligible: true, belowFloorSubdomains: [] };
}

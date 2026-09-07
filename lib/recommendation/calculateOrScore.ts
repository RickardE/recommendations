import type { SubdomainNeedEntry } from '../types';
import { round1 } from './format';

export type OrScoreCalculation = {
  score: number;
  formula: string;
  /** The subdomain(s) with the highest need, i.e. the score's primary driver(s). */
  driverSubdomains: string[];
};

/**
 * A companion subdomain only contributes to the OR bonus if its own need
 * clears this bar. Below it, the companion is too ordinary a need to
 * justify boosting the program above a competitor that matches the
 * driving need exactly (e.g. a SINGLE program on that same subdomain) -
 * see calculateOrScore's doc comment for the concrete motivating case.
 */
export const OR_BONUS_MIN_NEED = 60;

/**
 * OR: the strongest mapped need drives the score; other mapped needs only
 * contribute a 10% bonus, and only if they clear OR_BONUS_MIN_NEED
 * themselves.
 *
 * WHY THE THRESHOLD: without it, even a thoroughly ordinary companion need
 * (e.g. 50) adds a flat bonus that can tip an OR program above a program
 * that matches the dominant need exactly. Concretely: Stress=99 with every
 * other subdomain at a middling 50 - "Manage stress" (SINGLE on Stress)
 * scores 99, but "Become more mindful" (OR: Smärta, Stress) used to score
 * 99 + 50×0.10 = 104 (capped to 100), edging out the exact match purely
 * because Smärta happened to be "some" need, not because it was actually
 * significant. Gating the bonus on the companion's own need fixes that
 * without changing anything when the companion genuinely is significant.
 *
 * ASSUMPTION: when several subdomains tie for the highest need, all of
 * them are treated as "the strongest" (consistent with the coverage rule
 * in getCoveredSubdomains), and the bonus is computed only from the
 * remaining, strictly-lower entries that also clear the threshold. If
 * every entry ties, there are no "others" and the score is simply the
 * (shared) max need - the threshold plays no part in that case.
 */
export function calculateOrScore(
  entries: SubdomainNeedEntry[],
  bonusMinNeed: number = OR_BONUS_MIN_NEED
): OrScoreCalculation {
  if (entries.length === 0) {
    return { score: 0, formula: 'No subdomains mapped', driverSubdomains: [] };
  }

  if (entries.length === 1) {
    const only = entries[0]!;
    return {
      score: only.need,
      formula: `${only.need} (only mapped subdomain)`,
      driverSubdomains: [only.subdomain],
    };
  }

  const maxNeed = Math.max(...entries.map((e) => e.need));
  const drivers = entries.filter((e) => e.need === maxNeed);
  const others = entries.filter((e) => e.need < maxNeed);

  if (others.length === 0) {
    return {
      score: maxNeed,
      formula: `${maxNeed} (all mapped subdomains tied at the highest need)`,
      driverSubdomains: drivers.map((e) => e.subdomain),
    };
  }

  const qualifyingOthers = others.filter((e) => e.need >= bonusMinNeed);

  if (qualifyingOthers.length === 0) {
    return {
      score: maxNeed,
      formula: `${maxNeed} (no other mapped subdomain reaches the minimum need of ${bonusMinNeed} for a bonus)`,
      driverSubdomains: drivers.map((e) => e.subdomain),
    };
  }

  const avgOthers = qualifyingOthers.reduce((total, e) => total + e.need, 0) / qualifyingOthers.length;
  const rawScore = maxNeed + avgOthers * 0.1;
  // Needs are normally 0-100, but the bonus term can push the raw sum
  // slightly past 100 (e.g. maxNeed=99, avgOthers=96 -> 108.6) - relevance
  // is capped back down to the same [0, 100] scale as every other score.
  const score = Math.min(100, rawScore);
  const cappedNote = score < rawScore ? `, capped at 100` : '';
  const excludedNote =
    qualifyingOthers.length < others.length
      ? ` (excluding ${others.length - qualifyingOthers.length} below the bonus threshold of ${bonusMinNeed})`
      : '';
  const formula = `${maxNeed} + (avg(${qualifyingOthers.map((e) => e.need).join(', ')}) × 0.1)${excludedNote} = ${maxNeed} + (${round1(
    avgOthers
  )} × 0.1) = ${round1(rawScore)}${cappedNote}`;

  return { score, formula, driverSubdomains: drivers.map((e) => e.subdomain) };
}

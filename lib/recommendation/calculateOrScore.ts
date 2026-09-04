import type { SubdomainNeedEntry } from '../types';
import { round1 } from './format';

export type OrScoreCalculation = {
  score: number;
  formula: string;
  /** The subdomain(s) with the highest need, i.e. the score's primary driver(s). */
  driverSubdomains: string[];
};

/**
 * OR: the strongest mapped need drives the score; the other mapped needs
 * only contribute a 10% bonus.
 *
 * ASSUMPTION: when several subdomains tie for the highest need, all of
 * them are treated as "the strongest" (consistent with the coverage rule
 * in getCoveredSubdomains), and the 10% bonus is computed only from the
 * remaining, strictly-lower entries. If every entry ties, there are no
 * "others" and the score is simply the (shared) max need.
 */
export function calculateOrScore(entries: SubdomainNeedEntry[]): OrScoreCalculation {
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

  const avgOthers = others.reduce((total, e) => total + e.need, 0) / others.length;
  const score = maxNeed + avgOthers * 0.1;
  const formula = `${maxNeed} + (avg(${others.map((e) => e.need).join(', ')}) × 0.1) = ${maxNeed} + (${round1(
    avgOthers
  )} × 0.1) = ${round1(score)}`;

  return { score, formula, driverSubdomains: drivers.map((e) => e.subdomain) };
}

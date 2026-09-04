import type { SubdomainNeedEntry } from '../types';
import { round1 } from './format';

export type SingleScoreCalculation = {
  score: number;
  formula: string;
};

/**
 * SINGLE: the program maps to exactly one subdomain, so its score is that
 * subdomain's need, verbatim - no averaging, no driver/bonus split.
 */
export function calculateSingleScore(entries: SubdomainNeedEntry[]): SingleScoreCalculation {
  if (entries.length === 0) {
    return { score: 0, formula: 'No subdomain mapped' };
  }
  const only = entries[0]!;
  return { score: only.need, formula: `${round1(only.need)}` };
}

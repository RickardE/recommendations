import type { SubdomainNeedEntry } from '../types';
import { round1 } from './format';

export type ScoreCalculation = {
  score: number;
  formula: string;
};

/**
 * AND: every mapped subdomain is equally important -> plain average of need.
 */
export function calculateAndScore(entries: SubdomainNeedEntry[]): ScoreCalculation {
  if (entries.length === 0) {
    return { score: 0, formula: 'No subdomains to average' };
  }
  const sum = entries.reduce((total, e) => total + e.need, 0);
  const score = sum / entries.length;
  const formula = `(${entries.map((e) => e.need).join(' + ')}) / ${entries.length} = ${round1(score)}`;
  return { score, formula };
}

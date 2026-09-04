import type { Program, ProgramScoreResult, SubdomainNeedEntry } from '../types';
import { calculateAndScore } from './calculateAndScore';
import { calculateOrScore } from './calculateOrScore';

/**
 * Scores a single program against the current needs, considering only
 * subdomains that are not already in `coveredSet`. Pass an empty set to
 * get the program's "full", uncovered-agnostic score.
 *
 * This is the one place AND vs. OR semantics are dispatched - see
 * calculateAndScore / calculateOrScore for the actual formulas.
 */
export function calculateProgramScore(
  program: Program,
  needs: Record<string, number>,
  coveredSet: ReadonlySet<string>
): ProgramScoreResult {
  const mapping = program.mappings[0];

  if (!mapping || mapping.subdomains.length === 0) {
    return {
      program,
      mappingType: null,
      consideredSubdomains: [],
      score: 0,
      formula: 'No subdomain mapping',
      contributingSubdomains: [],
      newCoverage: [],
    };
  }

  const considered: SubdomainNeedEntry[] = mapping.subdomains
    .filter((s) => !coveredSet.has(s))
    .map((s) => ({ subdomain: s, need: needs[s] ?? 0 }));

  if (considered.length === 0) {
    return {
      program,
      mappingType: mapping.type,
      consideredSubdomains: [],
      score: 0,
      formula: 'All mapped subdomains are already covered',
      contributingSubdomains: [],
      newCoverage: [],
    };
  }

  if (mapping.type === 'AND') {
    const { score, formula } = calculateAndScore(considered);
    return {
      program,
      mappingType: 'AND',
      consideredSubdomains: considered,
      score,
      formula,
      contributingSubdomains: considered.map((e) => e.subdomain),
      // AND: every considered subdomain matters equally, so all of them
      // are newly covered.
      newCoverage: considered.map((e) => e.subdomain),
    };
  }

  const { score, formula, driverSubdomains } = calculateOrScore(considered);
  return {
    program,
    mappingType: 'OR',
    consideredSubdomains: considered,
    score,
    formula,
    contributingSubdomains: considered.map((e) => e.subdomain),
    // OR: only the driver(s) - the strongest need(s) - are newly covered.
    newCoverage: driverSubdomains,
  };
}

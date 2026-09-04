import type { Program, ProgramScoreResult, SubdomainNeedEntry } from '../types';
import { calculateAndScore } from './calculateAndScore';
import { calculateOrScore } from './calculateOrScore';
import { calculateSingleScore } from './calculateSingleScore';

/**
 * Scores a single program against the current needs, considering only
 * subdomains that are not already in `coveredSet`. Pass an empty set to
 * get the program's "full", uncovered-agnostic score.
 *
 * This is the one place SINGLE vs. AND vs. OR semantics are dispatched -
 * see calculateSingleScore / calculateAndScore / calculateOrScore for the
 * actual formulas. The mapping type used here always comes straight from
 * `program.mappings[0].type` (the original matrix), never from how many
 * subdomains happen to still be uncovered - see the comments on each
 * branch below.
 *
 * `targetSubdomain` is not set here - it is a property of *which round*
 * this score was computed for (see selectRecommendations.ts), not of the
 * program/needs/coveredSet inputs alone, so callers outside that round
 * context (e.g. unit tests) get `targetSubdomain: null` and
 * selectRecommendations fills it in afterwards.
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
      targetSubdomain: null,
      consideredSubdomains: [],
      ignoredCoveredSubdomains: [],
      score: 0,
      formula: 'No subdomain mapping',
      contributingSubdomains: [],
      newCoverage: [],
    };
  }

  const considered: SubdomainNeedEntry[] = mapping.subdomains
    .filter((s) => !coveredSet.has(s))
    .map((s) => ({ subdomain: s, need: needs[s] ?? 0 }));

  // Original mapped subdomains excluded from this calculation because
  // they're already covered. Computed once and reused below - this is
  // purely a by-product of `coveredSet`, never of the mapping type.
  const ignoredCoveredSubdomains = mapping.subdomains.filter((s) => coveredSet.has(s));

  if (considered.length === 0) {
    return {
      program,
      mappingType: mapping.type,
      targetSubdomain: null,
      consideredSubdomains: [],
      ignoredCoveredSubdomains,
      score: 0,
      formula: 'All mapped subdomains are already covered',
      contributingSubdomains: [],
      newCoverage: [],
    };
  }

  if (mapping.type === 'SINGLE') {
    const { score, formula } = calculateSingleScore(considered);
    return {
      program,
      mappingType: 'SINGLE',
      targetSubdomain: null,
      consideredSubdomains: considered,
      ignoredCoveredSubdomains,
      score,
      formula,
      contributingSubdomains: considered.map((e) => e.subdomain),
      // SINGLE: the one mapped subdomain is newly covered.
      newCoverage: considered.map((e) => e.subdomain),
    };
  }

  if (mapping.type === 'AND') {
    const { score, formula } = calculateAndScore(considered);
    return {
      program,
      mappingType: 'AND',
      targetSubdomain: null,
      consideredSubdomains: considered,
      ignoredCoveredSubdomains,
      score,
      formula,
      contributingSubdomains: considered.map((e) => e.subdomain),
      // AND: every considered subdomain matters equally, so all of them
      // are newly covered. This holds even when only one subdomain
      // remains uncovered - the program is still AND, never SINGLE; the
      // mapping type always comes from `mapping.type` above, never from
      // considered.length.
      newCoverage: considered.map((e) => e.subdomain),
    };
  }

  const { score, formula, driverSubdomains } = calculateOrScore(considered);
  return {
    program,
    mappingType: 'OR',
    targetSubdomain: null,
    consideredSubdomains: considered,
    ignoredCoveredSubdomains,
    score,
    formula,
    contributingSubdomains: considered.map((e) => e.subdomain),
    // OR: only the driver(s) - the strongest need(s) - are newly covered.
    newCoverage: driverSubdomains,
  };
}

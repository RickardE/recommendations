import type { Program, ProgramScoreResult, RecommendationResult, RoundResult } from '../types';
import { calculateNeeds } from './calculateNeeds';
import { calculateProgramScore } from './calculateProgramScore';

export type RecommendationConfig = {
  /** How many programs to select. */
  numberOfRecommendations: number;
};

export const DEFAULT_RECOMMENDATION_CONFIG: RecommendationConfig = {
  numberOfRecommendations: 3,
};

/**
 * First-appearance order of every subdomain referenced by any program's
 * mapping, in `programs` order. Used purely as a deterministic tie-break
 * when two or more subdomains share the same need (see step 2-3 below) -
 * it has no effect on which subdomain wins unless needs are exactly equal.
 */
function buildSubdomainOrder(programs: Program[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const program of programs) {
    for (const subdomain of program.mappings[0]?.subdomains ?? []) {
      if (!seen.has(subdomain)) {
        seen.add(subdomain);
        ordered.push(subdomain);
      }
    }
  }
  return ordered;
}

/**
 * Runs the full round-by-round recommendation algorithm, SUBDOMAIN-FIRST:
 *
 * Each round:
 *   1. need = 100 - userScore for every subdomain (calculated once, up
 *      front - needs are static for the whole run).
 *   2-4. Among subdomains not yet covered, find the one with the highest
 *      need that at least one *eligible* program is still mapped to (see
 *      the STRICT COVERAGE RULE below for "eligible"). That is this
 *      round's *target subdomain*.
 *   5-6. Every eligible program whose ORIGINAL mapping includes the target
 *      subdomain is a candidate, scored using its original mapping type
 *      (SINGLE/AND/OR - see calculateProgramScore). Because eligibility
 *      already guarantees a candidate's whole mapping is uncovered (see
 *      below), it's always scored against its full original mapping -
 *      there's never a partially-covered candidate in practice.
 *   7-8. The highest-scoring candidate is selected.
 *   9-10. Selecting a program covers *every* one of its mapped
 *      subdomains - all of them, regardless of mapping type. The next
 *      round then repeats with the next highest-need still-uncovered
 *      subdomain.
 *
 * STRICT COVERAGE RULE: a program is only eligible while *none* of its
 * mapped subdomains are covered - SINGLE, AND, and OR are all held to the
 * exact same rule. The moment even one of a program's mapped subdomains
 * gets covered (by *any* selection, including a different program's),
 * that program is permanently disqualified, even though some of its other
 * subdomains may still be uncovered. This guarantees the final
 * recommendation set never shares a subdomain across two programs, at the
 * cost of a subdomain sometimes becoming unreachable once every program
 * mapped to it has been disqualified this way - see
 * selectRecommendations.test.ts for a worked "orphaned subdomain" example
 * from the real matrix (Tobak).
 *
 * If no uncovered subdomain has any eligible candidate left, the round -
 * and the whole run - stops there; there is no "pick something anyway"
 * fallback.
 *
 * Because a candidate's entire mapping is guaranteed uncovered (see the
 * strict rule above), it necessarily covers the target if selected - the
 * `newCoverage.includes(target)` check below is a defensive
 * belt-and-braces guard, not an expected filter.
 */
export function selectRecommendations(
  programs: Program[],
  scores: Record<string, number>,
  config: RecommendationConfig = DEFAULT_RECOMMENDATION_CONFIG
): RecommendationResult {
  const needs = calculateNeeds(scores);
  const coveredSet = new Set<string>();
  const selectedIds = new Set<string>();
  const rounds: RoundResult[] = [];
  const recommendations: ProgramScoreResult[] = [];

  const mappedPrograms = programs.filter((p) => (p.mappings[0]?.subdomains.length ?? 0) > 0);
  const unmappedPrograms = programs.filter((p) => (p.mappings[0]?.subdomains.length ?? 0) === 0);

  const subdomainOrder = buildSubdomainOrder(programs);

  for (let round = 1; round <= config.numberOfRecommendations; round += 1) {
    // STRICT COVERAGE RULE (see doc comment above): a program is eligible
    // only while it hasn't been selected yet AND none of its mapped
    // subdomains are covered - regardless of mapping type.
    const remaining = mappedPrograms.filter(
      (p) => !selectedIds.has(p.id) && !p.mappings[0]!.subdomains.some((s) => coveredSet.has(s))
    );

    const coveredBefore = Array.from(coveredSet);

    if (remaining.length === 0) {
      // Every mapped program is either already selected or disqualified
      // by the strict coverage rule - logged as its own 'none' round
      // (rather than a silent stop) so the debug UI can show exactly
      // when and why the run ran out of eligible candidates.
      rounds.push({
        round,
        selectionType: 'none',
        targetSubdomain: null,
        allScores: [],
        selected: null,
        coveredBefore,
        coveredAfter: coveredBefore,
      });
      break;
    }

    // Steps 2-3: uncovered subdomains, highest need first. Array.sort is
    // stable, and subdomainOrder is already deterministic, so equal-need
    // subdomains keep subdomainOrder's relative order.
    const uncoveredByNeed = subdomainOrder
      .filter((s) => !coveredSet.has(s))
      .sort((a, b) => (needs[b] ?? 0) - (needs[a] ?? 0));

    // Step 4-5: the first uncovered subdomain (highest need) that some
    // remaining program is still mapped to becomes the target.
    let target: string | null = null;
    let candidates: Program[] = [];
    for (const subdomain of uncoveredByNeed) {
      const mappedToThis = remaining.filter((p) => p.mappings[0]!.subdomains.includes(subdomain));
      if (mappedToThis.length > 0) {
        target = subdomain;
        candidates = mappedToThis;
        break;
      }
    }

    if (!target) {
      rounds.push({
        round,
        selectionType: 'none',
        targetSubdomain: null,
        allScores: [],
        selected: null,
        coveredBefore,
        coveredAfter: coveredBefore,
      });
      break;
    }

    // Steps 6-7: score every candidate using its ORIGINAL mapping type,
    // considering only currently-uncovered subdomains (already exactly
    // what calculateProgramScore does).
    const scored = candidates
      .map((p) => ({ ...calculateProgramScore(p, needs, coveredSet), targetSubdomain: target }))
      .sort((a, b) => b.score - a.score);

    // Step 8: only a candidate that actually covers the target counts
    // (see the NOTE in the doc comment above for why this in practice
    // never excludes the top-scored candidate).
    const selected = scored.find((r) => r.newCoverage.includes(target)) ?? null;

    if (!selected) {
      rounds.push({
        round,
        selectionType: 'none',
        targetSubdomain: target,
        allScores: scored,
        selected: null,
        coveredBefore,
        coveredAfter: coveredBefore,
      });
      break;
    }

    // Step 9
    selectedIds.add(selected.program.id);
    recommendations.push(selected);
    for (const subdomain of selected.newCoverage) coveredSet.add(subdomain);
    const coveredAfter = Array.from(coveredSet);

    rounds.push({
      round,
      selectionType: 'primary',
      targetSubdomain: target,
      allScores: scored,
      selected,
      coveredBefore,
      coveredAfter,
    });
  }

  return { needs, rounds, recommendations, unmappedPrograms };
}

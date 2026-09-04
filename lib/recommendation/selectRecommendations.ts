import type { Program, ProgramScoreResult, RecommendationResult, RoundResult } from '../types';
import { calculateNeeds } from './calculateNeeds';
import { calculateProgramScore } from './calculateProgramScore';
import { calculateRedundancyFactor, REDUNDANCY_BUCKETS, type RedundancyBucket } from './calculateRedundancy';
import { round1 } from './format';

export type RecommendationConfig = {
  /** How many programs to select. */
  numberOfRecommendations: number;
  /** A program needs at least this many newly-covered subdomains to count as "meaningful". */
  minNewCoverageCount: number;
  /** Redundancy buckets used by the fallback path, see calculateRedundancy.ts. */
  redundancyBuckets: RedundancyBucket[];
};

export const DEFAULT_RECOMMENDATION_CONFIG: RecommendationConfig = {
  numberOfRecommendations: 3,
  minNewCoverageCount: 1,
  redundancyBuckets: REDUNDANCY_BUCKETS,
};

/**
 * Runs the full round-by-round recommendation algorithm:
 *
 * Each round, every not-yet-selected, mapped program is scored using only
 * still-uncovered subdomains ("primary" scoring). The highest-scoring
 * program that contributes at least `minNewCoverageCount` newly-covered
 * subdomains is selected.
 *
 * If no remaining program offers meaningful new coverage, we fall back
 * (step 8 of the spec): score every remaining program on its full,
 * original mapping, apply a redundancy penalty based on how much it
 * overlaps with what's already covered, and pick the best of those.
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

  for (let round = 1; round <= config.numberOfRecommendations; round += 1) {
    const remaining = mappedPrograms.filter((p) => !selectedIds.has(p.id));
    if (remaining.length === 0) break;

    const coveredBefore = Array.from(coveredSet);

    const primaryScores = remaining
      .map((p) => calculateProgramScore(p, needs, coveredSet))
      .sort((a, b) => b.score - a.score);

    const withNewCoverage = primaryScores.filter((r) => r.newCoverage.length >= config.minNewCoverageCount);

    let selectionType: RoundResult['selectionType'] = 'primary';
    let allScores: ProgramScoreResult[] = primaryScores;
    let selected: ProgramScoreResult | null = null;

    if (withNewCoverage.length > 0) {
      selected = withNewCoverage[0]!;
    } else {
      // Fallback path: nothing left offers new coverage. Score every
      // remaining program on its full mapping and penalize for overlap.
      selectionType = 'fallback';
      const emptyCoverage = new Set<string>();
      const fallbackScores = remaining
        .map((p) => {
          const full = calculateProgramScore(p, needs, emptyCoverage);
          const mapping = p.mappings[0];
          const redundancy = calculateRedundancyFactor(
            mapping?.subdomains ?? [],
            coveredSet,
            config.redundancyBuckets
          );
          const penalizedScore = full.score * redundancy.factor;
          return {
            ...full,
            score: penalizedScore,
            formula: `${full.formula}, then × redundancy factor ${redundancy.factor} (${redundancy.label}, ${round1(
              redundancy.ratio * 100
            )}% already covered) = ${round1(penalizedScore)}`,
            newCoverage: [], // by construction these programs offer nothing new
            redundancy,
          };
        })
        .sort((a, b) => b.score - a.score);
      allScores = fallbackScores;
      selected = fallbackScores[0] ?? null;
    }

    if (!selected) {
      rounds.push({
        round,
        selectionType: 'none',
        allScores,
        selected: null,
        coveredBefore,
        coveredAfter: coveredBefore,
      });
      break;
    }

    selectedIds.add(selected.program.id);
    recommendations.push(selected);
    for (const subdomain of selected.newCoverage) coveredSet.add(subdomain);
    const coveredAfter = Array.from(coveredSet);

    rounds.push({ round, selectionType, allScores, selected, coveredBefore, coveredAfter });
  }

  return { needs, rounds, recommendations, unmappedPrograms };
}

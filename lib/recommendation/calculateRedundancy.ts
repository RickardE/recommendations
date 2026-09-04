/**
 * Redundancy penalty for the "fallback" selection path (see
 * selectRecommendations.ts, step 8 of the spec): once no remaining program
 * offers any new coverage, we still need to fill out the recommendation
 * slots, so we fall back to a program's full (uncovered-agnostic) score
 * and penalize it by how much it overlaps with what's already covered.
 *
 * Deliberately configurable: tune the thresholds/factors here without
 * touching the selection logic.
 */
export type RedundancyBucket = {
  /** Overlap ratios <= this value fall into this bucket. */
  maxOverlapRatio: number;
  factor: number;
  label: string;
};

export const REDUNDANCY_BUCKETS: RedundancyBucket[] = [
  { maxOverlapRatio: 0, factor: 1.0, label: 'No meaningful overlap' },
  { maxOverlapRatio: 0.34, factor: 0.8, label: 'Some overlap' },
  { maxOverlapRatio: 0.67, factor: 0.5, label: 'High overlap' },
  { maxOverlapRatio: 1, factor: 0.3, label: 'Very high overlap' },
];

/** Fraction (0-1) of `subdomains` that is already in `coveredSet`. */
export function calculateOverlapRatio(subdomains: string[], coveredSet: ReadonlySet<string>): number {
  if (subdomains.length === 0) return 0;
  const overlapCount = subdomains.filter((s) => coveredSet.has(s)).length;
  return overlapCount / subdomains.length;
}

export type RedundancyResult = {
  ratio: number;
  factor: number;
  label: string;
};

export function calculateRedundancyFactor(
  subdomains: string[],
  coveredSet: ReadonlySet<string>,
  buckets: RedundancyBucket[] = REDUNDANCY_BUCKETS
): RedundancyResult {
  const ratio = calculateOverlapRatio(subdomains, coveredSet);
  const bucket = buckets.find((b) => ratio <= b.maxOverlapRatio) ?? buckets[buckets.length - 1]!;
  return { ratio, factor: bucket.factor, label: bucket.label };
}

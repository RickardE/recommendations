import { describe, expect, it } from 'vitest';
import { calculateOverlapRatio, calculateRedundancyFactor } from '../calculateRedundancy';

describe('calculateOverlapRatio', () => {
  it('is 0 with no overlap', () => {
    expect(calculateOverlapRatio(['A', 'B'], new Set(['C']))).toBe(0);
  });

  it('is the fraction already covered', () => {
    expect(calculateOverlapRatio(['A', 'B', 'C', 'D'], new Set(['A', 'B']))).toBe(0.5);
  });
});

describe('calculateRedundancyFactor', () => {
  it('applies no penalty when there is no overlap', () => {
    expect(calculateRedundancyFactor(['A', 'B'], new Set()).factor).toBe(1.0);
  });

  it('applies a mild penalty for some overlap', () => {
    expect(calculateRedundancyFactor(['A', 'B', 'C'], new Set(['A'])).factor).toBe(0.8);
  });

  it('applies a heavier penalty for high overlap', () => {
    expect(calculateRedundancyFactor(['A', 'B'], new Set(['A'])).factor).toBe(0.5);
  });

  it('applies the heaviest penalty for very high (full) overlap', () => {
    expect(calculateRedundancyFactor(['A', 'B'], new Set(['A', 'B'])).factor).toBe(0.3);
  });

  it('is configurable via custom buckets', () => {
    const result = calculateRedundancyFactor(['A'], new Set(['A']), [{ maxOverlapRatio: 1, factor: 0.99, label: 'custom' }]);
    expect(result.factor).toBe(0.99);
    expect(result.label).toBe('custom');
  });
});

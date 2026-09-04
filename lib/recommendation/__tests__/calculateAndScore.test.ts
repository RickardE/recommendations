import { describe, expect, it } from 'vitest';
import { calculateAndScore } from '../calculateAndScore';

describe('calculateAndScore', () => {
  it('averages need across all mapped subdomains', () => {
    // Stress=90 need, Anxiety=40 need, Depression=70 need -> from the spec example
    const { score } = calculateAndScore([
      { subdomain: 'Stress', need: 90 },
      { subdomain: 'Anxiety', need: 40 },
      { subdomain: 'Depression', need: 70 },
    ]);
    expect(score).toBeCloseTo(66.7, 1);
  });

  it('is the value itself for a single subdomain', () => {
    const { score } = calculateAndScore([{ subdomain: 'Stress', need: 42 }]);
    expect(score).toBe(42);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateAndScore([]).score).toBe(0);
  });
});

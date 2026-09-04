import { describe, expect, it } from 'vitest';
import { calculateSingleScore } from '../calculateSingleScore';

describe('calculateSingleScore', () => {
  it('is exactly the one mapped subdomain\'s need', () => {
    // "Get out of the blues" -> Depression, need 82.
    const { score } = calculateSingleScore([{ subdomain: 'Depression', need: 82 }]);
    expect(score).toBe(82);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateSingleScore([]).score).toBe(0);
  });
});

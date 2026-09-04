import { describe, expect, it } from 'vitest';
import { calculateNeed, calculateNeeds } from '../calculateNeeds';

describe('calculateNeed', () => {
  it('is 100 minus the score', () => {
    expect(calculateNeed(20)).toBe(80);
    expect(calculateNeed(0)).toBe(100);
    expect(calculateNeed(100)).toBe(0);
  });

  it('clamps out-of-range scores', () => {
    expect(calculateNeed(-10)).toBe(100);
    expect(calculateNeed(150)).toBe(0);
  });
});

describe('calculateNeeds', () => {
  it('maps every subdomain score to its need', () => {
    expect(calculateNeeds({ Stress: 90, Sömn: 40 })).toEqual({ Stress: 10, Sömn: 60 });
  });
});

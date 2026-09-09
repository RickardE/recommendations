import { describe, expect, it } from 'vitest';
import { calculateAndScore, AND_ELIGIBILITY_MIN_NEED } from '../calculateAndScore';

describe('calculateAndScore', () => {
  it('averages need across all mapped subdomains, then applies the +10% eligibility bonus', () => {
    // Stress=90 need, Ångest=70 need, Depression=70 need - all clear the
    // eligibility floor, so the average gets the flat +10% bonus.
    // avg = (90 + 70 + 70) / 3 = 76.7, bonused = 84.3(6)
    const { score, eligible } = calculateAndScore([
      { subdomain: 'Stress', need: 90 },
      { subdomain: 'Ångest', need: 70 },
      { subdomain: 'Depression', need: 70 },
    ]);
    expect(eligible).toBe(true);
    expect(score).toBeCloseTo(84.33, 1);
  });

  it('is the value itself, plus the bonus, for a single subdomain at or above the floor', () => {
    const { score, eligible } = calculateAndScore([{ subdomain: 'Stress', need: 80 }]);
    expect(eligible).toBe(true);
    expect(score).toBeCloseTo(88, 5); // 80 * 1.1
  });

  it('returns 0 for an empty list, and treats it as (vacuously) eligible', () => {
    const result = calculateAndScore([]);
    expect(result.score).toBe(0);
    expect(result.eligible).toBe(true);
    expect(result.belowFloorSubdomains).toEqual([]);
  });

  // The eligibility floor: an AND program must never be picked while any
  // one of its mapped subdomains sits below AND_ELIGIBILITY_MIN_NEED - not
  // just scored lower, but disqualified outright (score 0, eligible:
  // false). This is what selectRecommendations.ts's pre-filter reads to
  // keep such a program out of every round for the whole run.
  describe('the AND eligibility floor (AND_ELIGIBILITY_MIN_NEED)', () => {
    it('disqualifies the program when any considered subdomain is below the floor', () => {
      // Depression=75, Ångest=55 (below 60) - one weak link disqualifies
      // the whole program, even though Depression alone is a strong need.
      const { score, eligible, belowFloorSubdomains, formula } = calculateAndScore([
        { subdomain: 'Depression', need: 75 },
        { subdomain: 'Ångest', need: 55 },
      ]);
      expect(eligible).toBe(false);
      expect(score).toBe(0);
      expect(belowFloorSubdomains).toEqual(['Ångest']);
      expect(formula).toContain('disqualified');
      expect(formula).toContain('Ångest');
    });

    it('reports every considered subdomain that falls below the floor, not just the first', () => {
      const { belowFloorSubdomains } = calculateAndScore([
        { subdomain: 'A', need: 40 },
        { subdomain: 'B', need: 90 },
        { subdomain: 'C', need: 10 },
      ]);
      expect(belowFloorSubdomains).toEqual(['A', 'C']);
    });

    it('treats a subdomain exactly at the floor as eligible (inclusive)', () => {
      const { eligible, score } = calculateAndScore([
        { subdomain: 'A', need: AND_ELIGIBILITY_MIN_NEED },
        { subdomain: 'B', need: 80 },
      ]);
      expect(eligible).toBe(true);
      expect(score).toBeCloseTo((AND_ELIGIBILITY_MIN_NEED + 80) * 0.5 * 1.1, 5);
    });

    it('applies exactly one flat +10% bonus, not one per subdomain', () => {
      // 4 subdomains, all eligible - the bonus should scale with the
      // average, not compound per subdomain.
      const needs = [70, 70, 70, 70];
      const { score } = calculateAndScore(needs.map((need, i) => ({ subdomain: `S${i}`, need })));
      expect(score).toBeCloseTo(70 * 1.1, 5); // 77, not e.g. 70 * 1.1^4
    });

    it('caps the bonused score at 100', () => {
      const { score } = calculateAndScore([
        { subdomain: 'A', need: 96 },
        { subdomain: 'B', need: 98 },
      ]);
      expect(score).toBe(100); // avg 97 * 1.1 = 106.7, capped
    });

    it('is configurable via an optional parameter, independent of the default constant', () => {
      const entries = [
        { subdomain: 'A', need: 55 },
        { subdomain: 'B', need: 90 },
      ];
      // Below the default floor (60), so disqualified by default...
      expect(calculateAndScore(entries).eligible).toBe(false);
      // ...but eligible against a looser, explicitly-passed floor.
      expect(calculateAndScore(entries, 50).eligible).toBe(true);
    });
  });
});

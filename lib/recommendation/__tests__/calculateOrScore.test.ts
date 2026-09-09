import { describe, expect, it } from 'vitest';
import { calculateOrScore, OR_BONUS_MIN_NEED } from '../calculateOrScore';

describe('calculateOrScore', () => {
  it('uses the strongest need plus 10% of the average of the others that clear the bonus threshold', () => {
    // Nutrition=62, Tobacco=12, Physical activity=69 -> from the spec example.
    // Tobacco (12) is well below OR_BONUS_MIN_NEED, so only Nutrition (62)
    // qualifies for the bonus: 69 + (62 * 0.1) = 75.2.
    const { score, driverSubdomains } = calculateOrScore([
      { subdomain: 'Nutrition', need: 62 },
      { subdomain: 'Tobacco', need: 12 },
      { subdomain: 'Physical activity', need: 69 },
    ]);
    expect(score).toBeCloseTo(75.2, 1);
    expect(driverSubdomains).toEqual(['Physical activity']);
  });

  it('is just the need itself when only one subdomain is mapped', () => {
    const { score, driverSubdomains } = calculateOrScore([{ subdomain: 'Sömn', need: 55 }]);
    expect(score).toBe(55);
    expect(driverSubdomains).toEqual(['Sömn']);
  });

  it('treats a tie for the highest need as multiple drivers, with no bonus from tied entries', () => {
    // strongest = 80 (A, B tied); C = 20 is below the bonus threshold, so
    // it contributes nothing: score stays exactly 80.
    const { score, driverSubdomains } = calculateOrScore([
      { subdomain: 'A', need: 80 },
      { subdomain: 'B', need: 80 },
      { subdomain: 'C', need: 20 },
    ]);
    expect(score).toBe(80);
    expect(driverSubdomains.sort()).toEqual(['A', 'B']);
  });

  it('scores as the shared max when every mapped subdomain ties', () => {
    const { score, driverSubdomains } = calculateOrScore([
      { subdomain: 'A', need: 50 },
      { subdomain: 'B', need: 50 },
    ]);
    expect(score).toBe(50);
    expect(driverSubdomains.sort()).toEqual(['A', 'B']);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateOrScore([]).score).toBe(0);
  });

  // Fix: a mediocre companion need must not be able to tip an OR program
  // above a program that matches the dominant need exactly (see
  // calculateOrScore.ts's doc comment for the motivating scenario).
  describe('the OR bonus threshold (OR_BONUS_MIN_NEED)', () => {
    it('adds no bonus when the only companion is below the threshold', () => {
      // Stress=99 (driver), Smärta=50 - the exact reported scenario.
      const { score, driverSubdomains, bonusEligibleSubdomains } = calculateOrScore([
        { subdomain: 'Smärta', need: 50 },
        { subdomain: 'Stress', need: 99 },
      ]);
      expect(score).toBe(99); // no bonus at all - same as the driver alone
      expect(driverSubdomains).toEqual(['Stress']);
      // UX fix: Smärta is still "considered" (shown in the UI) but did not
      // qualify for the bonus - this is what the Role column reads to
      // avoid contradicting the "no bonus" calculation text.
      expect(bonusEligibleSubdomains).toEqual([]);
    });

    it('still adds the bonus normally when the companion is genuinely elevated', () => {
      // Stress=99 (driver), Smärta=90 - a real second problem, not a
      // mediocre one, so the bonus should still apply.
      const { score, driverSubdomains, bonusEligibleSubdomains } = calculateOrScore([
        { subdomain: 'Smärta', need: 90 },
        { subdomain: 'Stress', need: 99 },
      ]);
      expect(score).toBe(100); // 99 + (90 * 0.1) = 108, capped to 100
      expect(driverSubdomains).toEqual(['Stress']);
      expect(bonusEligibleSubdomains).toEqual(['Smärta']);
    });

    it('reports only the qualifying companions when some clear the threshold and some do not', () => {
      // driver=99; Smärta=90 qualifies, Sömn=20 does not.
      const { bonusEligibleSubdomains } = calculateOrScore([
        { subdomain: 'Smärta', need: 90 },
        { subdomain: 'Sömn', need: 20 },
        { subdomain: 'Stress', need: 99 },
      ]);
      expect(bonusEligibleSubdomains).toEqual(['Smärta']);
    });

    it('treats a companion exactly at the threshold as qualifying (inclusive)', () => {
      const { score } = calculateOrScore([
        { subdomain: 'A', need: OR_BONUS_MIN_NEED },
        { subdomain: 'B', need: 90 },
      ]);
      expect(score).toBeCloseTo(90 + OR_BONUS_MIN_NEED * 0.1, 5);
    });

    it('is configurable via an optional parameter, independent of the default constant', () => {
      const entries = [
        { subdomain: 'Smärta', need: 50 },
        { subdomain: 'Stress', need: 99 },
      ];
      // With no threshold at all, the original (pre-fix) formula applies:
      // 99 + (50 * 0.1) = 104, capped to 100 - the exact score "Become
      // more mindful" used to get before this fix.
      expect(calculateOrScore(entries, 0).score).toBe(100);
      // A stricter threshold than the default excludes an otherwise-qualifying companion.
      expect(calculateOrScore([{ subdomain: 'A', need: 70 }, { subdomain: 'B', need: 90 }], 80).score).toBe(90);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { calculateOrScore } from '../calculateOrScore';

describe('calculateOrScore', () => {
  it('uses the strongest need plus 10% of the average of the others', () => {
    // Nutrition=62, Tobacco=12, Physical activity=69 -> from the spec example
    const { score, driverSubdomains } = calculateOrScore([
      { subdomain: 'Nutrition', need: 62 },
      { subdomain: 'Tobacco', need: 12 },
      { subdomain: 'Physical activity', need: 69 },
    ]);
    expect(score).toBeCloseTo(72.7, 1);
    expect(driverSubdomains).toEqual(['Physical activity']);
  });

  it('is just the need itself when only one subdomain is mapped', () => {
    const { score, driverSubdomains } = calculateOrScore([{ subdomain: 'Sömn', need: 55 }]);
    expect(score).toBe(55);
    expect(driverSubdomains).toEqual(['Sömn']);
  });

  it('treats a tie for the highest need as multiple drivers, with no bonus from tied entries', () => {
    const { score, driverSubdomains } = calculateOrScore([
      { subdomain: 'A', need: 80 },
      { subdomain: 'B', need: 80 },
      { subdomain: 'C', need: 20 },
    ]);
    // strongest = 80, others = [20] -> 80 + (20 * 0.1) = 82
    expect(score).toBeCloseTo(82, 5);
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
});

import { describe, expect, it } from 'vitest';
import { calculateProgramScore } from '../calculateProgramScore';
import type { Program } from '../../types';

const needs = { Stress: 90, Anxiety: 40, Depression: 70, Sömn: 10 };

describe('calculateProgramScore', () => {
  // TEST 1: "Get out of the blues" -> Depression (Depression need = 82).
  it('dispatches to the SINGLE formula for a single-subdomain mapping, and never labels it AND', () => {
    const program: Program = {
      id: 'get-out-of-the-blues',
      name: 'Get out of the blues',
      mappings: [{ type: 'SINGLE', subdomains: ['Depression'] }],
    };
    const result = calculateProgramScore(program, { Depression: 82 }, new Set());
    expect(result.mappingType).toBe('SINGLE');
    expect(result.mappingType).not.toBe('AND');
    expect(result.score).toBe(82);
    expect(result.newCoverage).toEqual(['Depression']);
  });

  it('dispatches to the AND formula for an AND mapping', () => {
    const program: Program = {
      id: 'p1',
      name: 'p1',
      mappings: [{ type: 'AND', subdomains: ['Stress', 'Anxiety', 'Depression'] }],
    };
    const result = calculateProgramScore(program, needs, new Set());
    expect(result.mappingType).toBe('AND');
    expect(result.score).toBeCloseTo(66.7, 1);
    expect(result.newCoverage.sort()).toEqual(['Anxiety', 'Depression', 'Stress']);
    expect(result.contributingSubdomains.sort()).toEqual(['Anxiety', 'Depression', 'Stress']);
  });

  it('dispatches to the OR formula and separates "contributed" from "newly covered"', () => {
    const program: Program = {
      id: 'p2',
      name: 'p2',
      mappings: [{ type: 'OR', subdomains: ['Stress', 'Sömn'] }],
    };
    const result = calculateProgramScore(program, needs, new Set());
    expect(result.mappingType).toBe('OR');
    expect(result.contributingSubdomains.sort()).toEqual(['Stress', 'Sömn']);
    expect(result.newCoverage).toEqual(['Stress']); // the driver only
  });

  it('returns a null mappingType and zero score for an unmapped program', () => {
    const program: Program = { id: 'p3', name: 'p3', mappings: [] };
    const result = calculateProgramScore(program, needs, new Set());
    expect(result.mappingType).toBeNull();
    expect(result.score).toBe(0);
  });

  it('scores 0 with no considered subdomains once everything is covered', () => {
    const program: Program = {
      id: 'p4',
      name: 'p4',
      mappings: [{ type: 'AND', subdomains: ['Stress'] }],
    };
    const result = calculateProgramScore(program, needs, new Set(['Stress']));
    expect(result.score).toBe(0);
    expect(result.consideredSubdomains).toEqual([]);
    expect(result.newCoverage).toEqual([]);
    expect(result.ignoredCoveredSubdomains).toEqual(['Stress']);
  });

  // TEST 2: "Become more mindful" -> Smärta OR Stress. Smärta=50, Stress=81.
  it('picks the highest-need subdomain as the OR driver and only covers that one', () => {
    const program: Program = {
      id: 'become-more-mindful',
      name: 'Become more mindful',
      mappings: [{ type: 'OR', subdomains: ['Smärta', 'Stress'] }],
    };
    const result = calculateProgramScore(program, { Smärta: 50, Stress: 81 }, new Set());
    expect(result.mappingType).toBe('OR');
    expect(result.score).toBeCloseTo(86, 5); // 81 + (50 * 0.10) = 86
    expect(result.newCoverage).toEqual(['Stress']);
    expect(result.newCoverage).not.toContain('Smärta');
  });

  // TEST 3 & 4: Depression AND Stress AND Ångest. Depression=82, Stress=81, Ångest=78.
  describe('an AND mapping across rounds', () => {
    const andProgram: Program = {
      id: 'and-program',
      name: 'AND program',
      mappings: [{ type: 'AND', subdomains: ['Depression', 'Stress', 'Ångest'] }],
    };
    const andNeeds = { Depression: 82, Stress: 81, Ångest: 78 };

    it('TEST 3: averages all three needs before anything is covered', () => {
      const result = calculateProgramScore(andProgram, andNeeds, new Set());
      expect(result.mappingType).toBe('AND');
      expect(result.score).toBeCloseTo(80.33, 2); // (82 + 81 + 78) / 3
    });

    it('TEST 4: stays AND (not SINGLE) once only Ångest remains uncovered', () => {
      const result = calculateProgramScore(andProgram, andNeeds, new Set(['Depression', 'Stress']));
      expect(result.mappingType).toBe('AND');
      expect(result.mappingType).not.toBe('SINGLE');
      expect(result.score).toBe(78);
      expect(result.newCoverage).toEqual(['Ångest']);
      expect(result.ignoredCoveredSubdomains.sort()).toEqual(['Depression', 'Stress']);
    });
  });

  // TEST 5: a SINGLE program's type is stored on the mapping, not derived,
  // so it can never drift to AND/OR across rounds - before or after its
  // one subdomain gets covered.
  it('TEST 5: a SINGLE mapping never changes type, before or after coverage', () => {
    const program: Program = {
      id: 'get-out-of-the-blues',
      name: 'Get out of the blues',
      mappings: [{ type: 'SINGLE', subdomains: ['Depression'] }],
    };
    const before = calculateProgramScore(program, { Depression: 82 }, new Set());
    expect(before.mappingType).toBe('SINGLE');

    const after = calculateProgramScore(program, { Depression: 82 }, new Set(['Depression']));
    expect(after.mappingType).toBe('SINGLE');
    expect(after.mappingType).not.toBe('AND');
    expect(after.mappingType).not.toBe('OR');
  });

  // TEST 6: an AND mapping's type is likewise stored, not derived from the
  // number of subdomains still uncovered - so it never collapses to SINGLE.
  it('TEST 6: an AND mapping never changes type to SINGLE when one subdomain remains uncovered', () => {
    const program: Program = {
      id: 'and-program',
      name: 'AND program',
      mappings: [{ type: 'AND', subdomains: ['Depression', 'Stress', 'Ångest'] }],
    };
    const result = calculateProgramScore(
      program,
      { Depression: 82, Stress: 81, Ångest: 78 },
      new Set(['Depression', 'Stress'])
    );
    expect(result.consideredSubdomains).toHaveLength(1);
    expect(result.mappingType).toBe('AND');
    expect(result.mappingType).not.toBe('SINGLE');
  });
});

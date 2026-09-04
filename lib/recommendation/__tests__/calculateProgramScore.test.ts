import { describe, expect, it } from 'vitest';
import { calculateProgramScore } from '../calculateProgramScore';
import type { Program } from '../../types';

const needs = { Stress: 90, Anxiety: 40, Depression: 70, Sömn: 10 };

describe('calculateProgramScore', () => {
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
  });
});

import { describe, expect, it } from 'vitest';
import { getCoveredSubdomains } from '../getCoveredSubdomains';

const needs = { A: 90, B: 40, C: 40, D: 10 };

describe('getCoveredSubdomains', () => {
  it('AND: covers every uncovered mapped subdomain', () => {
    const covered = getCoveredSubdomains({ type: 'AND', subdomains: ['A', 'B', 'D'] }, needs, new Set());
    expect(covered.sort()).toEqual(['A', 'B', 'D']);
  });

  it('OR: covers only the strongest-need subdomain', () => {
    const covered = getCoveredSubdomains({ type: 'OR', subdomains: ['A', 'D'] }, needs, new Set());
    expect(covered).toEqual(['A']);
  });

  it('OR: covers all tied-highest subdomains', () => {
    const covered = getCoveredSubdomains({ type: 'OR', subdomains: ['B', 'C', 'D'] }, needs, new Set());
    expect(covered.sort()).toEqual(['B', 'C']);
  });

  it('excludes already-covered subdomains from consideration', () => {
    const covered = getCoveredSubdomains({ type: 'OR', subdomains: ['A', 'D'] }, needs, new Set(['A']));
    // With A already covered, D (the only remaining one) becomes the driver.
    expect(covered).toEqual(['D']);
  });

  it('returns nothing once every mapped subdomain is already covered', () => {
    const covered = getCoveredSubdomains({ type: 'AND', subdomains: ['A', 'B'] }, needs, new Set(['A', 'B']));
    expect(covered).toEqual([]);
  });

  it('returns nothing for an undefined mapping', () => {
    expect(getCoveredSubdomains(undefined, needs, new Set())).toEqual([]);
  });
});

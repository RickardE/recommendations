import { describe, expect, it } from 'vitest';
import { getCoveredSubdomains } from '../getCoveredSubdomains';

const needs = { A: 90, B: 40, C: 40, D: 10 };

describe('getCoveredSubdomains', () => {
  it('SINGLE: covers the one mapped subdomain', () => {
    const covered = getCoveredSubdomains({ type: 'SINGLE', subdomains: ['Depression'] }, needs, new Set());
    expect(covered).toEqual(['Depression']);
  });

  it('AND: covers every uncovered mapped subdomain', () => {
    const covered = getCoveredSubdomains({ type: 'AND', subdomains: ['A', 'B', 'D'] }, needs, new Set());
    expect(covered.sort()).toEqual(['A', 'B', 'D']);
  });

  // COVERAGE RULE: OR covers every uncovered mapped subdomain, not just
  // the driver (the strongest-need one). The driver only explains the
  // score - it must never limit coverage.
  it('OR: covers every uncovered mapped subdomain, not just the strongest-need one', () => {
    const covered = getCoveredSubdomains({ type: 'OR', subdomains: ['A', 'D'] }, needs, new Set());
    expect(covered.sort()).toEqual(['A', 'D']);
  });

  it('OR: covers all mapped subdomains regardless of tied or distinct needs', () => {
    const covered = getCoveredSubdomains({ type: 'OR', subdomains: ['B', 'C', 'D'] }, needs, new Set());
    expect(covered.sort()).toEqual(['B', 'C', 'D']);
  });

  it('excludes already-covered subdomains from consideration', () => {
    const covered = getCoveredSubdomains({ type: 'OR', subdomains: ['A', 'D'] }, needs, new Set(['A']));
    // A is already covered, so only D is newly covered here.
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

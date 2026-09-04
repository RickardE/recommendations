import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { selectRecommendations, DEFAULT_RECOMMENDATION_CONFIG } from '../selectRecommendations';
import { parseMatrix } from '../../matrixParser';
import type { Program } from '../../types';

function program(id: string, type: 'SINGLE' | 'AND' | 'OR', subdomains: string[]): Program {
  return { id, name: id, mappings: [{ type, subdomains }] };
}

describe('selectRecommendations', () => {
  it('excludes already-covered subdomains from later rounds', () => {
    const programs: Program[] = [program('a', 'AND', ['X', 'Y']), program('b', 'OR', ['Y', 'Z'])];
    // needs: X=100, Y=80, Z=10
    const scores = { X: 0, Y: 20, Z: 90 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 2,
    });

    expect(result.recommendations[0]?.program.id).toBe('a');
    expect(result.rounds[0]?.coveredAfter.sort()).toEqual(['X', 'Y']);

    const roundTwoB = result.rounds[1]?.allScores.find((r) => r.program.id === 'b');
    // Y is already covered, so only Z should feed into round 2's score.
    expect(roundTwoB?.consideredSubdomains.map((e) => e.subdomain)).toEqual(['Z']);
    expect(roundTwoB?.score).toBe(10);
  });

  it('selects 3 diverse programs covering different subdomains', () => {
    const programs: Program[] = [
      program('p1', 'AND', ['A']),
      program('p2', 'AND', ['B']),
      program('p3', 'AND', ['C']),
      program('p4', 'AND', ['D']),
    ];
    const scores = { A: 0, B: 20, C: 40, D: 60 }; // needs 100, 80, 60, 40

    const result = selectRecommendations(programs, scores);

    expect(result.recommendations.map((r) => r.program.id)).toEqual(['p1', 'p2', 'p3']);
    expect(new Set(result.recommendations.flatMap((r) => r.newCoverage)).size).toBe(3);
  });

  it('falls back to redundancy-penalized scoring once nothing new is left to cover', () => {
    const programs: Program[] = [
      program('p1', 'AND', ['A', 'B']),
      program('p2', 'AND', ['C']),
      program('p3', 'AND', ['A', 'B']), // fully redundant with p1
    ];
    const scores = { A: 0, B: 0, C: 10 }; // needs: A=100, B=100, C=90

    const result = selectRecommendations(programs, scores);

    expect(result.recommendations.map((r) => r.program.id)).toEqual(['p1', 'p2', 'p3']);

    const roundThree = result.rounds[2];
    expect(roundThree?.selectionType).toBe('fallback');
    expect(roundThree?.selected?.program.id).toBe('p3');
    expect(roundThree?.selected?.redundancy?.ratio).toBe(1);
    expect(roundThree?.selected?.redundancy?.factor).toBe(0.3);
    // full AND score for p3 would be 100, penalized by 0.3
    expect(roundThree?.selected?.score).toBeCloseTo(30, 5);
    expect(roundThree?.selected?.newCoverage).toEqual([]);
  });

  it('breaks ties deterministically by input order', () => {
    const programs: Program[] = [program('p1', 'AND', ['A']), program('p2', 'AND', ['B'])];
    const scores = { A: 50, B: 50 }; // equal needs -> equal scores

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 1,
    });

    expect(result.recommendations[0]?.program.id).toBe('p1');
  });

  it('excludes unmapped programs from scoring but reports them separately', () => {
    const programs: Program[] = [program('p1', 'AND', ['A']), { id: 'p2', name: 'Unmapped', mappings: [] }];
    const scores = { A: 50 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 2,
    });

    expect(result.unmappedPrograms.map((p) => p.id)).toEqual(['p2']);
    expect(result.rounds.every((r) => r.allScores.every((s) => s.program.id !== 'p2'))).toBe(true);
  });

  it('keeps a SINGLE-mapped program labeled SINGLE end to end, never AND', () => {
    const programs: Program[] = [program('get-out-of-the-blues', 'SINGLE', ['Depression'])];
    const scores = { Depression: 18 }; // need 82

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 1,
    });

    expect(result.recommendations[0]?.mappingType).toBe('SINGLE');
    expect(result.recommendations[0]?.score).toBe(82);
    expect(result.recommendations[0]?.newCoverage).toEqual(['Depression']);
  });

  it('keeps an AND-mapped program labeled AND even once only one subdomain remains uncovered', () => {
    const programs: Program[] = [
      program('covers-depression-and-stress', 'AND', ['Depression', 'Stress']),
      program('and-program', 'AND', ['Depression', 'Stress', 'Ångest']),
    ];
    // needs: Depression=82, Stress=81, Ångest=78
    const scores = { Depression: 18, Stress: 19, Ångest: 22 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 2,
    });

    const roundTwo = result.rounds[1]?.allScores.find((r) => r.program.id === 'and-program');
    expect(roundTwo?.consideredSubdomains.map((e) => e.subdomain)).toEqual(['Ångest']);
    expect(roundTwo?.mappingType).toBe('AND');
    expect(roundTwo?.mappingType).not.toBe('SINGLE');
    expect(roundTwo?.score).toBe(78);
  });

  it('stops once every mapped program has been selected', () => {
    const programs: Program[] = [program('p1', 'AND', ['A'])];
    const scores = { A: 50 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 3,
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.rounds).toHaveLength(1);
  });
});

describe('selectRecommendations against the real matrix', () => {
  const tsvContent = fs.readFileSync(path.join(__dirname, '../../../data/table.tsv'), 'utf8');
  const programs = parseMatrix(tsvContent);
  const subdomains = Array.from(new Set(programs.flatMap((p) => p.mappings[0]?.subdomains ?? [])));

  it('recommends 3 distinct, mapped programs for a uniform mid-range score', () => {
    const scores = Object.fromEntries(subdomains.map((s) => [s, 50]));
    const result = selectRecommendations(programs, scores);

    expect(result.recommendations).toHaveLength(3);
    const ids = result.recommendations.map((r) => r.program.id);
    expect(new Set(ids).size).toBe(3);
    expect(result.unmappedPrograms.map((p) => p.name)).toContain('Stop procrastinating');
  });

  it('prioritizes Manage stress when Stress is the only high need', () => {
    const scores = Object.fromEntries(subdomains.map((s) => [s, 100]));
    scores['Stress'] = 0; // need 100, everything else need 0
    const result = selectRecommendations(programs, scores);

    expect(result.recommendations[0]?.program.name).toBe('Manage stress');
  });

  it('labels every single-subdomain program from the real matrix as SINGLE, never AND', () => {
    const scores = Object.fromEntries(subdomains.map((s) => [s, 50]));
    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: programs.length,
    });

    const singleSubdomainPrograms = programs.filter((p) => p.mappings[0]?.subdomains.length === 1);
    expect(singleSubdomainPrograms.length).toBeGreaterThan(0);

    for (const round of result.rounds) {
      for (const scored of round.allScores) {
        if (scored.program.mappings[0]?.subdomains.length === 1) {
          expect(scored.mappingType).toBe('SINGLE');
        }
      }
    }
  });

  it('never lets a later round reconsider a subdomain covered by an earlier one', () => {
    const scores = Object.fromEntries(subdomains.map((s) => [s, 30]));
    const result = selectRecommendations(programs, scores);

    let coveredSoFar = new Set<string>();
    for (const round of result.rounds) {
      for (const scored of round.allScores) {
        for (const entry of scored.consideredSubdomains) {
          expect(coveredSoFar.has(entry.subdomain)).toBe(false);
        }
      }
      for (const s of round.coveredAfter) coveredSoFar.add(s);
    }
  });
});

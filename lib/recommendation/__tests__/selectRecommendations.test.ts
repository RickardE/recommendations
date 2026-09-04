import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { selectRecommendations, DEFAULT_RECOMMENDATION_CONFIG } from '../selectRecommendations';
import { calculateProgramScore } from '../calculateProgramScore';
import { parseMatrix } from '../../matrixParser';
import type { Program } from '../../types';

function program(id: string, type: 'SINGLE' | 'AND' | 'OR', subdomains: string[]): Program {
  return { id, name: id, mappings: [{ type, subdomains }] };
}

describe('selectRecommendations (subdomain-first)', () => {
  it('excludes already-covered subdomains from later rounds', () => {
    const programs: Program[] = [program('a', 'AND', ['X', 'Y']), program('b', 'OR', ['Y', 'Z'])];
    // needs: X=100, Y=80, Z=10
    const scores = { X: 0, Y: 20, Z: 90 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 2,
    });

    expect(result.rounds[0]?.targetSubdomain).toBe('X');
    expect(result.recommendations[0]?.program.id).toBe('a');
    expect(result.rounds[0]?.coveredAfter.sort()).toEqual(['X', 'Y']);

    expect(result.rounds[1]?.targetSubdomain).toBe('Z');
    const roundTwoB = result.rounds[1]?.allScores.find((r) => r.program.id === 'b');
    // Y is already covered, so only Z should feed into round 2's score.
    expect(roundTwoB?.consideredSubdomains.map((e) => e.subdomain)).toEqual(['Z']);
    expect(roundTwoB?.ignoredCoveredSubdomains).toEqual(['Y']);
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

  // TEST 4: a program with ALL of its mapped subdomains covered (by other
  // selections) must never be a candidate again - no redundancy fallback.
  it('excludes a fully-redundant program once every one of its mapped subdomains is covered', () => {
    const programs: Program[] = [
      program('p1', 'AND', ['A', 'B']),
      program('p2', 'AND', ['C']),
      program('p3', 'AND', ['A', 'B']), // exact duplicate mapping of p1
    ];
    const scores = { A: 0, B: 0, C: 10 }; // needs: A=100, B=100, C=90

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 3,
    });

    // p1 wins the A/B tie (input order), p2 is the only candidate for C.
    expect(result.recommendations.map((r) => r.program.id)).toEqual(['p1', 'p2']);
    // p3 is fully redundant with p1 - it must never be recommended.
    expect(result.recommendations.some((r) => r.program.id === 'p3')).toBe(false);

    // Once A, B and C are all covered, no uncovered subdomain has any
    // remaining candidate, so the run stops - it does not "pick something
    // anyway".
    const roundThree = result.rounds[2];
    expect(roundThree?.selectionType).toBe('none');
    expect(roundThree?.targetSubdomain).toBeNull();
    expect(roundThree?.selected).toBeNull();
  });

  it('breaks target-subdomain ties deterministically by first-appearance order', () => {
    const programs: Program[] = [program('p1', 'AND', ['A']), program('p2', 'AND', ['B'])];
    const scores = { A: 50, B: 50 }; // equal needs -> A wins the tie, being mapped first

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 1,
    });

    expect(result.rounds[0]?.targetSubdomain).toBe('A');
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

  // TEST 1: a SINGLE program whose only subdomain is already covered (by a
  // different program) must be excluded from every subsequent round.
  it('TEST 1: excludes a SINGLE program once its one subdomain is covered by another program', () => {
    const programs: Program[] = [
      // Side-effect covers Depression while chasing the higher-need Y.
      program('and-two', 'AND', ['Depression', 'Y']),
      program('single-depression', 'SINGLE', ['Depression']),
    ];
    const scores = { Depression: 50, Y: 0 }; // needs: Depression=50, Y=100

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 3,
    });

    expect(result.recommendations.map((r) => r.program.id)).toEqual(['and-two']);
    // single-depression must never even appear as a candidate once
    // Depression is covered.
    for (const round of result.rounds) {
      expect(round.allScores.some((s) => s.program.id === 'single-depression')).toBe(false);
    }
  });

  // TEST 2: an AND program with one covered and one uncovered subdomain
  // can still be selected, scored using only the uncovered subdomain.
  it('TEST 2: an AND program can still be selected for its remaining uncovered subdomain', () => {
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

    expect(result.recommendations.map((r) => r.program.id)).toEqual([
      'covers-depression-and-stress',
      'and-program',
    ]);

    const second = result.recommendations[1]!;
    expect(result.rounds[1]?.targetSubdomain).toBe('Ångest');
    expect(second.mappingType).toBe('AND');
    expect(second.mappingType).not.toBe('SINGLE');
    expect(second.consideredSubdomains.map((e) => e.subdomain)).toEqual(['Ångest']);
    expect(second.ignoredCoveredSubdomains.sort()).toEqual(['Depression', 'Stress']);
    expect(second.score).toBe(78);
    expect(second.newCoverage).toEqual(['Ångest']);
  });

  // TEST 3: an OR program with one covered and one uncovered subdomain can
  // still be selected for the uncovered subdomain, ignoring the covered one.
  it('TEST 3: an OR program can still be selected for its remaining uncovered subdomain', () => {
    const programs: Program[] = [
      // Side-effect covers Stress while chasing the higher-need Other.
      program('and-drains-stress', 'AND', ['Other', 'Stress']),
      program('become-more-mindful', 'OR', ['Smärta', 'Stress']),
    ];
    // needs: Other=100, Stress=60, Smärta=40
    const scores = { Other: 0, Stress: 40, Smärta: 60 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 2,
    });

    expect(result.recommendations.map((r) => r.program.id)).toEqual(['and-drains-stress', 'become-more-mindful']);

    const second = result.recommendations[1]!;
    expect(result.rounds[1]?.targetSubdomain).toBe('Smärta');
    // TEST 5: mapping type never changes because of coverage.
    expect(second.mappingType).toBe('OR');
    expect(second.mappingType).not.toBe('SINGLE');
    expect(second.consideredSubdomains.map((e) => e.subdomain)).toEqual(['Smärta']);
    expect(second.ignoredCoveredSubdomains).toEqual(['Stress']);
    expect(second.score).toBe(40);
    expect(second.newCoverage).toEqual(['Smärta']);
  });

  // TEST 6: selection is subdomain-first - the program mapped to the
  // highest-need *uncovered subdomain* wins its round, even when a program
  // mapped to lower-need subdomains would have scored higher in isolation.
  it('TEST 6: picks the candidate for the highest-need uncovered subdomain, not the globally highest score', () => {
    const programs: Program[] = [
      program('target-single', 'SINGLE', ['TargetNeed']),
      program('or-other', 'OR', ['OrA', 'OrB']),
    ];
    // needs: TargetNeed=90, OrA=85, OrB=60
    const scores = { TargetNeed: 10, OrA: 15, OrB: 40 };
    const needs = { TargetNeed: 90, OrA: 85, OrB: 60 };

    // or-other's own (uncovered-agnostic) score is higher than
    // target-single's, purely because of the OR bonus term...
    const orOtherFullScore = calculateProgramScore(programs[1]!, needs, new Set()).score;
    expect(orOtherFullScore).toBeCloseTo(91, 5); // 85 + (60 * 0.10)
    expect(orOtherFullScore).toBeGreaterThan(90);

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 1,
    });

    // ...but TargetNeed is the highest-need *uncovered subdomain*, so
    // target-single (the only program mapped to it) wins round 1 anyway.
    expect(result.rounds[0]?.targetSubdomain).toBe('TargetNeed');
    expect(result.recommendations[0]?.program.id).toBe('target-single');
    expect(result.recommendations[0]?.score).toBe(90);
  });

  // TEST 7: the same program is never recommended twice.
  it('TEST 7: never recommends the same program twice', () => {
    const programs: Program[] = [program('p1', 'AND', ['A']), program('p2', 'AND', ['B']), program('p3', 'AND', ['C'])];
    const scores = { A: 0, B: 10, C: 20 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 10, // more slots than programs exist
    });

    const ids = result.recommendations.map((r) => r.program.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(programs.length);
  });

  // TEST 8: several programs mapped to the same target subdomain are
  // compared using their own SINGLE / AND / OR formulas.
  it('TEST 8: compares same-target candidates using their own SINGLE/AND/OR formula', () => {
    const programs: Program[] = [
      program('p-single', 'SINGLE', ['Ångest']),
      program('p-and', 'AND', ['Ångest', 'Other1']),
      program('p-or', 'OR', ['Ångest', 'Other2']),
    ];
    // needs: Ångest=85, Other1=80, Other2=20
    const scores = { Ångest: 15, Other1: 20, Other2: 80 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 1,
    });

    const round = result.rounds[0]!;
    expect(round.targetSubdomain).toBe('Ångest');
    expect(round.allScores.map((r) => r.program.id)).toEqual(
      expect.arrayContaining(['p-single', 'p-and', 'p-or'])
    );

    const byId = Object.fromEntries(round.allScores.map((r) => [r.program.id, r]));
    expect(byId['p-single']?.score).toBe(85); // SINGLE: need itself
    expect(byId['p-and']?.score).toBeCloseTo(82.5, 5); // AND: avg(85, 80)
    expect(byId['p-or']?.score).toBeCloseTo(87, 5); // OR: 85 + (20 * 0.1)

    // p-or's formula wins the comparison, so it's selected.
    expect(round.selected?.program.id).toBe('p-or');
    expect(round.selected?.mappingType).toBe('OR');
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

    expect(result.rounds[0]?.targetSubdomain).toBe('Stress');
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

  it('never recommends the same real-matrix program twice', () => {
    const scores = Object.fromEntries(subdomains.map((s) => [s, 20]));
    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: programs.length,
    });

    const ids = result.recommendations.map((r) => r.program.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

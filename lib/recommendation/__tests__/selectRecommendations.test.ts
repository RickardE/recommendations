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
  // STRICT COVERAGE RULE: a program is disqualified the moment ANY of its
  // mapped subdomains is covered - even by a different program's
  // selection - regardless of whether it has other, still-uncovered
  // subdomains of its own. This guarantees zero subdomain overlap across
  // the recommendation set, at the cost of "b" here never getting a
  // chance to compete for Z once Y is covered by "a".
  it('disqualifies a program entirely once any one of its mapped subdomains is covered by another program', () => {
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

    // b is mapped to Y, which is now covered - it's disqualified outright,
    // even though Z is still uncovered and b is mapped to it too. So Z
    // has no eligible candidate left, and round 2 finds no target at all.
    expect(result.rounds[1]?.selectionType).toBe('none');
    expect(result.rounds[1]?.targetSubdomain).toBeNull();
    expect(result.rounds[1]?.allScores.some((s) => s.program.id === 'b')).toBe(false);
    expect(result.recommendations).toHaveLength(1);
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

  // TEST 2 (STRICT RULE): an AND program is now disqualified entirely as
  // soon as ANY of its mapped subdomains is covered, even by a different
  // program's selection, even though it still has an uncovered subdomain
  // of its own (Ångest). It is never scored or selected for Ångest.
  it('TEST 2: an AND program is disqualified once any one of its mapped subdomains is covered', () => {
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

    // Only "covers-depression-and-stress" is ever recommended.
    expect(result.recommendations.map((r) => r.program.id)).toEqual(['covers-depression-and-stress']);

    // Ångest is left orphaned: and-program was the only program mapped to
    // it, and it's disqualified by Depression/Stress being covered - so
    // round 2 finds no eligible candidate for anything at all.
    expect(result.rounds[1]?.selectionType).toBe('none');
    expect(result.rounds[1]?.targetSubdomain).toBeNull();
    expect(result.rounds[1]?.allScores.some((s) => s.program.id === 'and-program')).toBe(false);
  });

  // TEST 3 (STRICT RULE): an OR program is likewise disqualified once any
  // one of its mapped subdomains is covered, even though a genuinely
  // uncovered subdomain of its own (Smärta) remains reachable in principle.
  it('TEST 3: an OR program is disqualified once any one of its mapped subdomains is covered', () => {
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

    // Only "and-drains-stress" is ever recommended.
    expect(result.recommendations.map((r) => r.program.id)).toEqual(['and-drains-stress']);

    // Smärta is left orphaned: become-more-mindful was the only program
    // mapped to it, and it's disqualified by Stress being covered.
    expect(result.rounds[1]?.selectionType).toBe('none');
    expect(result.rounds[1]?.targetSubdomain).toBeNull();
    expect(result.rounds[1]?.allScores.some((s) => s.program.id === 'become-more-mindful')).toBe(false);
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
    // needs: Ångest=85, Other1=80, Other2=70 - Other2 is high enough to
    // clear the OR bonus threshold, so p-or's bonus genuinely applies here.
    const scores = { Ångest: 15, Other1: 20, Other2: 30 };

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
    expect(byId['p-or']?.score).toBeCloseTo(92, 5); // OR: 85 + (70 * 0.1)

    // p-or's formula wins the comparison, so it's selected.
    expect(round.selected?.program.id).toBe('p-or');
    expect(round.selected?.mappingType).toBe('OR');
  });

  it('stops once every mapped program has been selected, logging a final "none" round', () => {
    const programs: Program[] = [program('p1', 'AND', ['A'])];
    const scores = { A: 50 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 3,
    });

    expect(result.recommendations).toHaveLength(1);
    // Round 1 selects p1; round 2 has no eligible program left at all, so
    // it's logged as an explicit 'none' round rather than silently
    // stopping - round 3 never runs.
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[1]?.selectionType).toBe('none');
  });
});

// Coverage rule: SELECTED PROGRAM -> ALL MAPPED SUBDOMAINS BECOME COVERED.
// The OR driver only explains relevance; it must never limit coverage.
describe('selectRecommendations: OR coverage rule', () => {
  // Test 1 (integration-level): selecting an OR program covers every one
  // of its mapped subdomains, not just the driver.
  it('Test 1: selecting "Create healthy routines" covers both Nutrition and Physical activity', () => {
    const programs: Program[] = [program('create-healthy-routines', 'OR', ['Nutrition', 'Physical activity'])];
    const scores = { Nutrition: 20, 'Physical activity': 4 }; // needs: Nutrition=80, Physical activity=96

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 1,
    });

    const selected = result.recommendations[0]!;
    expect(selected.driverSubdomains).toEqual(['Physical activity']); // explains the score
    expect(selected.newCoverage.sort()).toEqual(['Nutrition', 'Physical activity']); // both covered
    expect(result.rounds[0]?.coveredAfter.sort()).toEqual(['Nutrition', 'Physical activity']);
  });

  // Test 2: a program overlapping only in already-covered OR subdomains
  // must not be selected as a way of re-targeting them.
  // STRICT COVERAGE RULE: unlike the old "partial overlap is fine" rule,
  // "b" is now disqualified entirely once 2 of its 3 mapped subdomains are
  // covered by "a" - even though Tobacco is still genuinely uncovered and
  // "b" is the only program mapped to it. Tobacco is left permanently
  // orphaned for the rest of this run. (This mirrors a real case in
  // data/table.tsv: "Create healthy routines" [Kost och matvanor OR
  // Fysisk aktivitet] fully overlaps 2 of "Achive your goals and dreams"'s
  // 3 subdomains [... OR Tobak OR ...], so selecting the former can now
  // orphan Tobak.)
  it('Test 2 (STRICT RULE): a program is disqualified once it overlaps an earlier selection at all, orphaning its other subdomain', () => {
    const programs: Program[] = [
      program('a', 'OR', ['Nutrition', 'Physical activity']),
      program('b', 'OR', ['Nutrition', 'Tobacco', 'Physical activity']),
    ];
    // needs: Nutrition=80, Physical activity=96, Tobacco=72
    const scores = { Nutrition: 20, 'Physical activity': 4, Tobacco: 28 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 2,
    });

    // Round 1: Physical activity (96) is the highest need -> program a.
    expect(result.rounds[0]?.targetSubdomain).toBe('Physical activity');
    expect(result.recommendations[0]?.program.id).toBe('a');
    expect(result.rounds[0]?.coveredAfter.sort()).toEqual(['Nutrition', 'Physical activity']);

    // Round 2: Tobacco (72) is the highest remaining need, but "b" - its
    // only mapped program - is disqualified by its overlap with "a" on
    // Nutrition/Physical activity. No eligible candidate exists for
    // Tobacco (or anything else), so round 2 finds no target at all.
    expect(result.rounds[1]?.selectionType).toBe('none');
    expect(result.rounds[1]?.targetSubdomain).toBeNull();
    expect(result.rounds[1]?.allScores.some((s) => s.program.id === 'b')).toBe(false);
    expect(result.recommendations).toEqual([result.recommendations[0]]); // only "a" was ever recommended
  });

  // Test 5: a program whose mapped subdomains are ALL already covered
  // must not be selected.
  it('Test 5: excludes an OR program once all of its mapped subdomains are already covered', () => {
    const programs: Program[] = [
      // Covers Nutrition and Physical activity as a side effect of a
      // higher-need, unrelated target.
      program('and-covers-both', 'AND', ['Other', 'Nutrition', 'Physical activity']),
      program('nutrition-or-activity', 'OR', ['Nutrition', 'Physical activity']),
    ];
    const scores = { Other: 0, Nutrition: 20, 'Physical activity': 4 }; // needs: Other=100, Nutrition=80, Physical activity=96

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 3,
    });

    expect(result.recommendations.map((r) => r.program.id)).toEqual(['and-covers-both']);
    // nutrition-or-activity must never be a candidate once both of its
    // mapped subdomains are covered.
    for (const round of result.rounds) {
      expect(round.allScores.some((s) => s.program.id === 'nutrition-or-activity')).toBe(false);
    }
  });
});

// Fix: a mediocre OR companion need must not be able to tip an OR program
// above a program that matches the dominant need exactly.
describe('selectRecommendations: OR bonus threshold', () => {
  it('a SINGLE program now wins over an OR program whose only companion need is mediocre', () => {
    const programs: Program[] = [
      // Manage stress is listed first, matching its position in the real
      // table.tsv - this is also what the tie-break (input order) falls
      // back on once the mediocre companion no longer inflates the OR score.
      program('manage-stress', 'SINGLE', ['Stress']),
      program('become-more-mindful', 'OR', ['Smärta', 'Stress']),
    ];
    // The exact reported scenario: Stress=99, Smärta=50 (an ordinary need).
    const scores = { Stress: 1, Smärta: 50 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 1,
    });

    expect(result.rounds[0]?.targetSubdomain).toBe('Stress');
    expect(result.recommendations[0]?.program.id).toBe('manage-stress');
    expect(result.recommendations[0]?.score).toBe(99);
  });

  it('an OR program still wins when its companion need is genuinely elevated, not mediocre', () => {
    const programs: Program[] = [
      program('manage-stress', 'SINGLE', ['Stress']),
      program('become-more-mindful', 'OR', ['Smärta', 'Stress']),
    ];
    // Stress=99, Smärta=90 - a real second problem, not an ordinary one.
    const scores = { Stress: 1, Smärta: 10 };

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 1,
    });

    expect(result.recommendations[0]?.program.id).toBe('become-more-mindful');
    expect(result.recommendations[0]?.score).toBe(100); // 99 + (90 * 0.1) = 108, capped
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

  it('fixes the reported OR-bonus bug: Stress=99 with every other subdomain at an ordinary 50', () => {
    const scores = Object.fromEntries(subdomains.map((s) => [s, 50]));
    scores['Stress'] = 1; // need 99
    const result = selectRecommendations(programs, scores);

    // Before the fix, "Become more mindful" (OR: Smärta, Stress) scored
    // 99 + (50 * 0.1) = 104, capped to 100, beating "Manage stress" (99)
    // purely because Smärta happened to be at an ordinary need. Smärta=50
    // no longer clears the bonus threshold, so Manage stress now wins.
    expect(result.rounds[0]?.targetSubdomain).toBe('Stress');
    expect(result.recommendations[0]?.program.name).toBe('Manage stress');
    expect(result.recommendations[0]?.score).toBe(99);
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

  it('real-matrix example: a subset OR program winning its round can orphan a subdomain only reachable via a superset OR program', () => {
    // "Create healthy routines" -> Kost och matvanor OR Fysisk aktivitet
    // "Achive your goals and dreams" -> Kost och matvanor OR Tobak OR Fysisk aktivitet
    // The latter is a strict superset of the former. Under the strict
    // coverage rule, if "Create healthy routines" wins its round, "Achive
    // your goals and dreams" - the only program mapped to Tobak - is
    // disqualified outright, orphaning Tobak even though it's still a
    // meaningfully high, genuinely uncovered need.
    const scores = Object.fromEntries(subdomains.map((s) => [s, 100])); // need 0 everywhere else
    scores['Kost och matvanor'] = 10; // need 90
    scores['Fysisk aktivitet'] = 30; // need 70
    scores['Tobak'] = 39; // need 61 - still a real, meaningful need

    const result = selectRecommendations(programs, scores, {
      ...DEFAULT_RECOMMENDATION_CONFIG,
      numberOfRecommendations: 3,
    });

    expect(result.recommendations[0]?.program.name).toBe('Create healthy routines');
    // "Achive your goals and dreams" competes (and loses) in round 1 like
    // any other candidate, but from round 2 onward - once Kost och
    // matvanor/Fysisk aktivitet are covered - it's disqualified outright
    // and never appears as a candidate again, even though Tobak remains
    // meaningfully uncovered.
    const appearedAfterRound1 = result.rounds
      .slice(1)
      .some((r) => r.allScores.some((s) => s.program.name === 'Achive your goals and dreams'));
    expect(appearedAfterRound1).toBe(false);
    expect(result.recommendations.some((r) => r.program.name === 'Achive your goals and dreams')).toBe(false);
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

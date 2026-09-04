import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseMatrix, getAllSubdomains, tokenizeSubdomainText } from '../matrixParser';

describe('tokenizeSubdomainText', () => {
  it('splits an AND list', () => {
    const { subdomains, hasOr } = tokenizeSubdomainText('Tidsupplevelse and Stress');
    expect(subdomains).toEqual(['Tidsupplevelse', 'Stress']);
    expect(hasOr).toBe(false);
  });

  it('splits an OR list', () => {
    const { subdomains, hasOr } = tokenizeSubdomainText('Kost och matvanor or Tobak or Fysisk aktivitet');
    expect(subdomains).toEqual(['Kost och matvanor', 'Tobak', 'Fysisk aktivitet']);
    expect(hasOr).toBe(true);
  });

  it('does not treat the Swedish word "och" inside a subdomain name as a delimiter', () => {
    const { subdomains } = tokenizeSubdomainText('Kost och matvanor');
    expect(subdomains).toEqual(['Kost och matvanor']);
  });

  it('recovers a malformed cell missing a conjunction between the last two subdomains', () => {
    // Mirrors the real "Get to know your emotions" row in table.tsv.
    const { subdomains, hasOr } = tokenizeSubdomainText('Depression and Ångest Stress');
    expect(subdomains).toEqual(['Depression', 'Ångest', 'Stress']);
    expect(hasOr).toBe(false);
  });

  it('returns nothing for an empty cell', () => {
    expect(tokenizeSubdomainText('')).toEqual({ subdomains: [], hasOr: false });
  });
});

describe('parseMatrix', () => {
  it('joins spreadsheet line-break continuations into one mapping', () => {
    // Continuation lines (the tail of a multi-line cell) are exported
    // without a leading tab at all - see the comment on groupTsvRows.
    const tsv = [
      'Ahum services\tSubdomains primary match',
      'Achive your goals and dreams\tKost och matvanor or',
      'Tobak or',
      'Fysisk aktivitet',
    ].join('\n');
    const programs = parseMatrix(tsv);
    expect(programs).toHaveLength(1);
    expect(programs[0]?.mappings).toEqual([
      { type: 'OR', subdomains: ['Kost och matvanor', 'Tobak', 'Fysisk aktivitet'] },
    ]);
  });

  it('parses a program with exactly one mapped subdomain as SINGLE, not AND', () => {
    const tsv = ['Ahum services\tSubdomains primary match', 'Get out of the blues\tDepression'].join('\n');
    const programs = parseMatrix(tsv);
    expect(programs[0]?.mappings).toEqual([{ type: 'SINGLE', subdomains: ['Depression'] }]);
  });

  it('treats a program with an empty subdomains cell as unmapped', () => {
    const tsv = ['Ahum services\tSubdomains primary match', 'Stop procrastinating\t'].join('\n');
    const programs = parseMatrix(tsv);
    expect(programs[0]?.mappings).toEqual([]);
  });

  it('ignores fully blank spacer rows', () => {
    const tsv = [
      'Ahum services\tSubdomains primary match',
      'Manage stress\tStress',
      '',
      'Sleep better\tSömn',
    ].join('\n');
    const programs = parseMatrix(tsv);
    expect(programs.map((p) => p.name)).toEqual(['Manage stress', 'Sleep better']);
  });

  it('assigns unique, stable ids', () => {
    const tsv = ['Ahum services\tSubdomains primary match', 'Manage stress\tStress', 'Sleep better\tSömn'].join('\n');
    const programs = parseMatrix(tsv);
    expect(programs.map((p) => p.id)).toEqual(['manage-stress', 'sleep-better']);
  });

  describe('against the real table.tsv', () => {
    const tsvContent = fs.readFileSync(path.join(__dirname, '../../data/table.tsv'), 'utf8');
    const programs = parseMatrix(tsvContent);

    it('parses all 17 programs', () => {
      expect(programs).toHaveLength(17);
    });

    it('has exactly one unmapped program (Stop procrastinating)', () => {
      const unmapped = programs.filter((p) => p.mappings.length === 0);
      expect(unmapped.map((p) => p.name)).toEqual(['Stop procrastinating']);
    });

    it('parses "Improve work/life balance" as an AND of two subdomains', () => {
      const program = programs.find((p) => p.name === 'Improve work/life balance');
      expect(program?.mappings).toEqual([{ type: 'AND', subdomains: ['Tidsupplevelse', 'Stress'] }]);
    });

    it('parses "Achive your goals and dreams" as a 3-way OR', () => {
      const program = programs.find((p) => p.name === 'Achive your goals and dreams');
      expect(program?.mappings).toEqual([
        { type: 'OR', subdomains: ['Kost och matvanor', 'Tobak', 'Fysisk aktivitet'] },
      ]);
    });

    it('parses the malformed "Get to know your emotions" row as a 3-way AND', () => {
      const program = programs.find((p) => p.name === 'Get to know your emotions');
      expect(program?.mappings).toEqual([{ type: 'AND', subdomains: ['Depression', 'Ångest', 'Stress'] }]);
    });

    it('parses "Increase your resilience" across 4 continuation lines', () => {
      const program = programs.find((p) => p.name === 'Increase your resilience');
      expect(program?.mappings).toEqual([
        { type: 'AND', subdomains: ['Tidsupplevelse', 'Stress', 'Sömn', 'Mentalt välbefinnande'] },
      ]);
    });

    it('parses every genuinely single-subdomain program as SINGLE, not AND', () => {
      // These rows have exactly one mapped subdomain in table.tsv.
      const expected: Record<string, string> = {
        'Manage stress': 'Stress',
        'Overcome your worry': 'Ångest',
        'Get out of the blues': 'Depression',
        'Get healthier drinking habits': 'Alkohol',
        'Sleep better': 'Sömn',
      };
      for (const [name, subdomain] of Object.entries(expected)) {
        const program = programs.find((p) => p.name === name);
        expect(program?.mappings, name).toEqual([{ type: 'SINGLE', subdomains: [subdomain] }]);
      }
    });

    it('derives all 12 subdomains in first-appearance order', () => {
      const subdomains = getAllSubdomains(programs);
      expect(subdomains).toEqual([
        'Tidsupplevelse',
        'Stress',
        'Kost och matvanor',
        'Tobak',
        'Fysisk aktivitet',
        'Depression',
        'Individuella inre upplevelser',
        'Mentalt välbefinnande',
        'Ångest',
        'Smärta',
        'Sömn',
        'Alkohol',
      ]);
    });
  });
});

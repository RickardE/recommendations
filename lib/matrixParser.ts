import type { Program, ProgramMapping, MappingType } from './types';

/**
 * ASSUMPTION (isolated here on purpose):
 *
 * table.tsv has two columns: "Ahum services" (program name) and
 * "Subdomains primary match" (a free-text description of which subdomains
 * the program maps to, joined with the English words "and" / "or").
 *
 * The second column was exported from a spreadsheet cell that contained
 * internal line breaks. In TSV that turns into extra physical *rows* whose
 * first column is empty and whose second column is a continuation of the
 * previous row's text (see rows 5-6, 11, 14, 17-19, ... in table.tsv).
 * A fully blank row is just cosmetic spacing in the original sheet and
 * carries no information.
 *
 * One row ("Get to know your emotions") is missing a conjunction between
 * its last two subdomains ("Depression and Ångest Stress" instead of
 * "... and Ångest and Stress"). Rather than special-casing that row, we
 * tokenize against a known subdomain vocabulary: this both fixes that row
 * correctly and is robust to similar typos elsewhere in the sheet.
 *
 * The vocabulary below is the closed set of subdomain names that actually
 * appear in table.tsv. If the source sheet ever introduces a new subdomain
 * name, add it here.
 */
const KNOWN_SUBDOMAINS = [
  'Individuella inre upplevelser',
  'Mentalt välbefinnande',
  'Kost och matvanor',
  'Fysisk aktivitet',
  'Tidsupplevelse',
  'Ångest',
  'Depression',
  'Stress',
  'Smärta',
  'Sömn',
  'Alkohol',
  'Tobak',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest names first, so "Kost och matvanor" wins over any shorter
// accidental prefix match at the same position.
const VOCAB_BY_LENGTH_DESC = [...KNOWN_SUBDOMAINS].sort((a, b) => b.length - a.length);
const TOKEN_PATTERN = new RegExp(
  [...VOCAB_BY_LENGTH_DESC.map(escapeRegExp), '\\band\\b', '\\bor\\b'].join('|'),
  'gi'
);

type TokenizeResult = {
  subdomains: string[];
  hasOr: boolean;
};

/** Pure text -> {subdomains, hasOr} tokenizer. Exported for testing. */
export function tokenizeSubdomainText(text: string): TokenizeResult {
  const subdomains: string[] = [];
  let hasOr = false;
  const matches = text.matchAll(TOKEN_PATTERN);
  for (const match of matches) {
    const token = match[0];
    if (/^and$/i.test(token)) continue;
    if (/^or$/i.test(token)) {
      hasOr = true;
      continue;
    }
    const canonical = VOCAB_BY_LENGTH_DESC.find((v) => v.toLowerCase() === token.toLowerCase());
    if (canonical) subdomains.push(canonical);
  }
  return { subdomains, hasOr };
}

function mappingTypeFor(hasOr: boolean): MappingType {
  // A single subdomain, or an "and"-joined list, is treated as AND. This
  // is arbitrary when there is exactly one subdomain (AND/OR are
  // mathematically identical for a single item) but AND reads better as a
  // default label in the UI.
  return hasOr ? 'OR' : 'AND';
}

type RawRow = {
  name: string;
  rawText: string;
};

// Zero-width space/joiner/BOM characters, e.g. the stray U+200B before
// "Stop procrastinating" in the source sheet.
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

function cleanCell(value: string | undefined): string {
  return (value ?? '').replace(ZERO_WIDTH_RE, '').trim();
}

/**
 * Groups the raw TSV lines into one logical row per program, re-joining
 * cell text that spreadsheet line breaks scattered across several
 * physical lines.
 *
 * A row that starts a new program always contains a tab (even when its
 * second column is empty, e.g. "Stop procrastinating\t"). A continuation
 * line - the tail end of a multi-line spreadsheet cell - was exported
 * *without* a leading empty column, so it has no tab at all; the whole
 * line is then just more text for the previous row's second column. A
 * fully blank line is cosmetic spacing in the original sheet and carries
 * no data.
 */
export function groupTsvRows(tsvContent: string): RawRow[] {
  const lines = tsvContent.split(/\r?\n/);
  const rows: RawRow[] = [];
  let current: { name: string; parts: string[] } | null = null;

  const flush = () => {
    if (current) {
      rows.push({ name: current.name, rawText: current.parts.join(' ').trim() });
      current = null;
    }
  };

  for (const line of lines) {
    if (line.trim() === '') continue; // cosmetic spacer row, carries no data

    if (line.includes('\t')) {
      const [col1raw, col2raw] = line.split('\t');
      const name = cleanCell(col1raw);
      const text = cleanCell(col2raw);
      flush();
      current = { name, parts: text ? [text] : [] };
    } else if (current) {
      const text = cleanCell(line);
      if (text) current.parts.push(text);
    }
  }
  flush();

  return rows;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(ZERO_WIDTH_RE, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents for a plain-ascii id
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base || 'program';
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

/** Pure parse: raw TSV text in, typed programs out. No filesystem access. */
export function parseMatrix(tsvContent: string): Program[] {
  const rows = groupTsvRows(tsvContent).filter((r) => !/ahum services/i.test(r.name));
  const usedIds = new Set<string>();

  return rows.map((row) => {
    const { subdomains, hasOr } = tokenizeSubdomainText(row.rawText);
    const mappings: ProgramMapping[] = subdomains.length > 0 ? [{ type: mappingTypeFor(hasOr), subdomains }] : [];
    return {
      id: uniqueId(slugify(row.name), usedIds),
      name: row.name,
      mappings,
    };
  });
}

/** All subdomains referenced anywhere in the matrix, in first-appearance order. */
export function getAllSubdomains(programs: Program[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const program of programs) {
    for (const mapping of program.mappings) {
      for (const subdomain of mapping.subdomains) {
        if (!seen.has(subdomain)) {
          seen.add(subdomain);
          ordered.push(subdomain);
        }
      }
    }
  }
  return ordered;
}

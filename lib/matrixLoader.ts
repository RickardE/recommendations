import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { parseMatrix } from './matrixParser';
import type { Program } from './types';

/**
 * Server-only loader: reads data/table.tsv from disk and parses it.
 * Kept separate from matrixParser.ts so the parser itself stays a pure,
 * easily-unit-testable function with no filesystem dependency.
 */
export function loadMatrix(): Program[] {
  const filePath = path.join(process.cwd(), 'data', 'table.tsv');
  const content = fs.readFileSync(filePath, 'utf8');
  return parseMatrix(content);
}

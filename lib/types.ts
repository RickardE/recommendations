// Core domain types for the recommendation prototype.
// Kept deliberately small and explicit so the algorithm stays inspectable.

export type MappingType = 'SINGLE' | 'AND' | 'OR';

export type ProgramMapping = {
  type: MappingType;
  subdomains: string[];
};

export type Program = {
  id: string;
  name: string;
  /**
   * The table only ever gives us a single "primary match" mapping per
   * program, so in practice this array has 0 or 1 entries. It is kept as
   * an array (rather than a single optional mapping) so the data model can
   * absorb a future "secondary mapping" column without a breaking change.
   * Only mappings[0] is used by the scoring algorithm today.
   */
  mappings: ProgramMapping[];
};

export type SubdomainNeedEntry = {
  subdomain: string;
  need: number;
};

export type ProgramScoreResult = {
  program: Program;
  /**
   * The program's ORIGINAL mapping type, taken as-is from the matrix.
   * Coverage never changes this - an AND program is still AND even once
   * only one of its subdomains remains uncovered. null when the program
   * has no subdomain mapping at all.
   */
  mappingType: MappingType | null;
  /**
   * The subdomain-first target that caused this program to be evaluated
   * (see selectRecommendations.ts: step 4 of the selection algorithm).
   * null when a program is scored outside that round context (e.g. in a
   * unit test calling calculateProgramScore directly).
   */
  targetSubdomain: string | null;
  /**
   * The subdomains actually used in this calculation (i.e. the program's
   * mapped subdomains minus whatever was already covered coming into this
   * round), together with their (static) need values.
   */
  consideredSubdomains: SubdomainNeedEntry[];
  /**
   * Originally-mapped subdomains that are already covered, and were
   * therefore excluded from this calculation entirely. Equal to
   * program.mappings[0].subdomains minus consideredSubdomains.
   */
  ignoredCoveredSubdomains: string[];
  score: number;
  /** human readable calculation, shown verbatim in the UI for debugging */
  formula: string;
  /**
   * Subdomains that fed into the score: for AND this is every considered
   * subdomain; for OR this is the driver(s) plus the bonus subdomains.
   * Equal to consideredSubdomains.map(s => s.subdomain), kept as a separate
   * field for readability at call sites.
   */
  contributingSubdomains: string[];
  /**
   * Every subdomain this program would newly cover if selected right now -
   * i.e. all of consideredSubdomains, regardless of mapping type. Coverage
   * is intentionally NOT limited to the OR driver: selecting a program
   * covers its whole mapping, so a later round never re-targets a
   * subdomain this program was also mapped to. See `driverSubdomains` for
   * the (separate) concept of which subdomain explains an OR score.
   */
  newCoverage: string[];
  /**
   * OR only: the uncovered mapped subdomain(s) with the highest need -
   * the one(s) that explain *why* this OR program scored the way it did.
   * Purely explanatory; it does NOT determine coverage (see `newCoverage`).
   * Empty for SINGLE/AND, where the concept doesn't apply.
   */
  driverSubdomains: string[];
};

export type SelectionType = 'primary' | 'none';

export type RoundResult = {
  round: number;
  selectionType: SelectionType;
  /**
   * The highest-need uncovered subdomain this round was driven by, i.e.
   * step 3-4 of the subdomain-first selection algorithm. null only when no
   * uncovered subdomain had any remaining candidate program left
   * (selectionType 'none').
   */
  targetSubdomain: string | null;
  /** Every candidate mapped to targetSubdomain, scored, sorted best-first. */
  allScores: ProgramScoreResult[];
  selected: ProgramScoreResult | null;
  coveredBefore: string[];
  coveredAfter: string[];
};

export type RecommendationResult = {
  needs: Record<string, number>;
  rounds: RoundResult[];
  recommendations: ProgramScoreResult[];
  /** Programs present in the matrix but with no subdomain mapping at all. */
  unmappedPrograms: Program[];
};

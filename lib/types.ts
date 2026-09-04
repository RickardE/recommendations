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

export type RedundancyInfo = {
  /** fraction (0-1) of the program's full mapping already covered */
  ratio: number;
  /** multiplier applied to the score */
  factor: number;
  /** human readable bucket name, e.g. "High overlap" */
  label: string;
};

export type ProgramScoreResult = {
  program: Program;
  /** null when the program has no subdomain mapping at all */
  mappingType: MappingType | null;
  /**
   * The subdomains actually used in this calculation (i.e. the program's
   * mapped subdomains minus whatever was already covered coming into this
   * round), together with their (static) need values.
   */
  consideredSubdomains: SubdomainNeedEntry[];
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
  /** Subdomains this program would newly cover if selected right now. */
  newCoverage: string[];
  /** Only present when this score went through the redundancy fallback path. */
  redundancy?: RedundancyInfo;
};

export type SelectionType = 'primary' | 'fallback' | 'none';

export type RoundResult = {
  round: number;
  selectionType: SelectionType;
  /** Every eligible remaining program's score this round, sorted best-first. */
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

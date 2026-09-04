# Recommendation Algorithm Sandbox

A local, interactive Next.js prototype for validating the questionnaire-based
program recommendation algorithm. **Not production code** — no auth, no
database, no API layer. Its only job is to make the algorithm transparent
and easy to debug.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Change any subdomain's score and every
section recalculates immediately.

## Run the tests

```bash
npm test
```

## Project layout

```
/app                    Next.js App Router entry (Server Component that
                         loads+parses the matrix, then hands it to the client)
/components              UI only, no business logic
/lib
  types.ts               Shared TypeScript types
  matrixParser.ts         Pure TSV text -> Program[] parser (unit tested)
  matrixLoader.ts         Server-only: reads data/table.tsv from disk
  recommendation/
    calculateNeeds.ts
    calculateAndScore.ts
    calculateOrScore.ts
    calculateProgramScore.ts
    getCoveredSubdomains.ts
    calculateRedundancy.ts
    selectRecommendations.ts   Orchestrates the round-by-round algorithm
/data/table.tsv          Source of truth for programs & subdomain mappings
```

See the top of `lib/matrixParser.ts` for the parsing assumptions, and the
top of `lib/recommendation/selectRecommendations.ts` /
`calculateOrScore.ts` / `calculateRedundancy.ts` for the algorithm
assumptions — each is documented at the point it's made.

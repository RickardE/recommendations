# How the recommendation algorithm works

This is the long-form explanation of what this app does and why it makes
the decisions it makes. The README covers how to run it; this file covers
the actual logic, end to end.

The app takes a user's self-reported wellbeing scores across a set of
**subdomains** (Stress, Sömn, Depression, ...) and recommends up to 3
**programs** from `data/table.tsv` that best address the user's biggest
needs, without recommending overlapping programs.

---

## 1. The data model

### Subdomains and needs

Every subdomain has a **score** (0-100, user-reported: higher = doing
better) and a derived **need**:

```
need = 100 - score
```

So a low score (struggling) means a high need. This is the only
transformation applied to raw input; everything downstream operates on
`need`, never on `score` directly. See `lib/recommendation/calculateNeeds.ts`.

### Programs and mappings

Each row in `data/table.tsv` is a program (e.g. "Manage stress") mapped to
one or more subdomains, joined in the source spreadsheet with the English
words "and" / "or". The parser (`lib/matrixParser.ts`) turns that into an
explicit, closed type:

```ts
type MappingType = 'SINGLE' | 'AND' | 'OR';

type ProgramMapping = {
  type: MappingType;
  subdomains: string[];
};
```

- **SINGLE** - exactly one mapped subdomain.
  _"Manage stress" → Stress_
- **AND** - multiple subdomains, all of which matter together.
  _"Improve work/life balance" → Tidsupplevelse AND Stress_
- **OR** - multiple subdomains, any of which the program can address.
  _"Become more mindful" → Smärta OR Stress_

**Important invariant:** the mapping type is decided once, from the
*original* row in the spreadsheet, and never changes afterward - not even
when a round-by-round calculation later only has one of an AND/OR
program's subdomains left to consider. A 4-subdomain AND program down to
its last uncovered subdomain is still AND, scored and labeled as such; it
never silently becomes SINGLE. This was a real bug that got fixed early
on and is guarded by tests (`selectRecommendations.test.ts`, "TEST 6").

---

## 2. Scoring: how relevant is a program right now?

For a given program and a given set of already-covered subdomains, its
**considered subdomains** are its mapped subdomains minus whatever's
already covered. The formula then depends on the mapping type
(`lib/recommendation/calculateProgramScore.ts` dispatches to one of the
three below):

### SINGLE

```
relevance = need
```

Just the one subdomain's need value, verbatim. No averaging, no bonus.

### AND

```
eligible = every considered subdomain's need >= AND_ELIGIBILITY_MIN_NEED (60)

if not eligible: relevance = 0 (disqualified - see §3)
else:            relevance = min(100, average(need of every considered subdomain) * 1.10)
```

Every mapped subdomain matters equally, so the average naturally
penalizes an AND program that mixes one very-high-need subdomain with
several ordinary ones. Two rules address this, both keyed off the same
60-need floor:

- **Eligibility**: if even one considered subdomain's need falls below 60,
  the whole program is disqualified - not just scored low, but never
  selectable, for the rest of the run (see §3). A 3-subdomain AND program
  with two subdomains at need 90 and one at need 55 is completely off the
  table, even though two-thirds of it is clearly relevant.
- **Bonus**: once every subdomain clears 60, the average gets a single
  flat +10% bonus - not per subdomain, not compounding with subdomain
  count, just one multiplier applied once, capped at 100 like OR.

This is a real trade-off, not a full fix for AND's structural
disadvantage: the bonus is a flat multiplier, so it doesn't specifically
reward breadth (a 2-subdomain and a 4-subdomain AND program both just get
+10%), and the eligibility floor makes wider AND programs *harder* to
qualify at all (more subdomains means more chances one is below 60) even
though the intent was to help AND compete. See "known trade-offs" below.

### OR

```
relevance = strongestNeed + (average(other qualifying needs) × 0.10)
capped at 100
```

The highest-need mapped subdomain ("the driver") sets the baseline; the
other mapped subdomains add a 10% bonus on top - but **only if their own
need is at least `OR_BONUS_MIN_NEED` (60)**. A companion sitting at an
ordinary need doesn't count toward the bonus at all.

That threshold exists because of a concrete, once-real bug: with
Stress=99 and every other subdomain at a middling 50, "Manage stress"
(SINGLE on Stress) scored 99, but "Become more mindful" (OR: Smärta,
Stress) scored `99 + 50×0.10 = 104`, capped to 100 - beating the exact
match purely because Smärta happened to have *some* need, not because it
was actually significant. Gating the bonus on the companion's own need
fixes that while changing nothing when the companion genuinely is a
second real problem (e.g. Smärta=90 still adds its bonus normally).

The **driver** and **what gets covered** are two separate concepts - see
§3.

---

## 3. Coverage: what happens when a program is selected

**Selecting a program covers every one of its mapped subdomains - all of
them, regardless of mapping type.** This applies identically to SINGLE,
AND, and OR.

For OR specifically, this is a deliberate, non-obvious rule: the
"driver" subdomain only explains *why* the program scored the way it did.
It does **not** limit what gets covered. Selecting "Become more mindful"
(Smärta OR Stress) covers **both** Smärta and Stress, even though Stress
was the driver. If only the driver were covered, a later round could
recommend a second, overlapping program purely to "re-cover" the
subdomain that was left dangling - which is exactly the overlap problem
this rule was built to prevent.

### Strict eligibility

A program is only eligible to compete in a round while **none** of its
mapped subdomains are covered yet - by anything, including a different
program's selection. The moment even one of its subdomains gets covered,
it's permanently disqualified, even if it has other, still-uncovered
subdomains of its own.

**AND programs have a second, independent way to be disqualified**: if
any one of an AND program's mapped subdomains has a need below
`AND_ELIGIBILITY_MIN_NEED` (60), it's disqualified for the *entire run*,
starting in round 1 - before anything has even been covered yet. Unlike
the coverage rule above (which only kicks in once some other selection
covers a shared subdomain), this can make an AND program unreachable from
the very first round, purely because of the user's own scores. Both
disqualifications feed the same eligibility check in
`selectRecommendations.ts`, computed once up front since needs are static
for the whole run.

This guarantees the final recommendation set never shares a subdomain
across two programs - a strong, simple guarantee. The trade-off: a
subdomain can become **unreachable** once every program mapped to it has
been disqualified this way. A real example from the matrix:

- "Create healthy routines" → Kost och matvanor OR Fysisk aktivitet
- "Achive your goals and dreams" → Kost och matvanor OR **Tobak** OR Fysisk aktivitet

If "Create healthy routines" wins its round, "Achive your goals and
dreams" - the *only* program mapped to Tobak - is disqualified outright,
and Tobak can never be addressed for the rest of that run, even if its
own need is high. This is a known, accepted trade-off (see
`selectRecommendations.test.ts` for the exact worked case), not a bug.

---

## 4. The selection algorithm, round by round

`lib/recommendation/selectRecommendations.ts` runs up to 3 rounds
(configurable), each doing the same thing:

1. Compute `need = 100 - score` for every subdomain (once, up front -
   needs never change during a run).
2. Look at every subdomain that isn't covered yet, highest need first.
3. Find the *first* one (in that order) that at least one eligible
   program is still mapped to - that's this round's **target subdomain**.
   (Ties are broken deterministically by first-appearance order in
   `data/table.tsv`.)
4. Every eligible program mapped to the target is a candidate, scored
   with its own SINGLE/AND/OR formula (§2).
5. The highest-scoring candidate is selected and recommended.
6. Every one of its mapped subdomains is marked covered (§3) - including
   ones that disqualify other, unrelated programs from future rounds.
7. Repeat with the next highest-need still-uncovered subdomain.

If no uncovered subdomain has any eligible program left, the run stops
there - there's no "recommend something anyway" fallback. This can mean
fewer than 3 recommendations.

### Worked example

Needs: Stress=99, everything else=50.

- **Round 1** - target: Stress. Candidates include "Manage stress"
  (SINGLE, score 99) and "Become more mindful" (OR: Smärta, Stress -
  Smärta at 50 doesn't clear the bonus threshold, so it also scores 99).
  Tied at 99, "Manage stress" wins the tie (appears first in the source
  file). **Selected: Manage stress.** Covered: `{Stress}`.
- **Round 2** - target: whichever subdomain is now highest-need and still
  has an eligible program. Every program that was *also* mapped to
  Stress (e.g. "Improve work/life balance", "Become more mindful") is now
  disqualified outright, even for their other subdomains.
- **Round 3** - continues the same way, picking up whatever's left.

---

## 5. The UI

Running `npm run dev` and opening the app shows, top to bottom:

1. **User scores** - one slider + number input per subdomain; need is
   shown live as `100 - score`.
2. **Recommendations** - the final selected programs, each with its full
   calculation breakdown (mapping type, subdomains considered, formula,
   driver, new coverage).
3. **Recommendation rounds** - the same information, organized round by
   round, showing what was covered coming in vs. after each round.
4. **All program scores (debug)** - every eligible candidate for each
   round's target subdomain, sorted best-first, with the winner starred.
   Click a row to expand its full calculation.
5. **Program matrix** - a clean, parsed view of every program's mapping
   type and subdomains, for cross-checking against `data/table.tsv`.

Every section reads from the same single `selectRecommendations()` call
(`components/AppClient.tsx`), recomputed on every score change - there's
no separate "stale" state to manage.

---

## 6. Known trade-offs and ideas not (yet) implemented

- **The AND eligibility floor can orphan a subdomain from round 1,
  before anything is even covered.** Two subdomains in the current
  `data/table.tsv` have *no* SINGLE or OR path at all -
  **Tidsupplevelse** and **Individuella inre upplevelser** - they're only
  ever reachable via AND programs. If every AND program mapped to one of
  them has another subdomain sitting below the 60-need floor, that
  subdomain becomes completely unaddressable for the whole run, no matter
  how high its own need is. This is a data gap, not an algorithm bug: the
  fix is adding a SINGLE or OR program for those two subdomains in
  `table.tsv` (which - see the file-map's note on live-editing table.tsv -
  takes effect immediately, no code change needed), the same way every
  other subdomain already has a non-AND fallback.
- **The AND bonus is a flat multiplier, not a breadth reward.** `avg *
  1.10` boosts every eligible AND program by the same proportion
  regardless of whether it has 2 or 4 subdomains - it doesn't specifically
  compensate for the dilution that comes from averaging more subdomains
  together, and the eligibility floor actually makes *wider* AND programs
  *harder* to qualify at all (more subdomains = more chances one is below
  60). A user with one standout need and otherwise-ordinary scores will
  still see most AND programs excluded outright, with only SINGLE/OR
  programs on that one subdomain left in contention. A true "breadth
  bonus" (scaled by subdomain count, or by the minimum need rather than
  the average) would close that gap further but was intentionally not
  built - this simpler version was chosen first.
- **The strict "any overlap disqualifies" coverage rule** (§3) can orphan
  a subdomain for the rest of a run, as shown in the Tobak example. A
  "middle ground" - disqualifying a program only once its overlap ratio
  with already-covered subdomains crosses some threshold, using the
  already-built (but currently unused) `calculateRedundancy.ts` - was
  discussed as a follow-up but not built.
- **`OR_BONUS_MIN_NEED` and `AND_ELIGIBILITY_MIN_NEED` are both tuned
  constants (60)**, not derived from the original spec, and kept as two
  separate constants even though they currently share a value - one gates
  a bonus, the other gates eligibility itself, and they may need
  independent tuning later. Both were chosen because they fix a reported
  problem against real data without changing other tested scenarios, but
  they're judgment calls, not mathematical necessities.
- This is a **prototype**: no auth, no database, no persistence. Scores
  live only in React state for the current browser session.

---

## 7. Where to look in the code

| Concept | File |
|---|---|
| Need calculation | `lib/recommendation/calculateNeeds.ts` |
| TSV parsing, mapping type derivation | `lib/matrixParser.ts` |
| SINGLE formula | `lib/recommendation/calculateSingleScore.ts` |
| AND formula + eligibility floor + bonus | `lib/recommendation/calculateAndScore.ts` |
| OR formula + bonus threshold | `lib/recommendation/calculateOrScore.ts` |
| Per-program dispatch (SINGLE/AND/OR) | `lib/recommendation/calculateProgramScore.ts` |
| The round-by-round algorithm | `lib/recommendation/selectRecommendations.ts` |
| Shared types | `lib/types.ts` |
| Debug/why-was-this-picked UI | `components/ProgramCalculation.tsx` |

Every file above has its own doc comment explaining the exact rule it
implements and, where relevant, *why* - this file is the map; the code
comments are the territory.

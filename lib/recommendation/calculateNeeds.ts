/**
 * need = 100 - userScore
 *
 * Scores are clamped to [0, 100] defensively; the UI should never produce
 * an out-of-range value, but the algorithm stays correct even if it does.
 */
export function calculateNeed(userScore: number): number {
  const clamped = Math.max(0, Math.min(100, userScore));
  return 100 - clamped;
}

export function calculateNeeds(scores: Record<string, number>): Record<string, number> {
  const needs: Record<string, number> = {};
  for (const [subdomain, score] of Object.entries(scores)) {
    needs[subdomain] = calculateNeed(score);
  }
  return needs;
}

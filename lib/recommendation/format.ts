/** Round to 1 decimal place for display/formula purposes. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

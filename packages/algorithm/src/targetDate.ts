const KG_PER_WEEK = 0.5;

export type TargetDateInput = {
  currentWeightKg: number;
  targetWeightKg: number;
  asOf?: Date;
};

function toIsoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(from: Date, days: number): Date {
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days),
  );
}

/**
 * Estimate the ISO date to hit `targetWeightKg` at 0.5 kg/week of fat loss.
 * Muscle-gain and maintenance (target ≥ current) return null.
 */
export function calculateTargetDate(input: TargetDateInput): string | null {
  const gapKg = input.currentWeightKg - input.targetWeightKg;
  if (gapKg <= 0) {
    return null;
  }

  const weeks = Math.ceil(gapKg / KG_PER_WEEK);
  const asOf = input.asOf ?? new Date();
  return toIsoDateUtc(addUtcDays(asOf, weeks * 7));
}

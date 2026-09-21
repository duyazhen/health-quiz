import type { HealthResult } from "@prisma/client";
import {
  memberResultSchema,
  publicResultSchema,
} from "./zod-schemas";

export type PublicResultDto = {
  bmi: number;
  recommendedCalories: number;
};

export type WeightProjectionPoint = {
  week: number;
  date: string;
  weightKg: number;
};

export type MemberResultDto = PublicResultDto & {
  targetDate: string | null;
  algorithmVersion: string;
  weightProjection: WeightProjectionPoint[];
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(from: Date, days: number): Date {
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days),
  );
}

export function buildWeightProjection(input: {
  weightKg: number;
  targetWeightKg: number;
  asOf?: Date;
}): WeightProjectionPoint[] {
  const asOf = input.asOf ?? new Date();
  const points: WeightProjectionPoint[] = [
    {
      week: 0,
      date: toIsoDate(asOf),
      weightKg: Math.round(input.weightKg * 10) / 10,
    },
  ];

  const gapKg = input.weightKg - input.targetWeightKg;
  if (gapKg <= 0) {
    return points;
  }

  const weeks = Math.ceil(gapKg / 0.5);
  for (let week = 1; week <= weeks; week += 1) {
    const projected = Math.max(input.targetWeightKg, input.weightKg - 0.5 * week);
    points.push({
      week,
      date: toIsoDate(addUtcDays(asOf, week * 7)),
      weightKg: Math.round(projected * 10) / 10,
    });
  }
  return points;
}

export function toPublicResultDto(result: HealthResult): PublicResultDto {
  return publicResultSchema.parse({
    bmi: Number(result.bmi),
    recommendedCalories: result.recommendedCalories,
  });
}

export function toMemberResultDto(
  result: HealthResult,
  projection: WeightProjectionPoint[],
): MemberResultDto {
  return memberResultSchema.parse({
    bmi: Number(result.bmi),
    recommendedCalories: result.recommendedCalories,
    targetDate: result.targetDate ? toIsoDate(result.targetDate) : null,
    algorithmVersion: result.algorithmVersion,
    weightProjection: projection,
  });
}

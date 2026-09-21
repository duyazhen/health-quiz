import { calculateBmi } from "./bmi";
import { calculateTdee, type ActivityLevel, type Gender } from "./tdee";
import { calculateTargetDate } from "./targetDate";

export const ALGORITHM_VERSION = "v1.0-Mifflin-StJeor" as const;

export type { ActivityLevel, Gender };
export { calculateBmi } from "./bmi";
export { calculateTdee, ACTIVITY_MULTIPLIERS } from "./tdee";
export { calculateTargetDate } from "./targetDate";

export type HealthInput = {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  asOf?: Date;
};

export type HealthOutput = {
  bmi: number;
  recommendedCalories: number;
  targetDate: string | null;
  algorithmVersion: typeof ALGORITHM_VERSION;
};

export function calculateHealth(input: HealthInput): HealthOutput {
  return {
    bmi: calculateBmi(input.weightKg, input.heightCm),
    recommendedCalories: Math.round(
      calculateTdee({
        gender: input.gender,
        weightKg: input.weightKg,
        heightCm: input.heightCm,
        age: input.age,
        activityLevel: input.activityLevel,
      }),
    ),
    targetDate: calculateTargetDate({
      currentWeightKg: input.weightKg,
      targetWeightKg: input.targetWeightKg,
      asOf: input.asOf,
    }),
    algorithmVersion: ALGORITHM_VERSION,
  };
}

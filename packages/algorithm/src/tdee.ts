export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_MULTIPLIERS;
export type Gender = "male" | "female";

export type TdeeInput = {
  gender: Gender;
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
};

/**
 * Mifflin-St Jeor equation (1990) for BMR, then TDEE = BMR × activity factor.
 * Source: Mifflin MD, St Jeor ST, et al. "A new predictive equation for resting
 * energy expenditure in healthy individuals." Am J Clin Nutr. 1990;51(2):241-247.
 * https://doi.org/10.1093/ajcn/51.2.241
 *
 * Male:   BMR = 10×weight(kg) + 6.25×height(cm) − 5×age + 5
 * Female: BMR = 10×weight(kg) + 6.25×height(cm) − 5×age − 161
 * Activity: 1.2 / 1.375 / 1.55 / 1.725 / 1.9
 */
export function calculateTdee(input: TdeeInput): number {
  const { gender, weightKg, heightCm, age, activityLevel } = input;
  const genderOffset = gender === "male" ? 5 : -161;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + genderOffset;
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel];
}

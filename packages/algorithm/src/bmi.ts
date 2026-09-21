/** BMI = weight(kg) / height(m)^2, rounded to 1 decimal place. */
export function calculateBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  const bmi = weightKg / heightM ** 2;
  return Math.round(bmi * 10) / 10;
}

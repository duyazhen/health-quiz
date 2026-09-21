import { describe, expect, it } from "vitest";
import { calculateHealth } from "./index";

const AS_OF = new Date("2026-09-21T00:00:00.000Z");

describe("calculateHealth", () => {
  it("正常：男性中等活动减重 5kg", () => {
    const result = calculateHealth({
      gender: "male",
      age: 30,
      heightCm: 175,
      weightKg: 70,
      targetWeightKg: 65,
      activityLevel: "moderate",
      asOf: AS_OF,
    });

    expect(result).toEqual({
      bmi: 22.9,
      recommendedCalories: 2556,
      targetDate: "2026-11-30",
      algorithmVersion: "v1.0-Mifflin-StJeor",
    });
  });

  it("极端值：200cm / 150kg", () => {
    const result = calculateHealth({
      gender: "male",
      age: 50,
      heightCm: 200,
      weightKg: 150,
      targetWeightKg: 140,
      activityLevel: "very_active",
      asOf: AS_OF,
    });

    expect(result.bmi).toBe(37.5);
    expect(result.recommendedCalories).toBe(4760);
    expect(result.targetDate).toBe("2027-02-08");
  });

  it("增肌：目标体重高于当前，targetDate 为 null", () => {
    const result = calculateHealth({
      gender: "male",
      age: 30,
      heightCm: 175,
      weightKg: 70,
      targetWeightKg: 75,
      activityLevel: "moderate",
      asOf: AS_OF,
    });

    expect(result.bmi).toBe(22.9);
    expect(result.recommendedCalories).toBe(2556);
    expect(result.targetDate).toBeNull();
  });

  it("维持：目标体重等于当前，targetDate 为 null", () => {
    const result = calculateHealth({
      gender: "female",
      age: 28,
      heightCm: 162,
      weightKg: 55,
      targetWeightKg: 55,
      activityLevel: "light",
      asOf: AS_OF,
    });

    expect(result.bmi).toBe(21.0);
    expect(result.targetDate).toBeNull();
  });

  it("负缺口：需减重 20kg，按每周 0.5kg 反推日期", () => {
    const result = calculateHealth({
      gender: "female",
      age: 28,
      heightCm: 162,
      weightKg: 80,
      targetWeightKg: 60,
      activityLevel: "light",
      asOf: AS_OF,
    });

    expect(result.bmi).toBe(30.5);
    expect(result.recommendedCalories).toBe(2078);
    expect(result.targetDate).toBe("2027-06-28");
  });
});

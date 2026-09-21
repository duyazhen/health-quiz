import { z } from "zod";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const PLAN_AMOUNTS = {
  monthly: 9.9,
  yearly: 99,
} as const;

export const genderSchema = z.enum(["male", "female"]);
export const activityLevelSchema = z.enum([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);
export const planTypeSchema = z.enum(["monthly", "yearly"]);

export const uuidV4Schema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "must be UUID v4",
  );

export const progressAnswersSchema = z
  .object({
    focusArea: z.enum(["belly", "legs", "arms", "full"]).optional(),
    bodyType: z.enum(["slim", "average", "curvy"]).optional(),
    location: z.enum(["home", "gym", "outdoor"]).optional(),
    duration: z.enum(["10", "20", "30", "45"]).optional(),
    diet: z.enum(["balanced", "vegetarian", "high_protein"]).optional(),
    sleep: z.enum(["lt6", "6to8", "gt8"]).optional(),
  })
  .strict();

export const progressDataSchema = z
  .object({
    gender: genderSchema.optional(),
    goal: z.string().min(1).max(64).optional(),
    age: z.number().int().min(10).max(100).optional(),
    heightCm: z.number().min(50).max(250).optional(),
    weightKg: z.number().min(20).max(400).optional(),
    targetWeightKg: z.number().min(20).max(400).optional(),
    activityLevel: activityLevelSchema.optional(),
    answers: progressAnswersSchema.optional(),
  })
  .strict();

export const patchProgressSchema = z
  .object({
    sessionId: z.string().min(1),
    step: z.number().int().min(0).max(20),
    data: progressDataSchema,
  })
  .strict();

export const sessionQuerySchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();

export const submitAssessmentSchema = z
  .object({
    sessionId: z.string().min(1),
    gender: genderSchema,
    goal: z.string().min(1).max(64),
    age: z.number().int().min(10).max(100),
    heightCm: z.number().min(50).max(250),
    weightKg: z.number().min(20).max(400),
    targetWeightKg: z.number().min(20).max(400),
    activityLevel: activityLevelSchema,
  })
  .strict();

export const payBodySchema = z
  .object({
    sessionId: z.string().min(1),
    planType: planTypeSchema,
  })
  .strict();

export const payCallbackSchema = z
  .object({
    paymentRef: z.string().min(1),
    status: z.enum(["success", "failed"]),
  })
  .strict();

export const publicResultSchema = z
  .object({
    bmi: z.number(),
    recommendedCalories: z.number(),
  })
  .strict();

export const weightProjectionPointSchema = z
  .object({
    week: z.number().int().nonnegative(),
    date: z.string(),
    weightKg: z.number(),
  })
  .strict();

export const memberResultSchema = publicResultSchema
  .extend({
    targetDate: z.string().nullable(),
    algorithmVersion: z.string(),
    weightProjection: z.array(weightProjectionPointSchema),
  })
  .strict();

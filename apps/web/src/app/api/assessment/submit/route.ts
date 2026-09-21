import { calculateHealth } from "@health-quiz/algorithm";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJsonBody, withApi } from "@/lib/errors";
import { renewSession, requireUser } from "@/lib/session";
import { submitAssessmentSchema } from "@/lib/zod-schemas";

export const POST = withApi("/api/assessment/submit", async (req, { logger }) => {
  const body = submitAssessmentSchema.parse(await parseJsonBody(req));
  const user = await requireUser(body.sessionId);
  const health = calculateHealth({
    gender: body.gender,
    age: body.age,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    targetWeightKg: body.targetWeightKg,
    activityLevel: body.activityLevel,
  });

  const rawInputs = {
    gender: body.gender,
    goal: body.goal,
    age: body.age,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    targetWeightKg: body.targetWeightKg,
    activityLevel: body.activityLevel,
  };

  const progressData = {
    gender: body.gender,
    goal: body.goal,
    age: body.age,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    targetWeightKg: body.targetWeightKg,
    activityLevel: body.activityLevel,
    stepCompleted: 12,
  };

  const saved = await prisma.$transaction(async (tx) => {
    await tx.assessmentProgress.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...progressData },
      update: progressData,
    });

    return tx.healthResult.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        bmi: health.bmi,
        recommendedCalories: health.recommendedCalories,
        targetDate: health.targetDate ? new Date(`${health.targetDate}T00:00:00.000Z`) : null,
        rawInputs,
        algorithmVersion: health.algorithmVersion,
      },
      update: {
        bmi: health.bmi,
        recommendedCalories: health.recommendedCalories,
        targetDate: health.targetDate ? new Date(`${health.targetDate}T00:00:00.000Z`) : null,
        rawInputs,
        algorithmVersion: health.algorithmVersion,
      },
    });
  });

  await renewSession(user.id);
  logger.info("assessment submitted", { resultId: saved.id, algorithmVersion: health.algorithmVersion });
  return NextResponse.json({ resultId: saved.id }, { status: 201 });
});

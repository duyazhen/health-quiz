import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJsonBody, withApi } from "@/lib/errors";
import { renewSession, requireUser, toNullableNumber } from "@/lib/session";
import { patchProgressSchema, progressAnswersSchema, sessionQuerySchema } from "@/lib/zod-schemas";
import type { z } from "zod";

type ProgressAnswers = z.infer<typeof progressAnswersSchema>;

type ProgressSnapshot = {
  gender: string | null;
  goal: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  activityLevel: string | null;
  stepCompleted: number;
  answers: ProgressAnswers;
};

function asAnswers(value: unknown): ProgressAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ProgressAnswers;
}

function snapshotFromRow(row: {
  gender: string | null;
  goal: string | null;
  age: number | null;
  heightCm: { toNumber?: () => number } | number | null;
  weightKg: { toNumber?: () => number } | number | null;
  targetWeightKg: { toNumber?: () => number } | number | null;
  activityLevel: string | null;
  stepCompleted: number;
  answers?: unknown;
}): ProgressSnapshot {
  return {
    gender: row.gender,
    goal: row.goal,
    age: row.age,
    heightCm: toNullableNumber(row.heightCm),
    weightKg: toNullableNumber(row.weightKg),
    targetWeightKg: toNullableNumber(row.targetWeightKg),
    activityLevel: row.activityLevel,
    stepCompleted: row.stepCompleted,
    answers: asAnswers(row.answers),
  };
}

function toPublicData(snapshot: ProgressSnapshot) {
  return {
    gender: snapshot.gender,
    goal: snapshot.goal,
    age: snapshot.age,
    heightCm: snapshot.heightCm,
    weightKg: snapshot.weightKg,
    targetWeightKg: snapshot.targetWeightKg,
    activityLevel: snapshot.activityLevel,
    answers: snapshot.answers,
  };
}

export const PATCH = withApi("/api/progress", async (req, { logger }) => {
  const body = patchProgressSchema.parse(await parseJsonBody(req));
  const user = await requireUser(body.sessionId);
  const existing = await prisma.assessmentProgress.findUnique({
    where: { userId: user.id },
  });

  const merged: ProgressSnapshot = {
    gender: body.data.gender ?? existing?.gender ?? null,
    goal: body.data.goal ?? existing?.goal ?? null,
    age: body.data.age ?? existing?.age ?? null,
    heightCm: body.data.heightCm ?? toNullableNumber(existing?.heightCm) ?? null,
    weightKg: body.data.weightKg ?? toNullableNumber(existing?.weightKg) ?? null,
    targetWeightKg:
      body.data.targetWeightKg ?? toNullableNumber(existing?.targetWeightKg) ?? null,
    activityLevel: body.data.activityLevel ?? existing?.activityLevel ?? null,
    stepCompleted: Math.max(body.step, existing?.stepCompleted ?? 0),
    answers: { ...asAnswers(existing?.answers), ...body.data.answers },
  };

  const unchanged =
    existing != null &&
    JSON.stringify(snapshotFromRow(existing)) === JSON.stringify(merged);

  if (!unchanged) {
    const writeData = {
      gender: merged.gender,
      goal: merged.goal,
      age: merged.age,
      heightCm: merged.heightCm,
      weightKg: merged.weightKg,
      targetWeightKg: merged.targetWeightKg,
      activityLevel: merged.activityLevel,
      stepCompleted: merged.stepCompleted,
      answers: merged.answers as Prisma.InputJsonValue,
    };

    await prisma.assessmentProgress.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...writeData },
      update: writeData,
    });
  }

  const expiresAt = await renewSession(user.id);
  logger.info("progress saved", {
    sessionId: body.sessionId,
    step: merged.stepCompleted,
    idempotent: unchanged,
  });

  return NextResponse.json({
    data: toPublicData(merged),
    stepCompleted: merged.stepCompleted,
    expiresAt: expiresAt.toISOString(),
  });
});

export const GET = withApi("/api/progress", async (req, { logger }) => {
  const { sessionId } = sessionQuerySchema.parse({
    sessionId: new URL(req.url).searchParams.get("sessionId") ?? "",
  });
  const user = await requireUser(sessionId);
  const progress = await prisma.assessmentProgress.findUnique({
    where: { userId: user.id },
  });
  const snapshot = progress
    ? snapshotFromRow(progress)
    : {
        gender: null,
        goal: null,
        age: null,
        heightCm: null,
        weightKg: null,
        targetWeightKg: null,
        activityLevel: null,
        stepCompleted: 0,
        answers: {},
      };

  logger.info("progress loaded", { sessionId });
  return NextResponse.json({
    data: toPublicData(snapshot),
    stepCompleted: snapshot.stepCompleted,
    expiresAt: user.expiresAt.toISOString(),
  });
});

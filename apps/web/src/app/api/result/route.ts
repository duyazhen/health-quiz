import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, withApi } from "@/lib/errors";
import { buildWeightProjection, toMemberResultDto, toPublicResultDto } from "@/lib/dto";
import { isSubscriptionActive } from "@/lib/pay";
import { requireUser } from "@/lib/session";
import { sessionQuerySchema } from "@/lib/zod-schemas";

export const GET = withApi("/api/result", async (req, { logger }) => {
  const { sessionId } = sessionQuerySchema.parse({
    sessionId: new URL(req.url).searchParams.get("sessionId") ?? "",
  });
  const user = await requireUser(sessionId);
  const result = await prisma.healthResult.findUnique({ where: { userId: user.id } });
  if (!result) {
    throw new ApiError(404, "Assessment result not found");
  }

  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
  const isMember = isSubscriptionActive(subscription);

  if (!isMember) {
    const dto = toPublicResultDto(result);
    logger.info("result returned", { sessionId, gated: true });
    return NextResponse.json(dto);
  }

  const rawInputs = z
    .object({
      weightKg: z.number(),
      targetWeightKg: z.number(),
    })
    .parse(result.rawInputs);

  const dto = toMemberResultDto(
    result,
    buildWeightProjection({
      weightKg: rawInputs.weightKg,
      targetWeightKg: rawInputs.targetWeightKg,
      asOf: result.createdAt,
    }),
  );
  logger.info("result returned", { sessionId, gated: false });
  return NextResponse.json(dto);
});

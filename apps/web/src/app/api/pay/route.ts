import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, parseJsonBody, withApi } from "@/lib/errors";
import { toPayOrderDto } from "@/lib/pay";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { renewSession, requireUser } from "@/lib/session";
import { payBodySchema, PLAN_AMOUNTS, uuidV4Schema } from "@/lib/zod-schemas";

export const POST = withApi("/api/pay", async (req, { requestId, logger }) => {
  const ip = getClientIp(req);
  if (!consumeRateLimit(ip)) {
    throw new ApiError(429, "Too many requests");
  }

  const idempotencyKey = uuidV4Schema.parse(req.headers.get("idempotency-key") ?? "");
  const body = payBodySchema.parse(await parseJsonBody(req));
  const user = await requireUser(body.sessionId);
  const amount = PLAN_AMOUNTS[body.planType];

  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
    include: { subscription: true },
  });
  if (existing) {
    logger.info("pay idempotent hit", { idempotencyKey, paymentId: existing.id, status: existing.status });
    return NextResponse.json({
      code: 0,
      message: "ok",
      data: toPayOrderDto(existing, existing.subscription),
      requestId,
    });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const current =
        (await tx.subscription.findUnique({ where: { userId: user.id } })) ??
        (await tx.subscription.create({
          data: { userId: user.id, status: "free" },
        }));

      const payment = await tx.payment.create({
        data: {
          subscriptionId: current.id,
          planType: body.planType,
          amount,
          status: "pending",
          paymentRef: createId(),
          idempotencyKey,
          requestIp: ip,
        },
      });

      return { payment, subscription: current };
    });

    await renewSession(user.id);
    logger.info("pay order created", {
      paymentRef: created.payment.paymentRef,
      planType: body.planType,
    });
    return NextResponse.json(
      {
        code: 0,
        message: "ok",
        data: toPayOrderDto(created.payment, created.subscription),
        requestId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await prisma.payment.findUnique({
        where: { idempotencyKey },
        include: { subscription: true },
      });
      if (replay) {
        return NextResponse.json({
          code: 0,
          message: "ok",
          data: toPayOrderDto(replay, replay.subscription),
          requestId,
        });
      }
    }
    throw error;
  }
});

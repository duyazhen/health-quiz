import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/errors";
import { nextExpiry } from "@/lib/session";

export const POST = withApi("/api/session", async (_req, { logger }) => {
  const sessionId = createId();
  const expiresAt = nextExpiry();

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { sessionId, expiresAt },
    });
    await tx.subscription.create({
      data: { userId: user.id, status: "free" },
    });
  });

  logger.info("session created", { sessionId });
  return NextResponse.json({ sessionId, expiresAt: expiresAt.toISOString() }, { status: 201 });
});

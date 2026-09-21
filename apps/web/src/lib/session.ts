import type { User } from "@prisma/client";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { SESSION_TTL_MS } from "./zod-schemas";

export async function requireUser(sessionId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { sessionId } });
  if (!user) {
    throw new ApiError(401, "Unauthorized");
  }
  if (user.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(410, "Session expired");
  }
  return user;
}

export function nextExpiry(from = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_MS);
}

export async function renewSession(userId: string): Promise<Date> {
  const expiresAt = nextExpiry();
  await prisma.user.update({
    where: { id: userId },
    data: { expiresAt },
  });
  return expiresAt;
}

export function toNullableNumber(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  return value.toNumber?.() ?? Number(value);
}

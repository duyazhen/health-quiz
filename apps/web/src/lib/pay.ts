import { createHmac, timingSafeEqual } from "crypto";
import type { Payment, Prisma, Subscription } from "@prisma/client";
import { prisma } from "./db";
import { ApiError } from "./errors";

export const PAY_WEBHOOK_SECRET = process.env.PAY_WEBHOOK_SECRET ?? "dev-mock-pay-secret";

export type PayCallbackStatus = "success" | "failed";

export type PayOrderDto = {
  paymentRef: string;
  paymentStatus: "pending" | "success" | "failed";
  subscriptionId: string;
  subscriptionStatus: "free" | "active";
  currentPeriodEnd: string | null;
};

export function canonicalPayCallback(paymentRef: string, status: PayCallbackStatus): string {
  return `${paymentRef}:${status}`;
}

export function signPayCallback(paymentRef: string, status: PayCallbackStatus, secret = PAY_WEBHOOK_SECRET): string {
  return createHmac("sha256", secret).update(canonicalPayCallback(paymentRef, status)).digest("hex");
}

export function verifyPaySignature(
  paymentRef: string,
  status: PayCallbackStatus,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = signPayCallback(paymentRef, status);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function periodEndFor(planType: "monthly" | "yearly", from = new Date()): Date {
  const end = new Date(from.getTime());
  if (planType === "yearly") {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCDate(end.getUTCDate() + 30);
  }
  return end;
}

export function isSubscriptionActive(
  subscription: Pick<Subscription, "status" | "currentPeriodEnd"> | null | undefined,
): boolean {
  if (!subscription || subscription.status !== "active") return false;
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

export function toPayOrderDto(payment: Payment, subscription: Subscription): PayOrderDto {
  return {
    paymentRef: payment.paymentRef,
    paymentStatus: payment.status,
    subscriptionId: subscription.id,
    subscriptionStatus: isSubscriptionActive(subscription) ? "active" : "free",
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
  };
}

export async function settlePaymentCallback(input: {
  paymentRef: string;
  status: PayCallbackStatus;
  payload: Prisma.InputJsonValue;
}): Promise<{ payment: Payment; subscription: Subscription }> {
  const payment = await prisma.payment.findUnique({
    where: { paymentRef: input.paymentRef },
    include: { subscription: true },
  });
  if (!payment) {
    throw new ApiError(404, "Payment not found");
  }

  if (payment.status === input.status) {
    return { payment, subscription: payment.subscription };
  }

  if (payment.status !== "pending") {
    throw new ApiError(409, "Payment already settled");
  }

  return prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: input.status,
        callbackAt: new Date(),
        callbackPayload: input.payload,
      },
    });

    if (input.status !== "success") {
      return { payment: updatedPayment, subscription: payment.subscription };
    }

    const now = new Date();
    const subscription = await tx.subscription.update({
      where: { id: payment.subscriptionId },
      data: {
        status: "active",
        planType: payment.planType,
        paidAt: now,
        currentPeriodEnd: periodEndFor(payment.planType, now),
      },
    });

    return { payment: updatedPayment, subscription };
  });
}

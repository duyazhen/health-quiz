import { NextResponse } from "next/server";
import { ApiError, parseJsonBody, withApi } from "@/lib/errors";
import { settlePaymentCallback, toPayOrderDto, verifyPaySignature } from "@/lib/pay";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { payCallbackSchema } from "@/lib/zod-schemas";

export const POST = withApi("/api/pay/callback", async (req, { requestId, logger }) => {
  const ip = getClientIp(req);
  if (!consumeRateLimit(ip)) {
    throw new ApiError(429, "Too many requests");
  }

  const body = payCallbackSchema.parse(await parseJsonBody(req));
  const signature = req.headers.get("x-pay-signature");
  if (!verifyPaySignature(body.paymentRef, body.status, signature)) {
    throw new ApiError(401, "Invalid payment signature");
  }

  const settled = await settlePaymentCallback({
    paymentRef: body.paymentRef,
    status: body.status,
    payload: {
      paymentRef: body.paymentRef,
      status: body.status,
      receivedAt: new Date().toISOString(),
    },
  });

  logger.info("pay callback settled", {
    paymentRef: body.paymentRef,
    paymentStatus: settled.payment.status,
    subscriptionStatus: settled.subscription.status,
  });

  return NextResponse.json({
    code: 0,
    message: "ok",
    data: toPayOrderDto(settled.payment, settled.subscription),
    requestId,
  });
});

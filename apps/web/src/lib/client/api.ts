import type { FunnelValues } from "./storage";
import { signPayCallback } from "./pay-sign";

type ApiErrorBody = {
  code?: number;
  message?: string;
};

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await parseBody(res);
  if (!res.ok) {
    const err = body as ApiErrorBody;
    throw new Error(err.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function createSession() {
  return request<{ sessionId: string; expiresAt: string }>("/api/session", { method: "POST" });
}

export function toQuizAnswers(values: FunnelValues) {
  return {
    focusArea: values.focusArea,
    bodyType: values.bodyType,
    location: values.location,
    duration: values.duration,
    diet: values.diet,
    sleep: values.sleep,
  };
}

export function patchProgress(sessionId: string, step: number, data: FunnelValues) {
  return request<{
    data: FunnelValues & { answers?: ReturnType<typeof toQuizAnswers> };
    stepCompleted: number;
    expiresAt: string;
  }>("/api/progress", {
    method: "PATCH",
    body: JSON.stringify({
      sessionId,
      step,
      data: {
        gender: data.gender,
        goal: data.goal,
        age: data.age,
        heightCm: data.heightCm,
        weightKg: data.weightKg,
        targetWeightKg: data.targetWeightKg,
        activityLevel: data.activityLevel,
        answers: toQuizAnswers(data),
      },
    }),
  });
}

export function getProgress(sessionId: string) {
  return request<{
    data: FunnelValues & { answers?: ReturnType<typeof toQuizAnswers> };
    stepCompleted: number;
    expiresAt: string;
  }>(`/api/progress?sessionId=${encodeURIComponent(sessionId)}`);
}

export function submitAssessment(
  sessionId: string,
  values: Pick<
    Required<FunnelValues>,
    "gender" | "goal" | "age" | "heightCm" | "weightKg" | "targetWeightKg" | "activityLevel"
  >,
) {
  return request<{ resultId: string }>("/api/assessment/submit", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      gender: values.gender,
      goal: values.goal,
      age: values.age,
      heightCm: values.heightCm,
      weightKg: values.weightKg,
      targetWeightKg: values.targetWeightKg,
      activityLevel: values.activityLevel,
    }),
  });
}

export type PublicResult = {
  bmi: number;
  recommendedCalories: number;
};

export type MemberResult = PublicResult & {
  targetDate: string | null;
  algorithmVersion: string;
  weightProjection: Array<{ week: number; date: string; weightKg: number }>;
};

export function getResult(sessionId: string) {
  return request<PublicResult | MemberResult>(
    `/api/result?sessionId=${encodeURIComponent(sessionId)}`,
  );
}

export function isMemberResult(result: PublicResult | MemberResult): result is MemberResult {
  return "weightProjection" in result;
}

export function payPlan(sessionId: string, planType: "monthly" | "yearly") {
  const idempotencyKey = crypto.randomUUID();
  return request<{
    code: number;
    message: string;
    data: {
      paymentRef: string;
      paymentStatus: "pending" | "success" | "failed";
      subscriptionId: string;
      subscriptionStatus: "free" | "active";
      currentPeriodEnd: string | null;
    };
    requestId: string;
  }>("/api/pay", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ sessionId, planType }),
  }).then(async (order) => {
    if (order.data.paymentStatus === "success") {
      return order;
    }
    const signature = await signPayCallback(order.data.paymentRef, "success");
    return request<{
      code: number;
      message: string;
      data: {
        paymentRef: string;
        paymentStatus: "pending" | "success" | "failed";
        subscriptionId: string;
        subscriptionStatus: "free" | "active";
        currentPeriodEnd: string | null;
      };
      requestId: string;
    }>("/api/pay/callback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Pay-Signature": signature,
      },
      body: JSON.stringify({ paymentRef: order.data.paymentRef, status: "success" }),
    });
  });
}

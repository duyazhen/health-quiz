import { prisma, withCleanDb } from "@health-quiz/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getHealth } from "../health/route";
import { POST as payCallback } from "../pay/callback/route";
import { POST as pay } from "../pay/route";
import { GET as getProgress, PATCH as patchProgress } from "../progress/route";
import { GET as getResult } from "../result/route";
import { POST as createSession } from "../session/route";
import { POST as submitAssessment } from "../assessment/submit/route";
import { signPayCallback } from "../../../lib/pay";
import { resetRateLimit } from "../../../lib/rate-limit";

const SAMPLE = {
  gender: "male" as const,
  goal: "lose_weight",
  age: 30,
  heightCm: 175,
  weightKg: 70,
  targetWeightKg: 65,
  activityLevel: "moderate" as const,
};

function uuid() {
  return crypto.randomUUID();
}

async function read(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function jsonRequest(url: string, method: string, body?: unknown, headers?: HeadersInit): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function newSession(): Promise<string> {
  const { status, body } = await read(await createSession(jsonRequest("http://localhost/api/session", "POST")));
  expect(status).toBe(201);
  expect(typeof body.sessionId).toBe("string");
  return body.sessionId as string;
}

type PayData = {
  paymentRef: string;
  paymentStatus: string;
  subscriptionId: string;
  subscriptionStatus: string;
};

async function createPayOrder(sessionId: string, planType: "monthly" | "yearly" = "monthly", key = uuid()) {
  return read(
    await pay(
      jsonRequest(
        "http://localhost/api/pay",
        "POST",
        { sessionId, planType },
        { "Idempotency-Key": key },
      ),
    ),
  );
}

async function confirmPay(paymentRef: string, status: "success" | "failed" = "success", signature?: string) {
  return read(
    await payCallback(
      jsonRequest(
        "http://localhost/api/pay/callback",
        "POST",
        { paymentRef, status },
        { "X-Pay-Signature": signature ?? signPayCallback(paymentRef, status) },
      ),
    ),
  );
}

async function checkout(sessionId: string, planType: "monthly" | "yearly" = "monthly") {
  const order = await createPayOrder(sessionId, planType);
  expect([200, 201]).toContain(order.status);
  const data = order.body.data as PayData;
  const confirmed = await confirmPay(data.paymentRef, "success");
  expect(confirmed.status).toBe(200);
  return confirmed;
}

describe("API integration", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  afterEach(() => {
    resetRateLimit();
  });

  it("GET /api/health only returns { status: ok }", async () => {
    await withCleanDb(async () => {
      const { status, body } = await read(await getHealth(new Request("http://localhost/api/health")));
      expect(status).toBe(200);
      expect(body).toEqual({ status: "ok" });
    });
  });

  it("POST /api/session creates a session", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      const user = await prisma.user.findUnique({ where: { sessionId } });
      expect(user).not.toBeNull();
      expect(user!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  it("PATCH + GET /api/progress persist and recover step data", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      const patched = await read(
        await patchProgress(
          jsonRequest("http://localhost/api/progress", "PATCH", {
            sessionId,
            step: 2,
            data: { gender: "male", age: 30 },
          }),
        ),
      );
      expect(patched.status).toBe(200);
      expect(patched.body.stepCompleted).toBe(2);

      const loaded = await read(
        await getProgress(new Request(`http://localhost/api/progress?sessionId=${sessionId}`)),
      );
      expect(loaded.status).toBe(200);
      expect(loaded.body.stepCompleted).toBe(2);
      expect((loaded.body.data as { gender: string }).gender).toBe("male");
      expect(typeof loaded.body.expiresAt).toBe("string");
    });
  });

  it("PATCH /api/progress stores extensible answers JSON and restores them", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      await patchProgress(
        jsonRequest("http://localhost/api/progress", "PATCH", {
          sessionId,
          step: 8,
          data: {
            gender: "female",
            answers: { focusArea: "belly", location: "home", duration: "20" },
          },
        }),
      );
      const loaded = await read(
        await getProgress(new Request(`http://localhost/api/progress?sessionId=${sessionId}`)),
      );
      expect(loaded.status).toBe(200);
      expect((loaded.body.data as { answers: { focusArea: string } }).answers.focusArea).toBe("belly");
      expect((loaded.body.data as { answers: { location: string } }).answers.location).toBe("home");
    });
  });

  it("PATCH /api/progress is idempotent for the same payload", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      const payload = { sessionId, step: 1, data: { gender: "female" as const } };
      await patchProgress(jsonRequest("http://localhost/api/progress", "PATCH", payload));
      const first = await prisma.assessmentProgress.findFirst({
        where: { user: { sessionId } },
      });
      expect(first).not.toBeNull();

      await patchProgress(jsonRequest("http://localhost/api/progress", "PATCH", payload));
      const second = await prisma.assessmentProgress.findFirst({
        where: { user: { sessionId } },
      });
      expect(second!.id).toBe(first!.id);
      expect(second!.updatedAt.getTime()).toBe(first!.updatedAt.getTime());
    });
  });

  it("GET /api/progress returns 410 when the session is expired", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      await prisma.user.update({
        where: { sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const { status, body } = await read(
        await getProgress(new Request(`http://localhost/api/progress?sessionId=${sessionId}`)),
      );
      expect(status).toBe(410);
      expect(body.code).toBe(410);
      expect(typeof body.requestId).toBe("string");
    });
  });

  it("POST /api/assessment/submit writes healthResults with algorithmVersion", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      const { status, body } = await read(
        await submitAssessment(
          jsonRequest("http://localhost/api/assessment/submit", "POST", { sessionId, ...SAMPLE }),
        ),
      );
      expect(status).toBe(201);
      expect(typeof body.resultId).toBe("string");
      const stored = await prisma.healthResult.findUnique({ where: { id: body.resultId as string } });
      expect(stored?.algorithmVersion).toBe("v1.0-Mifflin-StJeor");
    });
  });

  it("GET /api/result DTO whitelist: unpaid fields ⊂ paid fields, no projection when unpaid", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      await submitAssessment(
        jsonRequest("http://localhost/api/assessment/submit", "POST", { sessionId, ...SAMPLE }),
      );

      const unpaid = await read(await getResult(new Request(`http://localhost/api/result?sessionId=${sessionId}`)));
      expect(unpaid.status).toBe(200);
      expect(unpaid.body).not.toHaveProperty("weightProjection");
      expect(unpaid.body).not.toHaveProperty("targetDate");
      expect(unpaid.body).toHaveProperty("bmi");
      expect(unpaid.body).toHaveProperty("recommendedCalories");

      const paid = await checkout(sessionId, "monthly");
      expect(paid.status).toBe(200);
      expect(paid.body.code).toBe(0);

      const member = await read(await getResult(new Request(`http://localhost/api/result?sessionId=${sessionId}`)));
      expect(member.status).toBe(200);
      expect(member.body).toHaveProperty("weightProjection");
      expect(member.body).toHaveProperty("targetDate");
      expect(member.body).toHaveProperty("algorithmVersion");

      const unpaidKeys = Object.keys(unpaid.body);
      const paidKeys = Object.keys(member.body);
      expect(unpaidKeys.every((key) => paidKeys.includes(key))).toBe(true);
      expect(unpaidKeys.length).toBeLessThan(paidKeys.length);
    });
  });

  it("POST /api/pay creates a pending order; callback activates the subscription", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      await submitAssessment(
        jsonRequest("http://localhost/api/assessment/submit", "POST", { sessionId, ...SAMPLE }),
      );

      const ordered = await createPayOrder(sessionId, "monthly");
      expect([200, 201]).toContain(ordered.status);
      const orderData = ordered.body.data as PayData;
      expect(orderData.paymentStatus).toBe("pending");
      expect(orderData.subscriptionStatus).toBe("free");

      const unpaid = await read(await getResult(new Request(`http://localhost/api/result?sessionId=${sessionId}`)));
      expect(unpaid.body).not.toHaveProperty("weightProjection");

      const confirmed = await confirmPay(orderData.paymentRef, "success");
      expect(confirmed.status).toBe(200);
      const confirmedData = confirmed.body.data as PayData;
      expect(confirmedData.paymentStatus).toBe("success");
      expect(confirmedData.subscriptionStatus).toBe("active");
      expect(confirmedData.currentPeriodEnd).toBeTruthy();

      const replay = await confirmPay(orderData.paymentRef, "success");
      expect(replay.status).toBe(200);
      expect(replay.body.data).toEqual(confirmed.body.data);
      expect(
        await prisma.payment.count({
          where: { paymentRef: orderData.paymentRef, status: "success" },
        }),
      ).toBe(1);
    });
  });

  it("POST /api/pay/callback with failed status does not unlock member fields", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      await submitAssessment(
        jsonRequest("http://localhost/api/assessment/submit", "POST", { sessionId, ...SAMPLE }),
      );
      const ordered = await createPayOrder(sessionId, "yearly");
      const orderData = ordered.body.data as PayData;
      const failed = await confirmPay(orderData.paymentRef, "failed");
      expect(failed.status).toBe(200);
      expect((failed.body.data as PayData).subscriptionStatus).toBe("free");

      const result = await read(await getResult(new Request(`http://localhost/api/result?sessionId=${sessionId}`)));
      expect(result.body).not.toHaveProperty("weightProjection");
    });
  });

  it("POST /api/pay/callback rejects a bad signature", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      const ordered = await createPayOrder(sessionId, "monthly");
      const paymentRef = (ordered.body.data as PayData).paymentRef;
      const { status, body } = await confirmPay(paymentRef, "success", "deadbeef");
      expect(status).toBe(401);
      expect(body.code).toBe(401);
    });
  });

  it("POST /api/pay replays the same idempotencyKey without a second payment", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      await submitAssessment(
        jsonRequest("http://localhost/api/assessment/submit", "POST", { sessionId, ...SAMPLE }),
      );
      const key = uuid();
      const first = await createPayOrder(sessionId, "yearly", key);
      const second = await createPayOrder(sessionId, "yearly", key);

      expect([200, 201]).toContain(first.status);
      expect(second.status).toBe(200);
      expect(first.body.data).toEqual(second.body.data);
      expect(await prisma.payment.count({ where: { idempotencyKey: key } })).toBe(1);

      const paymentRef = (first.body.data as PayData).paymentRef;
      await confirmPay(paymentRef, "success");
      await confirmPay(paymentRef, "success");

      const user = await prisma.user.findUnique({ where: { sessionId } });
      expect(user).not.toBeNull();
      expect(
        await prisma.payment.count({
          where: { status: "success", subscription: { userId: user!.id } },
        }),
      ).toBe(1);
    });
  });

  it("POST /api/pay returns 429 after 10 requests from the same IP", async () => {
    await withCleanDb(async () => {
      const headers = { "x-forwarded-for": "203.0.113.88" };
      let last = { status: 0, body: {} as Record<string, unknown> };
      for (let i = 0; i < 11; i += 1) {
        last = await read(
          await pay(jsonRequest("http://localhost/api/pay", "POST", {}, { ...headers, "Idempotency-Key": uuid() })),
        );
      }
      expect(last.status).toBe(429);
      expect(last.body.code).toBe(429);
    });
  });

  it("rejects illegal numeric input with 400 details", async () => {
    await withCleanDb(async () => {
      const sessionId = await newSession();
      const { status, body } = await read(
        await submitAssessment(
          jsonRequest("http://localhost/api/assessment/submit", "POST", {
            sessionId,
            ...SAMPLE,
            heightCm: -1,
            weightKg: 9999,
          }),
        ),
      );
      expect(status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.details).toBeTruthy();
    });
  });
});

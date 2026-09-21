import { resetRateLimit } from "../../../lib/rate-limit";

if (!process.env.DATABASE_URL?.includes("health_quiz_test")) {
  throw new Error(`Tests must use health_quiz_test, got ${process.env.DATABASE_URL ?? "(empty)"}`);
}

resetRateLimit();

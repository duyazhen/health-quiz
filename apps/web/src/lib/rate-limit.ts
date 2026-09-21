type Bucket = {
  tokens: number;
  lastRefill: number;
};

const buckets = new Map<string, Bucket>();

const CAPACITY = 10;
const WINDOW_MS = 60_000;
const REFILL_PER_MS = CAPACITY / WINDOW_MS;

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Token bucket: 10 tokens per IP per minute. Returns false when exhausted. */
export function consumeRateLimit(ip: string, now = Date.now()): boolean {
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefill: now };
    buckets.set(ip, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_MS);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    return false;
  }

  bucket.tokens -= 1;
  return true;
}

export function resetRateLimit(): void {
  buckets.clear();
}

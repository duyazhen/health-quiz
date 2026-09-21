const PAY_WEBHOOK_SECRET =
  process.env.NEXT_PUBLIC_PAY_WEBHOOK_SECRET ?? process.env.PAY_WEBHOOK_SECRET ?? "dev-mock-pay-secret";

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signPayCallback(paymentRef: string, status: "success" | "failed"): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PAY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${paymentRef}:${status}`),
  );
  return toHex(signature);
}

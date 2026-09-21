import { NextResponse } from "next/server";
import { withApi } from "@/lib/errors";

export const GET = withApi("/api/health", async () => {
  return NextResponse.json({ status: "ok" });
});

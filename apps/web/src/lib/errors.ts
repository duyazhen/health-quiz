import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createLogger, getRequestId, type Logger } from "./logger";

export type ErrorCode = 400 | 401 | 404 | 409 | 410 | 429 | 500;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export type ErrorResponse = {
  code: number;
  message: string;
  requestId: string;
  details?: unknown;
};

export function jsonError(error: unknown, requestId: string): NextResponse<ErrorResponse> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
        requestId,
        details: error.details,
      },
      { status: error.code },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        code: 400,
        message: "Invalid request",
        requestId,
        details: error.flatten(),
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  console.error(JSON.stringify({ level: "error", requestId, msg: message }));
  return NextResponse.json(
    { code: 500, message: "Internal server error", requestId },
    { status: 500 },
  );
}

export async function parseJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
}

export function withApi(
  route: string,
  handler: (
    req: Request,
    ctx: { requestId: string; logger: Logger },
  ) => Promise<NextResponse>,
): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    const requestId = getRequestId(req);
    const logger = createLogger(requestId, route);
    logger.info("incoming", { method: req.method });
    try {
      return await handler(req, { requestId, logger });
    } catch (error) {
      logger.error("failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonError(error, requestId);
    }
  };
}

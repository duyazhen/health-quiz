export type Logger = {
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, extra?: Record<string, unknown>) => void;
};

function emit(
  level: "info" | "warn" | "error",
  requestId: string,
  route: string,
  msg: string,
  extra?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      level,
      requestId,
      route,
      msg,
      ts: new Date().toISOString(),
      ...extra,
    }),
  );
}

export function createLogger(requestId: string, route: string): Logger {
  return {
    info: (msg, extra) => emit("info", requestId, route, msg, extra),
    warn: (msg, extra) => emit("warn", requestId, route, msg, extra),
    error: (msg, extra) => emit("error", requestId, route, msg, extra),
  };
}

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") ?? crypto.randomUUID();
}

import { Prisma, PrismaClient } from "@prisma/client";

const ROLLBACK_MESSAGE = "TEST_ROLLBACK";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaTx: Prisma.TransactionClient | undefined;
};

export const prismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}

export const prisma = new Proxy(prismaClient, {
  get(_target, prop) {
    if (prop === "$transaction") {
      return (arg: unknown, options?: Parameters<PrismaClient["$transaction"]>[1]) => {
        if (globalForPrisma.prismaTx && typeof arg === "function") {
          return (arg as (tx: Prisma.TransactionClient) => unknown)(
            globalForPrisma.prismaTx,
          );
        }
        const method = prismaClient.$transaction.bind(prismaClient);
        return method(arg as never, options);
      };
    }

    const client = globalForPrisma.prismaTx ?? prismaClient;
    const value = Reflect.get(client, prop, client);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
}) as PrismaClient;

export async function withCleanDb<T>(fn: () => Promise<T>): Promise<T> {
  if (globalForPrisma.prismaTx) {
    return fn();
  }

  let result: T | undefined;
  try {
    await prismaClient.$transaction(
      async (tx) => {
        globalForPrisma.prismaTx = tx;
        try {
          result = await fn();
        } finally {
          globalForPrisma.prismaTx = undefined;
        }
        throw new Error(ROLLBACK_MESSAGE);
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === ROLLBACK_MESSAGE) {
      return result as T;
    }
    throw error;
  }

  return result as T;
}

export { Prisma };

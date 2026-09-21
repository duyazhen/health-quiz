# 健康测评全栈挑战

Next.js 15 + Prisma + MySQL 的健康测评 funnel 骨架（pnpm workspace）。

## 本地启动

1. 复制 `.env.example` 为 `.env`，填入 `DATABASE_URL`（MySQL 8）
2. `pnpm install`
3. `pnpm --filter @health-quiz/web exec prisma generate`
4. `pnpm --filter @health-quiz/web exec prisma migrate dev`（有库之后）
5. `pnpm dev` → http://localhost:3000

## 测试 / 校验

- `pnpm test`
- `pnpm exec prisma format && pnpm exec prisma validate`

## 仓库结构

- `apps/web`：页面（funnel / result / subscribe）与 7 个 API 占位
- `packages/algorithm`：BMI / TDEE / 达标日纯函数（下阶段实现）
- `packages/db`：Prisma 单例 + 测试 helper
- `prisma/`：5 张表 schema

部署 URL、已支付 sessionId、cURL 与 CI badge 将在后续阶段补齐。

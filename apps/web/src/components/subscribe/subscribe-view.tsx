"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteShell } from "@/components/site-shell";
import { toast } from "@/hooks/use-toast";
import { payPlan } from "@/lib/client/api";
import { loadDraft } from "@/lib/client/storage";

const PLANS = [
  {
    type: "monthly" as const,
    title: "月度方案",
    price: "¥9.9",
    period: "/ 月",
    features: ["完整预测曲线", "达标日期", "随时取消"],
  },
  {
    type: "yearly" as const,
    title: "年度方案",
    price: "¥99",
    period: "/ 年",
    features: ["含月度全部权益", "相当于 ¥8.25 / 月", "优先解锁更新"],
    highlight: true,
  },
];

export function SubscribeView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId") ?? loadDraft()?.sessionId ?? "";
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);

  async function onPay(planType: "monthly" | "yearly") {
    if (!sessionId) {
      toast({ title: "请先完成测评 Funnel", variant: "destructive" });
      router.push("/");
      return;
    }
    setBusy(planType);
    try {
      await payPlan(sessionId, planType);
      toast({ title: "订阅成功" });
      router.push(`/result?sessionId=${encodeURIComponent(sessionId)}`);
    } catch (error) {
      toast({
        title: "支付失败",
        description: error instanceof Error ? error.message : "请重试",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <SiteShell active="subscribe">
      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">subscribe</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">解锁达标预测</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          训练和饮食建议已经免费给出。订阅只打开体重曲线与达标日期。模拟支付，不会真实扣款。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => (
          <Card key={plan.type} className={plan.highlight ? "border-primary" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{plan.title}</CardTitle>
                {plan.highlight ? <Badge>推荐</Badge> : null}
              </div>
              <CardDescription>
                <span className="text-3xl font-semibold text-foreground">{plan.price}</span>
                <span>{plan.period}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                className="h-11 w-full"
                variant={plan.highlight ? "default" : "outline"}
                disabled={busy != null}
                onClick={() => void onPay(plan.type)}
              >
                {busy === plan.type ? "处理中…" : "立即订阅"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <Button variant="outline" asChild>
          <Link href={sessionId ? `/result?sessionId=${encodeURIComponent(sessionId)}` : "/"}>
            返回结果
          </Link>
        </Button>
      </div>
    </SiteShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Unlock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SiteShell } from "@/components/site-shell";
import { toast } from "@/hooks/use-toast";
import { getProgress, getResult, isMemberResult, payPlan, type MemberResult, type PublicResult } from "@/lib/client/api";
import { buildInsights } from "@/lib/client/insights";
import { loadDraft, type FunnelValues } from "@/lib/client/storage";

export function ResultView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId") ?? loadDraft()?.sessionId ?? "";
  const [result, setResult] = useState<PublicResult | MemberResult | null>(null);
  const [answers, setAnswers] = useState<FunnelValues | undefined>(loadDraft()?.values);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [plan, setPlan] = useState<"monthly" | "yearly" | null>(null);
  const insights = result ? buildInsights(answers, result) : null;

  async function refresh() {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    const data = await getResult(sessionId);
    setResult(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await refresh();
        if (sessionId) {
          try {
            const progress = await getProgress(sessionId);
            const { answers: extra, ...core } = progress.data;
            setAnswers({ ...core, ...extra });
          } catch {
            // 结果页仍可用 localStorage 草稿
          }
        }
      } catch (error) {
        toast({
          title: "无法加载结果",
          description: error instanceof Error ? error.message : "请先完成测评",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const member = result && isMemberResult(result) ? result : null;

  async function confirmPay() {
    if (!sessionId || !plan) return;
    setPaying(true);
    try {
      await payPlan(sessionId, plan);
      toast({ title: "解锁成功", description: "完整方案已生成" });
      setPlan(null);
      await refresh();
    } catch (error) {
      toast({
        title: "支付未完成",
        description: error instanceof Error ? error.message : "请重试",
        variant: "destructive",
      });
    } finally {
      setPaying(false);
    }
  }

  if (!sessionId) {
    return (
      <SiteShell active="result">
        <EmptyState
          title="还没有测评会话"
          action={() => router.push("/")}
          actionLabel="开始测评 Funnel"
        />
      </SiteShell>
    );
  }

  if (loading) {
    return (
      <SiteShell active="result">
        <p className="text-sm text-muted-foreground">正在生成结果…</p>
      </SiteShell>
    );
  }

  if (!result || !insights) {
    return (
      <SiteShell active="result">
        <EmptyState title="请先完成测评" action={() => router.push("/")} actionLabel="返回 Funnel" />
      </SiteShell>
    );
  }

  const bmiPct = Math.min(100, Math.max(0, ((result.bmi - 15) / 20) * 100));

  return (
    <SiteShell active="result">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">your plan</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">{insights.headline}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{insights.subhead}</p>
        </div>
        <p className="text-xs text-muted-foreground">基于 Mifflin-St Jeor 公式即时计算，不是营销估算。</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>BMI {insights.bmi.value}</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                {insights.bmi.label}
                <Badge variant="secondary">{insights.bmi.value}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
                <div className="absolute inset-y-0 left-0 w-1/4 bg-sky-200" />
                <div className="absolute inset-y-0 left-1/4 w-[27.5%] bg-emerald-200" />
                <div className="absolute inset-y-0 left-[52.5%] w-1/5 bg-amber-200" />
                <div className="absolute inset-y-0 left-[72.5%] right-0 bg-rose-200" />
                <span
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
                  style={{ left: `${bmiPct}%` }}
                />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{insights.bmi.detail}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>每日热量</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {insights.calories.target}
                <span className="ml-1 text-base font-normal text-muted-foreground">kcal</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">{insights.calories.note}</p>
              <div className="grid grid-cols-3 gap-2">
                {insights.calories.meals.map((meal) => (
                  <div key={meal.name} className="rounded-md bg-secondary/70 px-2 py-3 text-center">
                    <p className="text-xs text-muted-foreground">{meal.name}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{meal.kcal}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {[insights.workouts, insights.diet, insights.sleep].map((block) => (
            <Card key={block.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{block.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {block.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">本周安排</CardTitle>
              <CardDescription>先按这个节奏跑 7 天，再决定加量</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {insights.week.map((row) => (
                <div key={row.day} className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2.5">
                  <span className="text-sm font-medium">{row.day}</span>
                  <span className="text-sm text-muted-foreground">{row.focus}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          {member ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Unlock className="h-4 w-4" />
                  达标曲线
                </CardTitle>
                <CardDescription>
                  {member.targetDate ? `预计 ${member.targetDate} 到达目标体重` : "当前为维持 / 增肌路径"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProjectionChart points={member.weightProjection} />
                <p className="mt-2 text-xs text-muted-foreground">
                  算法 {member.algorithmVersion} · 按每周 0.5kg 线性估算
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4" />
                  查看达标日期与曲线
                </CardTitle>
                <CardDescription>左侧训练和饮食已经按你的答案写好。付费只解锁预测曲线。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Button size="lg" className="h-11" onClick={() => setPlan("monthly")}>
                  ¥9.9 / 月
                </Button>
                <Button size="lg" variant="outline" className="h-11" onClick={() => setPlan("yearly")}>
                  ¥99 / 年 · 更划算
                </Button>
                <Button size="lg" variant="ghost" asChild>
                  <Link href={`/subscribe?sessionId=${encodeURIComponent(sessionId)}`}>比较套餐</Link>
                </Button>
              </CardContent>
            </Card>
          )}
          <Button variant="outline" className="w-full" asChild>
            <Link href="/">返回测评 Funnel</Link>
          </Button>
        </aside>
      </div>

      <Dialog open={plan != null} onOpenChange={(open) => !open && setPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认解锁</DialogTitle>
            <DialogDescription>
              {plan === "yearly" ? "¥99 / 年" : "¥9.9 / 月"} · 模拟支付，不会产生真实扣款
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlan(null)}>
              取消
            </Button>
            <Button disabled={paying} onClick={() => void confirmPay()}>
              {paying ? "处理中…" : "立即解锁"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SiteShell>
  );
}

function EmptyState({
  title,
  action,
  actionLabel,
}: {
  title: string;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-start justify-center gap-4">
      <p className="text-muted-foreground">{title}</p>
      <Button onClick={action}>{actionLabel}</Button>
    </div>
  );
}

function ProjectionChart({
  points,
}: {
  points: MemberResult["weightProjection"];
}) {
  const chart = useMemo(() => {
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return null;

    const width = 320;
    const height = 176;
    const padL = 36;
    const padR = 12;
    const padT = 18;
    const padB = 28;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const weights = points.map((point) => point.weightKg);
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const dataSpan = Math.max(maxW - minW, 0.5);
    const ySpan = Math.max(8, dataSpan + 2);
    const yMin = minW - 1;

    const lastIndex = Math.max(points.length - 1, 1);
    const usedW = Math.min(plotW, Math.max(48, lastIndex * 14));

    const xOf = (index: number) => padL + (index / lastIndex) * usedW;
    const yOf = (weight: number) => padT + (1 - (weight - yMin) / ySpan) * plotH;

    const path = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${xOf(index).toFixed(1)},${yOf(point.weightKg).toFixed(1)}`)
      .join(" ");

    const yTicks = [yMin + ySpan, yMin + ySpan / 2, yMin].map((value) => Math.round(value * 10) / 10);

    return {
      path,
      yTicks,
      first,
      last,
      yOf,
      xOf,
      padL,
      plotW,
      width,
      height,
      delta: Math.round((last.weightKg - first.weightKg) * 10) / 10,
      weeks: last.week,
      lastIndex,
    };
  }, [points]);

  if (points.length === 0 || !chart) {
    return <p className="text-sm text-muted-foreground">暂无曲线数据</p>;
  }

  if (points.length === 1) {
    return (
      <p className="text-sm text-muted-foreground">
        当前体重 {chart.first.weightKg}kg，目标与现在相同或为增肌，不生成下降曲线
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-semibold">{chart.first.weightKg}kg</span>
        <span className="text-muted-foreground"> → </span>
        <span className="font-semibold">{chart.last.weightKg}kg</span>
        <span className="text-muted-foreground">
          {" "}
          · {chart.weeks} 周 · {chart.delta > 0 ? "+" : ""}
          {chart.delta}kg
        </span>
      </p>
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-44 w-full text-primary"
        role="img"
        aria-label="体重预测曲线"
      >
        {chart.yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={chart.padL}
              x2={chart.padL + chart.plotW}
              y1={chart.yOf(tick)}
              y2={chart.yOf(tick)}
              className="stroke-border"
              strokeWidth="1"
            />
            <text
              x={chart.padL - 6}
              y={chart.yOf(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="9"
            >
              {tick}
            </text>
          </g>
        ))}
        <path d={chart.path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={chart.xOf(0)} cy={chart.yOf(chart.first.weightKg)} r="3.5" className="fill-primary" />
        <circle cx={chart.xOf(chart.lastIndex)} cy={chart.yOf(chart.last.weightKg)} r="3.5" className="fill-primary" />
        <text
          x={chart.xOf(0)}
          y={chart.yOf(chart.first.weightKg) - 8}
          textAnchor="start"
          className="fill-foreground"
          fontSize="10"
          fontWeight="600"
        >
          {chart.first.weightKg}kg
        </text>
        <text
          x={chart.xOf(chart.lastIndex)}
          y={chart.yOf(chart.last.weightKg) - 8}
          textAnchor="end"
          className="fill-foreground"
          fontSize="10"
          fontWeight="600"
        >
          {chart.last.weightKg}kg
        </text>
        <text x={chart.xOf(0)} y={chart.height - 8} textAnchor="start" className="fill-muted-foreground" fontSize="9">
          {chart.first.date.slice(5)}
        </text>
        <text
          x={chart.xOf(chart.lastIndex)}
          y={chart.height - 8}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize="9"
        >
          {chart.last.date.slice(5)}
        </text>
      </svg>
    </div>
  );
}

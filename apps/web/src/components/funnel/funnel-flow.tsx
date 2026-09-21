"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Armchair,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  HeartPulse,
  Home,
  Leaf,
  Moon,
  Sparkles,
  Target,
  Trees,
  Utensils,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { SiteShell } from "@/components/site-shell";
import { toast } from "@/hooks/use-toast";
import { createSession, getProgress, patchProgress, submitAssessment } from "@/lib/client/api";
import { loadDraft, saveDraft, type FunnelValues } from "@/lib/client/storage";
import { cn } from "@/lib/utils";
import { activityLevelSchema, genderSchema } from "@/lib/zod-schemas";

const funnelSchema = z.object({
  gender: genderSchema,
  goal: z.enum(["lose_weight", "keep_fit", "gain_muscle"]),
  age: z.number().int().min(10).max(100),
  heightCm: z.number().min(50).max(250),
  weightKg: z.number().min(20).max(400),
  targetWeightKg: z.number().min(20).max(400),
  activityLevel: activityLevelSchema,
  focusArea: z.enum(["belly", "legs", "arms", "full"]),
  bodyType: z.enum(["slim", "average", "curvy"]),
  location: z.enum(["home", "gym", "outdoor"]),
  duration: z.enum(["10", "20", "30", "45"]),
  diet: z.enum(["balanced", "vegetarian", "high_protein"]),
  sleep: z.enum(["lt6", "6to8", "gt8"]),
});

type FunnelForm = z.infer<typeof funnelSchema>;

const STEP_FIELDS: Array<(keyof FunnelForm)[]> = [
  ["gender"],
  ["age"],
  ["goal"],
  ["focusArea"],
  ["bodyType"],
  ["heightCm"],
  ["weightKg", "targetWeightKg"],
  ["activityLevel"],
  ["location"],
  ["duration"],
  ["diet"],
  ["sleep"],
];

const LAST_STEP = STEP_FIELDS.length - 1;

const STEP_COPY = [
  { kicker: "基础", hint: "性别会进入 Mifflin-St Jeor 公式，用来估算基础代谢。" },
  { kicker: "基础", hint: "年龄影响代谢。先选区间，再用滑杆精确到岁。" },
  { kicker: "目标", hint: "减脂、维持或增肌，会改变热量缺口和训练安排。" },
  { kicker: "训练", hint: "部位只决定组数倾斜，不会忽略全身平衡。" },
  { kicker: "训练", hint: "体型用来匹配强度，不是评分。" },
  { kicker: "身体数据", hint: "身高用于计算 BMI 和体表面积相关估算。" },
  { kicker: "身体数据", hint: "当前体重与目标体重决定是否生成下降曲线。" },
  { kicker: "习惯", hint: "运动频率对应 TDEE 活动系数。" },
  { kicker: "习惯", hint: "场地决定动作库：居家、器械还是户外。" },
  { kicker: "习惯", hint: "每次时长宁短勿断，比一次练垮更容易坚持。" },
  { kicker: "恢复", hint: "饮食偏好只影响三餐分配，不强制某种节食法。" },
  { kicker: "恢复", hint: "睡眠不足时，加练往往适得其反。" },
] as const;

const DEFAULTS: FunnelForm = {
  gender: "female",
  goal: "lose_weight",
  age: 28,
  heightCm: 165,
  weightKg: 62,
  targetWeightKg: 55,
  activityLevel: "light",
  focusArea: "belly",
  bodyType: "average",
  location: "home",
  duration: "20",
  diet: "balanced",
  sleep: "6to8",
};

const AGE_BANDS = [
  { label: "18–29", value: 24, min: 18, max: 29, hint: "代谢较快，适合塑形" },
  { label: "30–39", value: 34, min: 30, max: 39, hint: "兼顾力量与减脂" },
  { label: "40–49", value: 44, min: 40, max: 49, hint: "保护关节更重要" },
  { label: "50+", value: 55, min: 50, max: 80, hint: "温和进阶更安全" },
] as const;

function toFormValues(partial: FunnelValues): FunnelForm {
  const goal =
    partial.goal === "lose_weight" || partial.goal === "keep_fit" || partial.goal === "gain_muscle"
      ? partial.goal
      : DEFAULTS.goal;
  return {
    ...DEFAULTS,
    ...partial,
    goal,
    focusArea: partial.focusArea ?? DEFAULTS.focusArea,
    bodyType: partial.bodyType ?? DEFAULTS.bodyType,
    location: partial.location ?? DEFAULTS.location,
    duration: partial.duration ?? DEFAULTS.duration,
    diet: partial.diet ?? DEFAULTS.diet,
    sleep: partial.sleep ?? DEFAULTS.sleep,
  };
}

export function FunnelFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calcTick, setCalcTick] = useState(0);
  const advancing = useRef(false);

  const form = useForm<FunnelForm>({
    resolver: zodResolver(funnelSchema),
    defaultValues: DEFAULTS,
    mode: "onChange",
  });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const draft = loadDraft();
      let nextSession = draft?.sessionId ?? null;
      try {
        if (!nextSession) {
          const created = await createSession();
          nextSession = created.sessionId;
        } else {
          try {
            const remote = await getProgress(nextSession);
            if (!cancelled && remote.data) {
              const { answers, ...core } = remote.data;
              form.reset(toFormValues({ ...draft?.values, ...core, ...answers }));
            }
          } catch {
            const created = await createSession();
            nextSession = created.sessionId;
          }
        }
      } catch {
        toast({ title: "无法创建测评会话", variant: "destructive" });
      }

      if (cancelled || !nextSession) return;
      setSessionId(nextSession);
      if (draft?.values) {
        form.reset(toFormValues(draft.values));
        setStep(Math.min(Math.max(draft.step, 0), LAST_STEP));
      }
      saveDraft({
        sessionId: nextSession,
        step: Math.min(draft?.step ?? 0, LAST_STEP),
        values: { ...DEFAULTS, ...draft?.values },
      });
      setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const values = form.watch();

  useEffect(() => {
    if (!sessionId || !ready) return;
    saveDraft({ sessionId, step, values });
  }, [sessionId, step, values, ready]);

  const progressPct = useMemo(() => ((step + 1) / STEP_FIELDS.length) * 100, [step]);

  async function persist(nextStep: number) {
    if (!sessionId) return;
    await patchProgress(sessionId, nextStep, form.getValues());
  }

  async function goNext() {
    if (advancing.current || busy || !ready) return;
    const fields = STEP_FIELDS[step];
    if (!fields) return;
    const ok = await form.trigger(step === LAST_STEP ? undefined : fields);
    if (!ok) return;

    advancing.current = true;
    setBusy(true);
    try {
      if (step === LAST_STEP) {
        if (!sessionId) return;
        setCalculating(true);
        setCalcTick(0);
        const started = Date.now();
        const tick = window.setInterval(() => {
          setCalcTick((n) => Math.min(n + 1, 4));
        }, 380);
        await persist(step + 1);
        const data = form.getValues();
        await submitAssessment(sessionId, {
          gender: data.gender,
          goal: data.goal,
          age: data.age,
          heightCm: data.heightCm,
          weightKg: data.weightKg,
          targetWeightKg: data.targetWeightKg,
          activityLevel: data.activityLevel,
        });
        saveDraft({ sessionId, step: LAST_STEP, values: data });
        const wait = Math.max(0, 1600 - (Date.now() - started));
        await new Promise((resolve) => window.setTimeout(resolve, wait));
        window.clearInterval(tick);
        setCalcTick(4);
        router.push(`/result?sessionId=${encodeURIComponent(sessionId)}`);
        return;
      }
      await persist(step + 1);
      setStep((current) => current + 1);
    } catch (error) {
      setCalculating(false);
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "请重试",
        variant: "destructive",
      });
    } finally {
      advancing.current = false;
      setBusy(false);
    }
  }

  function pickAndNext<K extends keyof FunnelForm>(name: K, value: FunnelForm[K]) {
    form.setValue(name, value, { shouldValidate: true, shouldDirty: true });
    window.setTimeout(() => {
      void goNext();
    }, 180);
  }

  return (
    <SiteShell active="funnel">
      {calculating ? <CalculatingOverlay tick={calcTick} /> : null}

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-24">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">health funnel</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">为你定制训练方案</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            12 道题，约 2 分钟。已有 12,400+ 人生成专属计划。
          </p>
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{STEP_COPY[step]?.kicker}</span>
              <span className="tabular-nums text-muted-foreground">
                {step + 1} / {STEP_FIELDS.length}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{STEP_COPY[step]?.hint}</p>
        </aside>

        <section className="rounded-xl border bg-card p-6 shadow-sm lg:p-8">
          {!ready ? (
            <p className="text-sm text-muted-foreground">正在准备测评…</p>
          ) : (
            <Form {...form}>
              <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
                {step === 0 ? (
                  <ChoiceStep title="你的性别？" subtitle="用于 Mifflin-St Jeor 代谢估算">
                    <ChoiceCard
                      selected={values.gender === "female"}
                      title="女"
                      desc="按女性公式计算基础代谢"
                      onClick={() => pickAndNext("gender", "female")}
                    />
                    <ChoiceCard
                      selected={values.gender === "male"}
                      title="男"
                      desc="按男性公式计算基础代谢"
                      onClick={() => pickAndNext("gender", "male")}
                    />
                  </ChoiceStep>
                ) : null}

                {step === 1 ? (
                  <div className="space-y-5">
                    <StepHeading title="选择你的年龄段" subtitle="点选区间，再用滑杆精确到岁" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {AGE_BANDS.map((band) => (
                        <ChoiceCard
                          key={band.label}
                          selected={values.age >= band.min && values.age <= band.max}
                          title={band.label}
                          desc={band.hint}
                          onClick={() => form.setValue("age", band.value, { shouldValidate: true })}
                        />
                      ))}
                    </div>
                    <NumberStep control={form.control} name="age" label="精确年龄" unit="岁" min={18} max={70} />
                  </div>
                ) : null}

                {step === 2 ? (
                  <ChoiceStep title="你最想达成的目标？" subtitle="后面的热量和训练会跟着变">
                    <ChoiceCard
                      icon={<Flame className="h-5 w-5" />}
                      selected={values.goal === "lose_weight"}
                      title="减脂塑形"
                      desc="温和缺口，优先掉脂肪"
                      onClick={() => pickAndNext("goal", "lose_weight")}
                    />
                    <ChoiceCard
                      icon={<HeartPulse className="h-5 w-5" />}
                      selected={values.goal === "keep_fit"}
                      title="保持健康"
                      desc="维持体重，改善体成分"
                      onClick={() => pickAndNext("goal", "keep_fit")}
                    />
                    <ChoiceCard
                      icon={<Dumbbell className="h-5 w-5" />}
                      selected={values.goal === "gain_muscle"}
                      title="增肌增重"
                      desc="热量盈余 + 力量训练"
                      onClick={() => pickAndNext("goal", "gain_muscle")}
                    />
                  </ChoiceStep>
                ) : null}

                {step === 3 ? (
                  <ChoiceStep title="最想改善的部位？" subtitle="训练会把组数倾斜到这里">
                    <ChoiceCard selected={values.focusArea === "belly"} title="腰腹" desc="核心稳定、减少囤积感" onClick={() => pickAndNext("focusArea", "belly")} />
                    <ChoiceCard selected={values.focusArea === "legs"} title="臀腿" desc="深蹲、臀桥、下肢力量" onClick={() => pickAndNext("focusArea", "legs")} />
                    <ChoiceCard selected={values.focusArea === "arms"} title="手臂肩背" desc="推拉平衡，线条更干净" onClick={() => pickAndNext("focusArea", "arms")} />
                    <ChoiceCard selected={values.focusArea === "full"} title="全身" desc="推、拉、蹲都练到" onClick={() => pickAndNext("focusArea", "full")} />
                  </ChoiceStep>
                ) : null}

                {step === 4 ? (
                  <ChoiceStep title="目前更接近哪种体型？" subtitle="只用来匹配训练强度，不是评判">
                    <ChoiceCard selected={values.bodyType === "slim"} title="偏瘦" desc="先把力量和蛋白补上" onClick={() => pickAndNext("bodyType", "slim")} />
                    <ChoiceCard selected={values.bodyType === "average"} title="匀称" desc="按目标微调热量即可" onClick={() => pickAndNext("bodyType", "average")} />
                    <ChoiceCard selected={values.bodyType === "curvy"} title="偏丰满" desc="温和缺口 + 抗阻更合适" onClick={() => pickAndNext("bodyType", "curvy")} />
                  </ChoiceStep>
                ) : null}

                {step === 5 ? (
                  <NumberStep control={form.control} name="heightCm" label="你的身高" unit="cm" min={140} max={200} />
                ) : null}

                {step === 6 ? (
                  <div className="grid gap-8 md:grid-cols-2">
                    <NumberStep control={form.control} name="weightKg" label="当前体重" unit="kg" min={40} max={140} />
                    <NumberStep control={form.control} name="targetWeightKg" label="目标体重" unit="kg" min={40} max={140} />
                  </div>
                ) : null}

                {step === 7 ? (
                  <ChoiceStep title="平时运动频率？" subtitle="用来估算 TDEE 活动系数">
                    <ChoiceCard icon={<Armchair className="h-5 w-5" />} selected={values.activityLevel === "sedentary"} title="几乎不运动" desc="久坐为主" onClick={() => pickAndNext("activityLevel", "sedentary")} />
                    <ChoiceCard selected={values.activityLevel === "light"} title="每周 1–2 次" desc="刚开始或偶尔练" onClick={() => pickAndNext("activityLevel", "light")} />
                    <ChoiceCard selected={values.activityLevel === "moderate"} title="每周 3–4 次" desc="已经有固定节奏" onClick={() => pickAndNext("activityLevel", "moderate")} />
                    <ChoiceCard selected={values.activityLevel === "active"} title="每周 5–6 次" desc="训练是生活的一部分" onClick={() => pickAndNext("activityLevel", "active")} />
                    <ChoiceCard selected={values.activityLevel === "very_active"} title="每天训练" desc="高强度或体力工作" onClick={() => pickAndNext("activityLevel", "very_active")} />
                  </ChoiceStep>
                ) : null}

                {step === 8 ? (
                  <ChoiceStep title="你更常在哪里练？" subtitle="动作库会按场地来配">
                    <ChoiceCard icon={<Home className="h-5 w-5" />} selected={values.location === "home"} title="家里" desc="瑜伽垫、徒手或小器械" onClick={() => pickAndNext("location", "home")} />
                    <ChoiceCard icon={<Dumbbell className="h-5 w-5" />} selected={values.location === "gym"} title="健身房" desc="器械和自由重量" onClick={() => pickAndNext("location", "gym")} />
                    <ChoiceCard icon={<Trees className="h-5 w-5" />} selected={values.location === "outdoor"} title="户外" desc="快走、公园、新鲜空气" onClick={() => pickAndNext("location", "outdoor")} />
                  </ChoiceStep>
                ) : null}

                {step === 9 ? (
                  <ChoiceStep title="每天能拿出多久？" subtitle="短而稳，好过一次练垮">
                    <ChoiceCard selected={values.duration === "10"} title="10 分钟" desc="碎片时间也能开始" onClick={() => pickAndNext("duration", "10")} />
                    <ChoiceCard selected={values.duration === "20"} title="20 分钟" desc="最容易坚持的长度" onClick={() => pickAndNext("duration", "20")} />
                    <ChoiceCard selected={values.duration === "30"} title="30 分钟" desc="力量 + 一点有氧" onClick={() => pickAndNext("duration", "30")} />
                    <ChoiceCard selected={values.duration === "45"} title="45 分钟" desc="完整训练课" onClick={() => pickAndNext("duration", "45")} />
                  </ChoiceStep>
                ) : null}

                {step === 10 ? (
                  <ChoiceStep title="日常饮食更接近？" subtitle="热量分配会跟着你的偏好走">
                    <ChoiceCard icon={<Utensils className="h-5 w-5" />} selected={values.diet === "balanced"} title="均衡饮食" desc="什么都吃，适量就好" onClick={() => pickAndNext("diet", "balanced")} />
                    <ChoiceCard icon={<Leaf className="h-5 w-5" />} selected={values.diet === "vegetarian"} title="素食为主" desc="豆制品和蛋奶补蛋白" onClick={() => pickAndNext("diet", "vegetarian")} />
                    <ChoiceCard icon={<Target className="h-5 w-5" />} selected={values.diet === "high_protein"} title="高蛋白" desc="每餐先保证蛋白质" onClick={() => pickAndNext("diet", "high_protein")} />
                  </ChoiceStep>
                ) : null}

                {step === 11 ? (
                  <ChoiceStep title="昨晚大概睡了多久？" subtitle="恢复不够时，加练往往适得其反">
                    <ChoiceCard icon={<Moon className="h-5 w-5" />} selected={values.sleep === "lt6"} title="不到 6 小时" desc="先把睡眠补上" onClick={() => pickAndNext("sleep", "lt6")} />
                    <ChoiceCard selected={values.sleep === "6to8"} title="6–8 小时" desc="大多数人的舒适区" onClick={() => pickAndNext("sleep", "6to8")} />
                    <ChoiceCard selected={values.sleep === "gt8"} title="超过 8 小时" desc="恢复充足，可以加强度" onClick={() => pickAndNext("sleep", "gt8")} />
                  </ChoiceStep>
                ) : null}

                <div className="flex items-center justify-end gap-3 border-t pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-11"
                    disabled={step === 0 || busy || calculating}
                    onClick={() => setStep((current) => Math.max(0, current - 1))}
                  >
                    <ChevronLeft />
                    上一步
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="h-11 min-w-36"
                    disabled={!ready || busy || calculating}
                    onClick={() => void goNext()}
                  >
                    {step === LAST_STEP ? (
                      <>
                        生成我的方案
                        <Sparkles className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        继续
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </section>
      </div>
    </SiteShell>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {subtitle ? <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function ChoiceStep({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <StepHeading title={title} subtitle={subtitle} />
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function ChoiceCard({
  selected,
  title,
  desc,
  icon,
  onClick,
}: {
  selected: boolean;
  title: string;
  desc?: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full min-h-[5rem] w-full items-center gap-4 rounded-lg border bg-background px-4 py-4 text-left transition",
        selected
          ? "border-primary bg-accent ring-1 ring-primary/20"
          : "hover:border-primary/40 hover:bg-accent/50",
      )}
    >
      {icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{title}</span>
        {desc ? <span className="mt-0.5 block text-sm text-muted-foreground">{desc}</span> : null}
      </span>
    </button>
  );
}

function NumberStep({
  control,
  name,
  label,
  unit,
  min,
  max,
}: {
  control: ReturnType<typeof useForm<FunnelForm>>["control"];
  name: "age" | "heightCm" | "weightKg" | "targetWeightKg";
  label: string;
  unit: string;
  min: number;
  max: number;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-lg font-semibold tracking-tight">{label}</FormLabel>
          <div className="rounded-lg border bg-background px-5 py-6">
            <div className="flex items-end justify-between gap-4">
              <p className="text-5xl font-semibold tabular-nums tracking-tight">
                {name === "age" ? Math.round(Number(field.value)) : Number(field.value)}
              </p>
              <p className="pb-1 text-sm text-muted-foreground">{unit}</p>
            </div>
            <FormControl>
              <Slider
                className="mt-5"
                min={min}
                max={max}
                step={name === "age" ? 1 : 0.5}
                value={[Number(field.value)]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next != null) field.onChange(next);
                }}
              />
            </FormControl>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function CalculatingOverlay({ tick }: { tick: number }) {
  const tasks = ["核对身体数据", "计算 BMI 与代谢", "匹配训练安排", "生成饮食节奏"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">analyzing</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">正在为你生成方案</h2>
        <ul className="mt-8 space-y-3">
          {tasks.map((task, index) => (
            <li
              key={task}
              className={cn(
                "flex items-center gap-3 text-sm transition",
                index < tick ? "text-foreground" : "text-muted-foreground/70",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md text-[11px]",
                  index < tick ? "bg-primary text-primary-foreground" : "bg-secondary",
                )}
              >
                {index < tick ? "✓" : index + 1}
              </span>
              {task}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

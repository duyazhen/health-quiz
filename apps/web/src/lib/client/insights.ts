import type { PublicResult } from "./api";
import type { FunnelValues } from "./storage";

export type InsightPlan = {
  headline: string;
  subhead: string;
  bmi: { value: number; label: string; detail: string };
  calories: {
    tdee: number;
    target: number;
    note: string;
    meals: Array<{ name: string; kcal: number; hint: string }>;
  };
  workouts: { title: string; items: string[] };
  diet: { title: string; items: string[] };
  sleep: { title: string; items: string[] };
  week: Array<{ day: string; focus: string }>;
};

const GOAL_LABEL = {
  lose_weight: "减脂塑形",
  keep_fit: "保持健康",
  gain_muscle: "增肌增重",
} as const;

const FOCUS_LABEL = {
  belly: "腰腹核心",
  legs: "下肢与臀腿",
  arms: "上肢线条",
  full: "全身协调",
} as const;

function bmiCopy(bmi: number): { label: string; detail: string } {
  if (bmi < 18.5) {
    return {
      label: "偏瘦",
      detail: "优先把力量训练和蛋白质补上来，而不是一味加碳水。目标是先把基础代谢撑住。",
    };
  }
  if (bmi < 24) {
    return {
      label: "标准",
      detail: "体重区间健康。接下来按你的目标微调：减脂靠可持续缺口，增肌靠超量恢复。",
    };
  }
  if (bmi < 28) {
    return {
      label: "超重",
      detail: "建议走温和热量缺口（约每天 300–500 kcal），配合抗阻，避免只靠有氧掉肌肉。",
    };
  }
  return {
    label: "肥胖",
    detail: "先建立能坚持 4 周的节奏：规律三餐、睡眠、每周 3 次力量。速度不如可持续重要。",
  };
}

export function buildInsights(values: FunnelValues | undefined, result: PublicResult): InsightPlan {
  const age = values?.age ?? 28;
  const goal = values?.goal === "keep_fit" || values?.goal === "gain_muscle" ? values.goal : "lose_weight";
  const focus = values?.focusArea ?? "full";
  const location = values?.location ?? "home";
  const duration = values?.duration ?? "20";
  const diet = values?.diet ?? "balanced";
  const sleep = values?.sleep ?? "6to8";
  const activity = values?.activityLevel ?? "light";
  const minutes = Number(duration);

  const tdee = result.recommendedCalories;
  const target =
    goal === "lose_weight" ? Math.max(1200, tdee - 400) : goal === "gain_muscle" ? tdee + 250 : tdee;
  const breakfast = Math.round(target * 0.3);
  const lunch = Math.round(target * 0.4);
  const dinner = target - breakfast - lunch;
  const bmi = bmiCopy(result.bmi);

  const place =
    location === "gym" ? "健身房器械" : location === "outdoor" ? "户外快走 / 徒手" : "居家垫上";
  const focusText = FOCUS_LABEL[focus];

  const workoutItems = [
    `每次 ${minutes} 分钟，${place}，主练 ${focusText}。`,
    activity === "sedentary" || activity === "light"
      ? "从每周 3 次开始，比一次练到力竭更容易坚持。"
      : "你已有训练底子，可把其中 1 次加到接近力竭。",
    focus === "belly"
      ? "平板支撑、死虫、侧棒式优先；卷腹可以少做，核心更要抗伸展。"
      : focus === "legs"
        ? "深蹲、臀桥、箭步蹲做主项；膝盖不适就改成箱式深蹲。"
        : focus === "arms"
          ? "推类 + 拉类各一组，避免只练手臂弯举。"
          : "推、拉、蹲各留一组，再加 5 分钟核心。",
  ];

  const dietItems =
    diet === "vegetarian"
      ? [
          "豆制品、蛋奶、藜麦保证蛋白质；每餐先吃蛋白再吃主食。",
          `按 ${target} kcal 分配三餐，水果当加餐而不是正餐替代。`,
        ]
      : diet === "high_protein"
        ? [
            "每餐 25–40g 蛋白质：鸡胸、鱼、希腊酸奶或蛋白粉都可以。",
            "碳水放在训练前后，晚上以蔬菜 + 蛋白为主。",
          ]
        : [
            "均衡即可：蛋白质约占 1.4–1.8g/kg 体重，剩余热量给碳水与脂肪。",
            "少喝含糖饮料，比少吃一顿正餐更有效。",
          ];

  const sleepItems =
    sleep === "lt6"
      ? [
          "睡眠不足会推高饥饿激素。先把入睡提前 30 分钟，比加练更划算。",
          "午后停咖啡，睡前 1 小时把屏幕亮度降下来。",
        ]
      : sleep === "gt8"
        ? ["睡眠很充足，可以在训练日把强度再抬一点。", "起床后先喝水、再吃早餐，代谢会更稳。"]
        : ["6–8 小时已经够用。保持固定起床时间，比周末补觉更重要。", "训练安排在你最清醒的时段。"];

  const week: InsightPlan["week"] =
    goal === "gain_muscle"
      ? [
          { day: "周一", focus: `${focusText} 力量 · ${minutes} 分钟` },
          { day: "周二", focus: "步行恢复 20 分钟" },
          { day: "周三", focus: "全身力量 · 稍大重量" },
          { day: "周四", focus: "休息或拉伸" },
          { day: "周五", focus: `${focusText} 力量` },
          { day: "周六", focus: "轻松有氧" },
          { day: "周日", focus: "完全休息" },
        ]
      : [
          { day: "周一", focus: `${place} · ${focusText}` },
          { day: "周二", focus: "低强度步行 20–30 分钟" },
          { day: "周三", focus: `力量循环 · ${minutes} 分钟` },
          { day: "周四", focus: "核心 + 拉伸" },
          { day: "周五", focus: `${focusText} 再练一轮` },
          { day: "周六", focus: "户外或轻松有氧" },
          { day: "周日", focus: "休息，检查体重趋势" },
        ];

  return {
    headline: `为 ${age} 岁的你定制「${GOAL_LABEL[goal]}」方案`,
    subhead: `主攻 ${focusText} · ${place} · 每次 ${minutes} 分钟`,
    bmi: { value: result.bmi, ...bmi },
    calories: {
      tdee,
      target,
      note:
        goal === "lose_weight"
          ? `维持热量约 ${tdee} kcal。按每周约 0.5kg 的节奏，建议吃到 ${target} kcal，而不是极端节食。`
          : goal === "gain_muscle"
            ? `维持热量约 ${tdee} kcal。增肌需要轻微盈余，建议吃到 ${target} kcal，并保证蛋白。`
            : `维持热量约 ${tdee} kcal。保持这个区间，用训练改善体成分即可。`,
      meals: [
        { name: "早餐", kcal: breakfast, hint: "蛋白 + 慢碳，避免空腹咖啡度日" },
        { name: "午餐", kcal: lunch, hint: "正餐里最大的一顿，训练日可再加一点碳" },
        { name: "晚餐", kcal: dinner, hint: "蔬菜和蛋白为主，睡前 2 小时吃完更好" },
      ],
    },
    workouts: { title: "训练怎么排", items: workoutItems },
    diet: { title: "怎么吃", items: dietItems },
    sleep: { title: "恢复", items: sleepItems },
    week,
  };
}

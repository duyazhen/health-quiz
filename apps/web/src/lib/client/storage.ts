export type FunnelValues = {
  gender?: "male" | "female";
  goal?: string;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  targetWeightKg?: number;
  activityLevel?: "sedentary" | "light" | "moderate" | "active" | "very_active";
  focusArea?: "belly" | "legs" | "arms" | "full";
  bodyType?: "slim" | "average" | "curvy";
  location?: "home" | "gym" | "outdoor";
  duration?: "10" | "20" | "30" | "45";
  diet?: "balanced" | "vegetarian" | "high_protein";
  sleep?: "lt6" | "6to8" | "gt8";
};

export type FunnelDraft = {
  sessionId: string;
  step: number;
  values: FunnelValues;
};

const KEY = "health-quiz:v2";

export function loadDraft(): FunnelDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const current = window.localStorage.getItem(KEY);
    if (current) return JSON.parse(current) as FunnelDraft;
    const legacy = window.localStorage.getItem("health-quiz:v1");
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as FunnelDraft;
    return { ...parsed, step: 0 };
  } catch {
    return null;
  }
}

export function saveDraft(draft: FunnelDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(draft));
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

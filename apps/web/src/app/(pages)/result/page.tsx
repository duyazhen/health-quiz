import { Suspense } from "react";

import { ResultView } from "@/components/result/result-view";

export default function ResultPage() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-sm text-muted-foreground">加载结果…</p>}>
      <ResultView />
    </Suspense>
  );
}

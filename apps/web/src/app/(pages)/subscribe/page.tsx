import { Suspense } from "react";

import { SubscribeView } from "@/components/subscribe/subscribe-view";

export default function SubscribePage() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-sm text-muted-foreground">加载订阅…</p>}>
      <SubscribeView />
    </Suspense>
  );
}

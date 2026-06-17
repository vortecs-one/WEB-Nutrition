// app/auth/handoff/page.tsx
// Landing URL the native app opens in its WebView:
//   /auth/handoff?token=<single-use token>
// It exchanges the token for a session, then redirects into the dashboard.
import { Suspense } from "react";
import HandoffClient from "./HandoffClient";

export const dynamic = "force-dynamic";

export default function HandoffPage() {
  return (
    <Suspense fallback={<HandoffFallback />}>
      <HandoffClient />
    </Suspense>
  );
}

function HandoffFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    </div>
  );
}

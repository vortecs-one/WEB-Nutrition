// app/huawei-auth/page.tsx
// OAuth redirect target registered with Huawei:
//   https://web-nutrition.vercel.app/huawei-auth?code=<code>&state=<state>
// Huawei can only redirect to an https URL, so this page catches the redirect
// and forwards the query string to the native app's custom scheme,
// com.thruxion.app://huawei-auth. The app does the code->token exchange; this
// page only relays and stores nothing.
//
// No <Suspense> and no force-dynamic here, unlike app/auth/handoff/page.tsx:
// the params are read client-side from window.location rather than through
// useSearchParams(), so neither is required.
import HuaweiAuthClient from "./HuaweiAuthClient";

export const metadata = {
  title: "Authenticating…",
};

export default function HuaweiAuthPage() {
  return <HuaweiAuthClient />;
}

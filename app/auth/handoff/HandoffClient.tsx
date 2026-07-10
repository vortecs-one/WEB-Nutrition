"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { useTranslation } from "@/lib/i18n/provider";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

type Status = "working" | "error";

export default function HandoffClient() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslation();
  const [status, setStatus] = useState<Status>("working");
  // Guard against double-invocation (React Strict Mode / re-renders).
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const token = params.get("token");
    const callbackUrl = params.get("callbackUrl") || "/dashboard";

    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- validating the URL param that kicks off the async sign-in below, not a render-derived sync
      setStatus("error");
      return;
    }

    (async () => {
      const res = await signIn("app-handoff", {
        handoffToken: token,
        redirect: false,
        callbackUrl,
      });

      if (res?.error || !res?.ok) {
        setStatus("error");
        return;
      }

      // Persist the language the user picked in the native app (carried in the
      // session as `locale`) into the NEXT_LOCALE cookie. The root layout reads
      // this cookie on every load, so the app's choice is honored site-wide
      // without the layout needing to read the session during render.
      try {
        const session = await getSession();
        const sessionLocale = (session?.user as { locale?: string } | undefined)
          ?.locale;
        if (isLocale(sessionLocale)) {
          // 1 year, root path so every route sees it.
          document.cookie = `${LOCALE_COOKIE}=${sessionLocale}; path=/; max-age=31536000; samesite=lax`;
        }
      } catch {
        // Non-fatal: fall back to whatever locale cookie already exists.
      }

      // Replace so the one-time token never stays in WebView history.
      window.location.replace(callbackUrl);
    })();
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-xs">
        {status === "working" ? (
          <>
            <span
              className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
              role="status"
              aria-label={t.common.loading}
            />
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{t.handoff.failedTitle}</p>
            <p className="text-sm text-muted-foreground">
              {t.handoff.failedBody}
            </p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
            >
              {t.handoff.goToLogin}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

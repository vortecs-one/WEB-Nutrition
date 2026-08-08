"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

// The native app's deep link. Huawei can only redirect to https, so this page
// is the bridge between their redirect and the app's custom scheme.
const APP_SCHEME_URL = "com.thruxion.app://huawei-auth";

export default function HuaweiAuthClient() {
  const t = useTranslation();
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [noParams, setNoParams] = useState(false);
  // Guard against double-invocation (React Strict Mode / re-renders).
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Forwarded verbatim rather than rebuilt through URLSearchParams: whatever
    // Huawei sent reaches the app byte-for-byte with its original encoding.
    // Re-serializing can normalize a value, and an authorization code that
    // changes by one character is dead on arrival.
    const search = window.location.search;
    // A fragment never reaches the server, so if a response mode ever returns
    // the payload there, only this client-side read can recover it.
    const hash = window.location.hash;

    if (!search && !hash) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading window.location, which is unavailable during render; this is the effect's whole purpose
      setNoParams(true);
      return;
    }

    const target = `${APP_SCHEME_URL}${search}${hash}`;
    setDeepLink(target);
    // replace() so the authorization code never lingers in browser history.
    window.location.replace(target);
  }, []);

  if (noParams) {
    return (
      <Shell>
        <p className="text-sm font-medium">{t.huaweiAuth.missingParamsTitle}</p>
        <p className="text-sm text-muted-foreground">
          {t.huaweiAuth.missingParamsBody}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
        role="status"
        aria-label={t.huaweiAuth.title}
      />
      <p className="text-sm font-medium">{t.huaweiAuth.title}</p>
      <p className="text-sm text-muted-foreground">{t.huaweiAuth.body}</p>

      {/* An anchor, not a button with an onClick: if the browser blocked the
          automatic navigation above — the exact case this exists for — a plain
          href still works. */}
      {deepLink && (
        <>
          <a
            href={deepLink}
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
          >
            {t.huaweiAuth.returnToApp}
          </a>
          <p className="text-xs text-muted-foreground">
            {t.huaweiAuth.blockedHint}
          </p>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-xs">
        {children}
      </div>
    </div>
  );
}

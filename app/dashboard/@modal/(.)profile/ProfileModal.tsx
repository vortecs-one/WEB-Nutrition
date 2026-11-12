"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";

// Same breakpoint as DashboardShell: the sidebar layout starts at lg.
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getIsDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;
// This route only renders after in-app navigation, so the server value is never used.
const getServerIsDesktop = () => false;

export default function ProfileModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { dict } = useI18n();
  const isDesktop = useSyncExternalStore(subscribe, getIsDesktop, getServerIsDesktop);

  // Desktop shows the profile as a normal page. Intercepting only applies to
  // in-app (soft) navigation, so a full navigation loads the real page.
  useEffect(() => {
    if (isDesktop) window.location.replace(pathname);
  }, [isDesktop, pathname]);

  if (isDesktop) return null;

  return (
    <Modal isOpen onClose={() => router.back()} title={dict.profile.title}>
      {children}
    </Modal>
  );
}

"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";

export default function ProfileModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { dict } = useI18n();
  return (
    <Modal isOpen onClose={() => router.back()} title={dict.profile.title}>
      {children}
    </Modal>
  );
}

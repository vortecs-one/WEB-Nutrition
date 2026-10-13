"use client";

import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  size?: "md" | "lg";
}

const sizeClass: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "sm:max-w-2xl",
  lg: "sm:max-w-4xl",
};

export function Modal({ isOpen, onClose, children, title, size = "md" }: ModalProps) {
  const titleId = useId();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      {/* Header stays fixed while only the body scrolls; dvh tracks the
          mobile browser toolbar so the sheet never extends off-screen. */}
      <div
        className={`flex w-full ${sizeClass[size]} max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-sidebar text-sidebar-foreground shadow-xl sm:max-h-[90dvh] sm:rounded-3xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sidebar-foreground/10 px-4 py-3 sm:p-5">
          {title && (
            <h2 id={titleId} className="min-w-0 truncate text-lg font-semibold">
              {title}
            </h2>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

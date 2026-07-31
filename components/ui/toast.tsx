"use client";

// Transient message pinned to the bottom of the viewport.
//
// Rendered through a portal into <body> rather than in place: callers use it
// from inside the Modal, which is a z-50 stacking context with its own scroll
// container, so an inline toast would be clipped or painted underneath it.

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ToastProps {
  open: boolean;
  message: string;
  onClose: () => void;
  /** Auto-dismiss delay in ms. */
  duration?: number;
}

export function Toast({ open, message, onClose, duration = 5000 }: ToastProps) {
  // Portals need a DOM node, which doesn't exist during SSR.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only portal target
  useEffect(() => setMounted(true), []);

  // Auto-dismiss. Keyed on `message` too, so re-opening with new content
  // restarts the countdown instead of inheriting the previous one.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [open, message, duration, onClose]);

  // Escape closes it, matching the Modal's behaviour.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      // Above the Modal's z-50. pointer-events-none on the wrapper so the
      // toast never blocks clicks on whatever is behind it; the toast itself
      // opts back in for its close button.
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4"
    >
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl bg-sidebar text-sidebar-foreground shadow-xl ring-1 ring-sidebar-foreground/10 px-4 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
      >
        <span className="text-xs sm:text-sm text-pretty">{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

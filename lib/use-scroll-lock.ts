"use client";

import { useEffect } from "react";

/**
 * Locks document.body scroll while `active` is true.
 * Restores the original overflow + padding-right on cleanup
 * so the page doesn't shift when a scrollbar disappears.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const el = document.body;
    const prevOverflow = el.style.overflow;
    const prevPaddingRight = el.style.paddingRight;

    // Compensate for the scrollbar width so the layout doesn't jump.
    const scrollbarWidth = window.innerWidth - el.clientWidth;
    el.style.paddingRight = `${scrollbarWidth}px`;
    el.style.overflow = "hidden";

    return () => {
      el.style.overflow = prevOverflow;
      el.style.paddingRight = prevPaddingRight;
    };
  }, [active]);
}

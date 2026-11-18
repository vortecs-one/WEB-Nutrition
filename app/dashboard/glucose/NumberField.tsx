"use client";

import { useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";

type Props = {
  id: string;
  label: string;
  hint?: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  step: string;
  large?: boolean;
  compactHint?: boolean;
  /** Starts read-only with an edit button (labels for the edit/done buttons). */
  lockable?: { edit: string; done: string };
  /** Permanently read-only, with no edit button (e.g. for watchers). */
  readOnly?: boolean;
  /** Called when the user confirms an edit (check button or Enter). Return false to keep editing. */
  onCommit?: () => boolean | void;
  className?: string;
};

export default function NumberField({
  id,
  label,
  hint,
  suffix,
  value,
  onChange,
  step,
  large,
  compactHint,
  lockable,
  readOnly,
  onCommit,
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Lockable fields start locked; the state resets whenever the popup reopens
  // because the modal unmounts its content when closed.
  const [editing, setEditing] = useState(false);
  const locked = !!readOnly || (!!lockable && !editing);

  const unlock = () => {
    setEditing(true);
    // Focus after React re-renders the input without readOnly.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const finish = () => {
    if (onCommit?.() === false) return;
    setEditing(false);
  };

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="truncate text-sm font-medium" title={label}>
        {label}
      </label>
      <div
        className={`flex items-center gap-2 rounded-xl border border-transparent px-3 transition-colors ${
          locked
            ? "bg-sidebar-accent/50"
            : "bg-sidebar-accent focus-within:border-highlight focus-within:ring-2 focus-within:ring-highlight/40"
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          readOnly={locked}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            if (!locked) e.target.select();
          }}
          onKeyDown={(e) => {
            if (lockable && !locked && e.key === "Enter") finish();
          }}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`w-full min-w-0 bg-transparent py-2.5 tabular-nums outline-none ${
            large ? "text-2xl font-semibold" : "text-base"
          } ${locked ? "cursor-default text-sidebar-foreground/70" : ""}`}
        />
        <span className="shrink-0 text-sm text-sidebar-foreground/60">{suffix}</span>
        {lockable && !readOnly && (
          <button
            type="button"
            onClick={locked ? unlock : finish}
            aria-label={locked ? `${lockable.edit} ${label}` : lockable.done}
            title={locked ? lockable.edit : lockable.done}
            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/60 transition hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
          >
            {locked ? (
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4 text-highlight" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {hint && (
        <p
          id={`${id}-hint`}
          className={`text-xs text-sidebar-foreground/60 ${compactHint ? "hidden sm:block" : ""}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { Search, X } from "lucide-react";
import { searchReference } from "@/lib/foods/photo-postprocess";
import type { ReferenceEntry } from "@/lib/foods/reference-table";

export default function ReferencePicker({
  locale,
  placeholder,
  emptyLabel,
  closeLabel,
  carbsLabel,
  unitG,
  onPick,
  onClose,
}: {
  locale: "es" | "en";
  placeholder: string;
  emptyLabel: string;
  closeLabel: string;
  carbsLabel: string;
  unitG: string;
  onPick: (entry: ReferenceEntry) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const results = searchReference(query);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-highlight/40 bg-background p-2">
      <div className="flex items-center gap-2">
        <label className="flex min-h-10 flex-1 items-center gap-2 rounded-lg bg-muted px-3 focus-within:ring-1 focus-within:ring-highlight">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{placeholder}</span>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              if (results[0]) onPick(results[0]);
            }}
            placeholder={placeholder}
            aria-controls={listId}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {query.trim() && (
        <ul id={listId} className="flex max-h-56 flex-col overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">{emptyLabel}</li>
          ) : (
            results.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onPick(entry)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent"
                >
                  <span className="min-w-0 truncate">{locale === "en" ? entry.nameEn : entry.nameEs}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {locale === "en" ? entry.portionEn : entry.portionEs} ·{" "}
                    <span className="text-highlight">
                      {entry.portionCarbs} {unitG} {carbsLabel}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

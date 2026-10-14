"use client";

import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { displayName, getCharacter } from "@/lib/pets/manager";
import type { Locale } from "@/lib/pets/types";
import { CharacterPickerModal } from "./CharacterPickerModal";
import { CharacterPortrait } from "./CharacterPortrait";
import { CompanionDetailModal, moodLabel } from "./CompanionDetailModal";
import { useCompanion } from "./use-companion";

export default function CompanionCard() {
  const { dict, locale } = useI18n();
  const lang = locale as Locale;
  const { companion, isLoading, error } = useCompanion();
  const [detailOpen, setDetailOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (error) return null;

  const character = companion ? getCharacter(companion.characterId) : undefined;

  return (
    <section
      aria-labelledby="companion-card-title"
      className="mx-auto w-full max-w-4xl rounded-3xl bg-sidebar p-3 text-sidebar-foreground shadow-sm sm:p-5"
    >
      <button
        type="button"
        // Without a companion the detail popup would be empty, so go straight
        // to choosing one.
        onClick={() => (companion ? setDetailOpen(true) : setPickerOpen(true))}
        disabled={isLoading}
        className="flex w-full items-center gap-4 rounded-2xl text-left transition hover:bg-sidebar-accent/60 disabled:opacity-60"
      >
        {character && companion ? (
          <CharacterPortrait
            character={character}
            locale={lang}
            sizes="96px"
            className="h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-sidebar-accent text-highlight sm:h-24 sm:w-24">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            id="companion-card-title"
            className="text-xs font-medium uppercase tracking-wide text-sidebar-foreground/60"
          >
            {dict.pets.title}
          </span>
          {companion && character ? (
            <>
              <span className="truncate text-lg font-semibold">
                {displayName(companion, lang)}
              </span>
              <span className="self-start rounded-full bg-highlight/15 px-2.5 py-0.5 text-xs font-medium text-highlight">
                {moodLabel(dict, companion.mood)}
              </span>
            </>
          ) : (
            <>
              <span className="text-lg font-semibold">{dict.pets.emptyTitle}</span>
              <span className="text-pretty text-sm leading-relaxed text-sidebar-foreground/60">
                {dict.pets.emptyBody}
              </span>
            </>
          )}
        </div>

        <span className="flex shrink-0 items-center gap-1 pr-1 text-sm text-sidebar-foreground/60">
          <span className="hidden sm:inline">
            {companion ? dict.pets.viewDetails : dict.pets.choose}
          </span>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </span>
      </button>

      <CompanionDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        onChangeCompanion={() => setPickerOpen(true)}
      />
      {/* Rendered after the detail popup so it stacks on top of it. */}
      <CharacterPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdopted={() => {
          setPickerOpen(false);
          setDetailOpen(true);
        }}
      />
    </section>
  );
}

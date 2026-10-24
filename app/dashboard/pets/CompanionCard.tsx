"use client";

import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { useGlucoseStatus } from "@/lib/glucose/status-provider";
import type { GlucoseStatus } from "@/lib/glucose/types";
import { useI18n } from "@/lib/i18n/provider";
import { displayName, getCharacter } from "@/lib/pets/manager";
import { POSE_FOR_MOOD } from "@/lib/pets/mood";
import type { CharacterMood, Locale, PetPose } from "@/lib/pets/types";
import { CharacterPickerModal } from "./CharacterPickerModal";
import { CharacterPortrait } from "./CharacterPortrait";
import { CompanionDetailModal } from "./CompanionDetailModal";
import { useCompanion } from "./use-companion";
import { useCompanionMood } from "./use-companion-mood";

// The card takes the color of the glucose card's reading pill (statusCard in
// app/dashboard/glucose/GlucoseTracker.tsx; keep the backgrounds in sync), with
// an ink picked for contrast on each: the pill's white on teal is too faint
// for the small text here.
const GLUCOSE_CARD: Record<GlucoseStatus, string> = {
  "in-range": "bg-chart-2 text-teal-950",
  high: "bg-amber-500 text-amber-950",
  low: "bg-amber-500 text-amber-950",
  urgent: "bg-destructive text-white",
};

export default function CompanionCard() {
  const { dict, locale } = useI18n();
  const lang = locale as Locale;
  const { companion, isLoading, error } = useCompanion();
  const glucoseStatus = useGlucoseStatus();
  const [detailOpen, setDetailOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The mood comes from the health data; exclusive accounts can override it
  // by hand for testing (null = Auto) until they pick Auto or reload.
  const derived = useCompanionMood();
  const [manualMood, setManualMood] = useState<CharacterMood | null>(null);
  const [manualPose, setManualPose] = useState<PetPose | null>(null);
  const mood = manualMood ?? derived?.mood ?? null;
  const pose = manualPose ?? (manualMood ? POSE_FOR_MOOD[manualMood] : derived?.pose) ?? null;
  const manual = manualMood !== null || manualPose !== null;

  if (error) return null;

  const character = companion ? getCharacter(companion.characterId) : undefined;
  // Without a glucose status the card keeps the sidebar palette. With one,
  // everything inside inherits the card's ink instead.
  const tinted = glucoseStatus !== null;
  const quiet = tinted ? "opacity-90" : "text-sidebar-foreground/60";

  return (
    <section
      aria-labelledby="companion-card-title"
      className={`mx-auto w-full max-w-4xl rounded-3xl p-3 shadow-sm transition-colors duration-500 sm:p-5 ${
        glucoseStatus ? GLUCOSE_CARD[glucoseStatus] : "bg-sidebar text-sidebar-foreground"
      }`}
    >
      <button
        type="button"
        // Without a companion the detail popup would be empty, so go straight
        // to choosing one.
        onClick={() => (companion ? setDetailOpen(true) : setPickerOpen(true))}
        disabled={isLoading}
        className={`flex w-full items-center gap-4 rounded-2xl text-left transition disabled:opacity-60 ${
          tinted ? "hover:bg-black/10" : "hover:bg-sidebar-accent/60"
        }`}
      >
        {character && companion ? (
          <CharacterPortrait
            character={character}
            locale={lang}
            sizes="96px"
            mood={mood ?? undefined}
            className="h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24"
          />
        ) : (
          <div
            className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl sm:h-24 sm:w-24 ${
              tinted ? "bg-black/10 text-current" : "bg-sidebar-accent text-highlight"
            }`}
          >
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            id="companion-card-title"
            className={`text-xs font-medium uppercase tracking-wide ${quiet}`}
          >
            {dict.pets.title}
          </span>
          {companion && character ? (
            <>
              <span className="truncate text-lg font-semibold">
                {displayName(companion, lang)}
              </span>
              {mood && (
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      tinted ? "bg-current/15 text-current" : "bg-highlight/15 text-highlight"
                    }`}
                  >
                    {dict.pets.moods[mood]}
                  </span>
                  <span className={`truncate text-xs ${quiet}`}>
                    {manual ? dict.pets.moodManualNote : derived && dict.pets.reasons[derived.reason]}
                  </span>
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-lg font-semibold">{dict.pets.emptyTitle}</span>
              <span className={`text-pretty text-sm leading-relaxed ${quiet}`}>
                {dict.pets.emptyBody}
              </span>
            </>
          )}
        </div>

        <span className={`flex shrink-0 items-center gap-1 pr-1 text-sm ${quiet}`}>
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
        mood={mood}
        pose={pose}
        reason={manual ? null : (derived?.reason ?? null)}
        manualMood={manualMood}
        manualPose={manualPose}
        onManualMoodChange={setManualMood}
        onManualPoseChange={setManualPose}
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

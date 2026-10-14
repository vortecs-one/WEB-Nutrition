"use client";

import { useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";
import { displayName, getCharacter } from "@/lib/pets/manager";
import type { CharacterMood, Locale } from "@/lib/pets/types";
import type { Dictionary } from "@/lib/i18n/dictionaries/es";
import { AnimatedPortrait } from "./AnimatedPortrait";
import { CompanionHealthStats } from "./CompanionHealthStats";
import { useCompanion } from "./use-companion";

export function moodLabel(dict: Dictionary, mood: CharacterMood): string {
  const labels: Record<CharacterMood, string> = {
    happy: dict.pets.moodHappy,
    calm: dict.pets.moodCalm,
    neutral: dict.pets.moodNeutral,
    worried: dict.pets.moodWorried,
    sad: dict.pets.moodSad,
    proud: dict.pets.moodProud,
    sleepy: dict.pets.moodSleepy,
  };
  return labels[mood];
}

interface CompanionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the "Available characters" popup on top of this one. */
  onChangeCompanion: () => void;
}

export function CompanionDetailModal({
  isOpen,
  onClose,
  onChangeCompanion,
}: CompanionDetailModalProps) {
  const { dict, locale } = useI18n();
  const lang = locale as Locale;
  const { companion, rename, release } = useCompanion();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const character = companion ? getCharacter(companion.characterId) : undefined;

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("nickname");
    setIsSaving(true);
    setError(null);
    const ok = await rename(typeof value === "string" ? value : null);
    if (!ok) setError(dict.pets.errorGeneric);
    setIsSaving(false);
  }

  async function handleRelease() {
    setIsSaving(true);
    setError(null);
    const ok = await release();
    setIsSaving(false);
    // Nothing left to show here; the card offers to choose a new companion.
    if (ok) onClose();
    else setError(dict.pets.errorGeneric);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={dict.pets.detailTitle} size="lg">
      <div className="flex flex-col gap-6">
        {companion && character && (
          <section className="flex flex-col gap-5 sm:flex-row">
            {/* The portrait is itself a button (tap to pet), so the change
                button sits beside it in this wrapper, layered on top. */}
            <div className="relative aspect-square w-full shrink-0 sm:w-60 sm:self-start">
              <AnimatedPortrait
                character={character}
                mood={companion.mood}
                locale={lang}
                petLabel={dict.pets.petAction.replace("{name}", displayName(companion, lang))}
                sizes="(min-width: 640px) 240px, 90vw"
                className="h-full w-full rounded-2xl"
              />
              <button
                type="button"
                onClick={onChangeCompanion}
                className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {dict.pets.changeCompanion}
              </button>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-balance text-2xl font-semibold">
                  {displayName(companion, lang)}
                </h3>
                {companion.nickname && (
                  <p className="text-sm text-sidebar-foreground/60">
                    {character.name[lang]}
                  </p>
                )}
              </div>
              <p className="text-pretty text-sm leading-relaxed text-sidebar-foreground/80">
                {character.description[lang]}
              </p>

              <div className="flex flex-col gap-1 rounded-2xl bg-sidebar-accent p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-sidebar-foreground/60">{dict.pets.mood}</span>
                  <span className="rounded-full bg-highlight/15 px-2.5 py-0.5 font-medium text-highlight">
                    {moodLabel(dict, companion.mood)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-sidebar-foreground/60">
                  {dict.pets.moodPending}
                </p>
              </div>

              <form
                key={companion.updatedAt}
                onSubmit={handleRename}
                className="flex flex-col gap-1.5"
              >
                <label htmlFor="companion-nickname" className="text-sm font-medium">
                  {dict.pets.nickname}
                </label>
                <div className="flex gap-2">
                  <input
                    id="companion-nickname"
                    name="nickname"
                    defaultValue={companion.nickname ?? ""}
                    maxLength={24}
                    autoComplete="off"
                    placeholder={dict.pets.nicknamePlaceholder}
                    className="min-w-0 flex-1 rounded-xl border border-sidebar-foreground/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-highlight"
                  />
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-xl bg-highlight px-4 py-2 text-sm font-medium text-highlight-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    {dict.pets.save}
                  </button>
                </div>
              </form>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-sidebar-foreground/60">
                <dt>{dict.pets.source}</dt>
                <dd className="text-sidebar-foreground/80">
                  {character.rights.sourceWork} — {character.rights.author} ({character.rights.firstPublished})
                </dd>
                <dt>{dict.pets.publicDomainSince}</dt>
                <dd className="text-sidebar-foreground/80">{character.rights.publicDomainSince}</dd>
              </dl>
            </div>
          </section>
        )}

        {companion && <CompanionHealthStats />}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {companion && (
          <button
            type="button"
            onClick={handleRelease}
            disabled={isSaving}
            className="self-start text-sm text-sidebar-foreground/60 underline-offset-4 hover:text-sidebar-foreground hover:underline disabled:opacity-50"
          >
            {dict.pets.release}
          </button>
        )}
      </div>
    </Modal>
  );
}

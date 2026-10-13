"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";
import { displayName, getCharacter } from "@/lib/pets/manager";
import type { CharacterMood, Locale } from "@/lib/pets/types";
import type { Dictionary } from "@/lib/i18n/dictionaries/es";
import { CharacterGallery } from "./CharacterGallery";
import { CharacterPortrait } from "./CharacterPortrait";
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
}

export function CompanionDetailModal({ isOpen, onClose }: CompanionDetailModalProps) {
  const { dict, locale } = useI18n();
  const lang = locale as Locale;
  const { companion, adopt, rename, release } = useCompanion();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const character = companion ? getCharacter(companion.characterId) : undefined;

  async function handleAdopt(characterId: string) {
    setPendingId(characterId);
    setError(null);
    const ok = await adopt(characterId);
    if (!ok) setError(dict.pets.errorGeneric);
    setPendingId(null);
  }

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
    if (!ok) setError(dict.pets.errorGeneric);
    setIsSaving(false);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={dict.pets.detailTitle} size="lg">
      <div className="flex flex-col gap-6">
        {companion && character && (
          <section className="flex flex-col gap-5 sm:flex-row">
            <CharacterPortrait
              character={character}
              locale={lang}
              sizes="(min-width: 640px) 240px, 90vw"
              priority
              className="aspect-square w-full shrink-0 rounded-2xl sm:w-60"
            />
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

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{dict.pets.galleryTitle}</h3>
          <CharacterGallery
            currentId={companion?.characterId ?? null}
            pendingId={pendingId}
            onAdopt={handleAdopt}
          />
          <p className="text-xs leading-relaxed text-sidebar-foreground/60">
            {dict.pets.rightsNote} {dict.pets.lockedNote}
          </p>
        </section>

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

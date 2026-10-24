"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, FlaskConical, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useGlucoseStatus } from "@/lib/glucose/status-provider";
import { useI18n } from "@/lib/i18n/provider";
import { displayName, getCharacter } from "@/lib/pets/manager";
import { CHARACTER_MOODS, PET_POSES, type MoodReason } from "@/lib/pets/mood";
import type { CharacterMood, Locale, PetPose } from "@/lib/pets/types";
import { AnimatedPortrait } from "./AnimatedPortrait";
import { CharacterPortrait } from "./CharacterPortrait";
import { GlucoseReading } from "./GlucoseReading";
import { useCompanion } from "./use-companion";

interface CompanionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the "Available characters" popup on top of this one. */
  onChangeCompanion: () => void;
  /** What the companion shows: the mood from the health data, or a manual pick. */
  mood: CharacterMood | null;
  pose: PetPose | null;
  /** Why it feels that way; null while a manual pick overrides it. */
  reason: MoodReason | null;
  /** Manual picks for testing (null = Auto), owned by the card. */
  manualMood: CharacterMood | null;
  manualPose: PetPose | null;
  onManualMoodChange: (mood: CharacterMood | null) => void;
  onManualPoseChange: (pose: PetPose | null) => void;
}

export function CompanionDetailModal({
  isOpen,
  onClose,
  onChangeCompanion,
  mood,
  pose,
  reason,
  manualMood,
  manualPose,
  onManualMoodChange,
  onManualPoseChange,
}: CompanionDetailModalProps) {
  const { dict, locale } = useI18n();
  const lang = locale as Locale;
  const { companion, exclusiveAccess, rename, release } = useCompanion();
  // The latest glucose reading's status: the pet is ringed in its color.
  const glucoseStatus = useGlucoseStatus();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"companion" | "details">("companion");
  const [trying, setTrying] = useState(false);

  const character = companion ? getCharacter(companion.characterId) : undefined;
  const why = reason ? dict.pets.reasons[reason] : dict.pets.moodManualNote;

  // This component outlives the Modal's content, so reset the tab here to
  // always reopen on the portrait.
  function handleClose() {
    setTab("companion");
    setTrying(false);
    onClose();
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
    setIsSaving(false);
    // Nothing left to show here; the card offers to choose a new companion.
    if (ok) handleClose();
    else setError(dict.pets.errorGeneric);
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={dict.pets.detailTitle}>
      {companion && (
        <div className="flex flex-col gap-6">
          {/* Same tab pattern as the add-food popup (BarcodeLookup), in this
              popup's sidebar palette: the portrait first, then the details. */}
          <div
            role="tablist"
            aria-label={dict.pets.detailTitle}
            className="grid grid-cols-2 gap-1 rounded-2xl bg-sidebar-accent p-1"
          >
            {(
              [
                { id: "companion", label: dict.pets.tabCompanion },
                { id: "details", label: dict.pets.tabDetails },
              ] as const
            ).map(({ id, label }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`companion-tab-${id}`}
                  aria-selected={active}
                  aria-controls={`companion-panel-${id}`}
                  onClick={() => setTab(id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      const next = id === "companion" ? "details" : "companion";
                      setTab(next);
                      document.getElementById(`companion-tab-${next}`)?.focus();
                    }
                  }}
                  tabIndex={active ? 0 : -1}
                  className={`min-h-11 rounded-xl text-sm font-semibold transition ${
                    active
                      ? "bg-sidebar text-sidebar-foreground shadow-sm"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {tab === "companion" ? (
            <div role="tabpanel" id="companion-panel-companion" aria-labelledby="companion-tab-companion">
              {/* The portrait is itself a button (tap to pet), so the change
                  button and the glucose readout sit beside it in this wrapper,
                  layered on top. */}
              {character && (
                <div className="relative mx-auto aspect-square w-full max-w-md">
                  <AnimatedPortrait
                    character={character}
                    mood={mood ?? "happy"}
                    pose={pose ?? undefined}
                    locale={lang}
                    petLabel={dict.pets.petAction.replace("{name}", displayName(companion, lang))}
                    sizes="(min-width: 640px) 448px, 90vw"
                    className="h-full w-full rounded-2xl"
                    aura={glucoseStatus}
                  />
                  <GlucoseReading />
                  <button
                    type="button"
                    onClick={onChangeCompanion}
                    className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {dict.pets.changeCompanion}
                  </button>
                </div>
              )}

              {character && mood && (
                <div className="mt-3 flex min-w-0 items-center justify-center gap-2 text-sm">
                  {character.layers?.faces?.[mood] && (
                    <CharacterPortrait
                      character={character}
                      locale={lang}
                      sizes="36px"
                      mood={mood}
                      className="h-9 w-9 shrink-0 rounded-full"
                    />
                  )}
                  <span className="shrink-0 rounded-full bg-highlight/15 px-2.5 py-0.5 font-medium text-highlight">
                    {dict.pets.moods[mood]}
                  </span>
                  <span className="truncate text-sidebar-foreground/60">{why}</span>
                </div>
              )}

              {/* Testing aid for the exclusive accounts: pick any emotion or
                  pose by hand (Auto follows the health data again). */}
              {character && exclusiveAccess && (
                <div className="mt-3 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setTrying((v) => !v)}
                    aria-expanded={trying}
                    aria-controls="companion-try-moods"
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-sidebar-foreground/60 transition hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
                  >
                    <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                    {dict.pets.moodTry}
                    <ChevronDown className={`h-3.5 w-3.5 transition ${trying ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {trying && (
                    <div id="companion-try-moods" className="flex w-full flex-col gap-3 rounded-2xl bg-sidebar-accent p-3">
                      <ChipGroup
                        label={dict.pets.moodTryEmotion}
                        autoLabel={dict.pets.moodAuto}
                        options={CHARACTER_MOODS}
                        value={manualMood}
                        labelOf={(m) => dict.pets.moods[m]}
                        onChange={onManualMoodChange}
                      />
                      {character.layers?.poses && (
                        <ChipGroup
                          label={dict.pets.moodTryPose}
                          autoLabel={dict.pets.moodAuto}
                          options={PET_POSES.filter((p) => character.layers?.poses?.[p])}
                          value={manualPose}
                          labelOf={(p) => dict.pets.poses[p]}
                          onChange={onManualPoseChange}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              role="tabpanel"
              id="companion-panel-details"
              aria-labelledby="companion-tab-details"
              className="flex flex-col gap-6"
            >
              {character && (
                <div className="flex min-w-0 flex-col gap-4">
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

                  {mood && (
                    <div className="flex flex-col gap-1 rounded-2xl bg-sidebar-accent p-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-sidebar-foreground/60">{dict.pets.mood}</span>
                        <span className="rounded-full bg-highlight/15 px-2.5 py-0.5 font-medium text-highlight">
                          {dict.pets.moods[mood]}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-sidebar-foreground/60">{why}</p>
                    </div>
                  )}

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

                  {character.rights ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-sidebar-foreground/60">
                      <dt>{dict.pets.source}</dt>
                      <dd className="text-sidebar-foreground/80">
                        {character.rights.sourceWork} — {character.rights.author} ({character.rights.firstPublished})
                      </dd>
                      <dt>{dict.pets.publicDomainSince}</dt>
                      <dd className="text-sidebar-foreground/80">{character.rights.publicDomainSince}</dd>
                    </dl>
                  ) : (
                    character.origin && (
                      <p className="text-xs text-sidebar-foreground/60">{character.origin[lang]}</p>
                    )
                  )}
                </div>
              )}

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleRelease}
                disabled={isSaving}
                className="self-start text-sm text-sidebar-foreground/60 underline-offset-4 hover:text-sidebar-foreground hover:underline disabled:opacity-50"
              >
                {dict.pets.release}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

interface ChipGroupProps<T extends string> {
  label: string;
  autoLabel: string;
  options: readonly T[];
  /** The manual pick; null = Auto. */
  value: T | null;
  labelOf: (option: T) => string;
  onChange: (value: T | null) => void;
}

// A wrap of toggle chips: Auto, then every option.
function ChipGroup<T extends string>({ label, autoLabel, options, value, labelOf, onChange }: ChipGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-sidebar-foreground/60">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {[null, ...options].map((option) => {
          const active = option === value;
          return (
            <button
              key={option ?? "auto"}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight ${
                active
                  ? "bg-highlight text-highlight-foreground"
                  : "bg-sidebar text-sidebar-foreground/70 hover:text-sidebar-foreground"
              }`}
            >
              {option === null ? autoLabel : labelOf(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

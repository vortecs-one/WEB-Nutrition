"use client";

import { Check, Lock, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { isAvailableCharacter, isSelectableFor, listCharacters } from "@/lib/pets/manager";
import type { Locale } from "@/lib/pets/types";
import { CharacterPortrait } from "./CharacterPortrait";

// Shown first, in this order; then the other available characters, then the
// locked ones.
const FEATURED_ORDER = ["humboldt-penguin", "bambi"];

interface CharacterGalleryProps {
  currentId: string | null;
  pendingId: string | null;
  /** Whether this account may choose exclusive companions (server-checked). */
  exclusiveAccess: boolean;
  onAdopt: (characterId: string) => void;
}

export function CharacterGallery({
  currentId,
  pendingId,
  exclusiveAccess,
  onAdopt,
}: CharacterGalleryProps) {
  const { dict, locale } = useI18n();
  const lang = locale as Locale;
  const rank = (id: string) => {
    const featured = FEATURED_ORDER.indexOf(id);
    if (featured !== -1) return featured;
    return FEATURED_ORDER.length + (isAvailableCharacter(id) ? 0 : 1);
  };
  const characters = [...listCharacters()].sort((a, b) => rank(a.id) - rank(b.id));

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {characters.map((character) => {
        const available = isAvailableCharacter(character.id);
        const selectable = isSelectableFor(character.id, exclusiveAccess);
        // Exclusive companion this account can't choose: shown as a teaser.
        const exclusiveLocked = available && !selectable;
        const isCurrent = character.id === currentId;
        const isPending = character.id === pendingId;

        return (
          <li key={character.id}>
            <button
              type="button"
              disabled={!selectable || isCurrent || pendingId !== null}
              onClick={() => onAdopt(character.id)}
              aria-pressed={isCurrent}
              aria-label={exclusiveLocked ? `${character.name[lang]} — ${dict.pets.exclusiveLocked}` : undefined}
              className={`flex w-full flex-col gap-2 rounded-2xl border p-2 text-left transition ${
                isCurrent
                  ? "border-highlight bg-highlight/10"
                  : "border-sidebar-foreground/10 hover:border-sidebar-foreground/30"
              } disabled:cursor-default ${available ? "" : "opacity-60"} ${
                isPending ? "animate-pulse" : ""
              }`}
            >
              <span className="relative block">
                <CharacterPortrait
                  character={character}
                  locale={lang}
                  sizes="(min-width: 640px) 200px, 45vw"
                  className={`aspect-square w-full rounded-xl ${exclusiveLocked ? "opacity-60 grayscale-[40%]" : ""}`}
                />
                {character.exclusive && (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"
                  >
                    {exclusiveLocked ? <Lock className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </span>
                )}
              </span>
              <span className="flex flex-col gap-0.5 px-1 pb-1">
                <span className="truncate text-sm font-medium">
                  {character.name[lang]}
                </span>
                <span className="flex items-center gap-1 text-xs text-sidebar-foreground/60">
                  {isCurrent ? (
                    <>
                      <Check className="h-3 w-3 text-highlight" aria-hidden="true" />
                      {dict.pets.current}
                    </>
                  ) : character.exclusive && available ? (
                    <>
                      {exclusiveLocked ? (
                        <Lock className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-highlight" aria-hidden="true" />
                      )}
                      {dict.pets.exclusive}
                    </>
                  ) : available && character.rights ? (
                    `${character.rights.author}, ${character.rights.firstPublished}`
                  ) : available ? (
                    (character.origin?.[lang] ?? "")
                  ) : (
                    dict.pets.locked
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

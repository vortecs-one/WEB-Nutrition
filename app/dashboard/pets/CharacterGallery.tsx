"use client";

import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { isAvailableCharacter, listCharacters } from "@/lib/pets/manager";
import type { Locale } from "@/lib/pets/types";
import { CharacterPortrait } from "./CharacterPortrait";

interface CharacterGalleryProps {
  currentId: string | null;
  pendingId: string | null;
  onAdopt: (characterId: string) => void;
}

export function CharacterGallery({
  currentId,
  pendingId,
  onAdopt,
}: CharacterGalleryProps) {
  const { dict, locale } = useI18n();
  const lang = locale as Locale;
  const characters = [...listCharacters()].sort(
    (a, b) =>
      Number(isAvailableCharacter(b.id)) - Number(isAvailableCharacter(a.id)),
  );

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {characters.map((character) => {
        const available = isAvailableCharacter(character.id);
        const isCurrent = character.id === currentId;
        const isPending = character.id === pendingId;

        return (
          <li key={character.id}>
            <button
              type="button"
              disabled={!available || isCurrent || pendingId !== null}
              onClick={() => onAdopt(character.id)}
              aria-pressed={isCurrent}
              className={`flex w-full flex-col gap-2 rounded-2xl border p-2 text-left transition ${
                isCurrent
                  ? "border-highlight bg-highlight/10"
                  : "border-sidebar-foreground/10 hover:border-sidebar-foreground/30"
              } disabled:cursor-default ${available ? "" : "opacity-60"} ${
                isPending ? "animate-pulse" : ""
              }`}
            >
              <CharacterPortrait
                character={character}
                locale={lang}
                sizes="(min-width: 640px) 200px, 45vw"
                className="aspect-square w-full rounded-xl"
              />
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
                  ) : available ? (
                    `${character.rights.author}, ${character.rights.firstPublished}`
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

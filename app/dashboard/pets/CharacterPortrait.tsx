import Image from "next/image";
import { Lock } from "lucide-react";
import type { CharacterMood, Locale, VirtualCharacter } from "@/lib/pets/types";

interface CharacterPortraitProps {
  character: VirtualCharacter;
  locale: Locale;
  sizes: string;
  className?: string;
  priority?: boolean;
  /** Shows this mood's close-up face instead, when the companion has face art. */
  mood?: CharacterMood;
}

/**
 * Locked studio characters never render artwork — only a neutral tile with
 * their initial — so no studio design is ever displayed.
 */
export function CharacterPortrait({
  character,
  locale,
  sizes,
  className = "",
  priority = false,
  mood,
}: CharacterPortraitProps) {
  const name = character.name[locale];
  const face = mood ? character.layers?.faces?.[mood] : undefined;

  if (!character.artwork) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-sidebar-accent text-sidebar-foreground/50 ${className}`}
        aria-hidden="true"
      >
        <span className="text-3xl font-semibold">{name.charAt(0)}</span>
        <Lock className="absolute right-2 top-2 h-4 w-4" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-sidebar-accent ${className}`}>
      <Image
        src={face ?? character.artwork}
        alt={name}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}

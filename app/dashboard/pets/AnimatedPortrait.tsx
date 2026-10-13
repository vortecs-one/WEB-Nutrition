"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import type { CharacterMood, Locale, VirtualCharacter } from "@/lib/pets/types";
import { getAnimationProfile } from "@/lib/pets/animations";
import { CharacterPortrait } from "./CharacterPortrait";

interface AnimatedPortraitProps {
  character: VirtualCharacter;
  mood: CharacterMood;
  locale: Locale;
  petLabel: string;
  sizes: string;
  className?: string;
}

const LEAVES = [
  { left: "12%", delay: "0s", duration: "7s" },
  { left: "38%", delay: "2.4s", duration: "8.5s" },
  { left: "64%", delay: "1.1s", duration: "6.5s" },
  { left: "84%", delay: "3.6s", duration: "9s" },
];

const HEARTS = [
  { left: "38%", delay: "0s" },
  { left: "52%", delay: "0.12s" },
  { left: "64%", delay: "0.24s" },
];

/**
 * Animates the existing artwork with CSS transforms only (breathing, sway,
 * mood-specific idle, tap hop). Falls back to the static portrait for
 * characters without an animation profile. All motion is disabled under
 * prefers-reduced-motion in globals.css.
 */
export function AnimatedPortrait({
  character,
  mood,
  locale,
  petLabel,
  sizes,
  className = "",
}: AnimatedPortraitProps) {
  const [tapCount, setTapCount] = useState(0);
  const profile = getAnimationProfile(character.id, mood);

  if (!profile) {
    return (
      <CharacterPortrait
        character={character}
        locale={locale}
        sizes={sizes}
        priority
        className={className}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTapCount((n) => n + 1)}
      aria-label={petLabel}
      className={`pet-anim group relative overflow-hidden rounded-2xl bg-sidebar-accent outline-none focus-visible:ring-2 focus-visible:ring-highlight ${className}`}
      data-idle={profile.idle}
    >
      <span aria-hidden="true" className="pet-shadow" />

      <span
        key={tapCount}
        className={`absolute inset-0 block ${tapCount > 0 ? "pet-hop" : ""}`}
      >
        <span className="pet-body absolute inset-0 block">
          <CharacterPortrait
            character={character}
            locale={locale}
            sizes={sizes}
            priority
            className="h-full w-full"
          />
        </span>
      </span>

      {profile.particle === "leaf" &&
        LEAVES.map((leaf) => (
          <span
            key={leaf.left}
            aria-hidden="true"
            className="pet-leaf"
            style={{
              left: leaf.left,
              animationDelay: leaf.delay,
              animationDuration: leaf.duration,
            }}
          />
        ))}

      {profile.particle === "zzz" &&
        [0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pet-zzz"
            style={{ animationDelay: `${i * 1.2}s` }}
          >
            z
          </span>
        ))}

      {tapCount > 0 &&
        HEARTS.map((heart) => (
          <Heart
            key={`${tapCount}-${heart.left}`}
            aria-hidden="true"
            className="pet-heart h-5 w-5 fill-highlight text-highlight"
            style={{ left: heart.left, animationDelay: heart.delay }}
          />
        ))}
    </button>
  );
}

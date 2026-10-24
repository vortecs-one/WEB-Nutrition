"use client";

import { useState } from "react";
import Image from "next/image";
import { Heart } from "lucide-react";
import type { CharacterMood, Locale, VirtualCharacter } from "@/lib/pets/types";
import { getAnimationProfile } from "@/lib/pets/animations";
import { CharacterPortrait } from "./CharacterPortrait";
import { IceFloor } from "./IceFloor";

interface AnimatedPortraitProps {
  character: VirtualCharacter;
  mood: CharacterMood;
  locale: Locale;
  petLabel: string;
  sizes: string;
  className?: string;
}

// Where falling leaves (or snowflakes) start, across the top of the stage.
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
  const profile = getAnimationProfile(character, mood);
  const layers = character.layers;

  if (!profile || !layers) {
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

  // The background-free character stands on a soft glow. Only the body
  // moves; when the art has a ground split, the ground stays put in front of
  // it, with ground filled in behind the legs for when it jumps. Art without
  // ground layers stands on the scene's drawn floor instead (the ice floe),
  // which sits under everything else and gets room below the feet for its
  // edge and the water, so the stage is a little higher and smaller.
  const floor = layers.ground ? null : profile.floor;
  const rustle = tapCount > 0 && profile.groundRustle ? "pet-rustle" : "";
  // The ground goes over the body (grass the grazing head dips into) or under
  // it (ice the jumping feet and tail must stay in front of). Either way it
  // stays above the shadow and below the particles and hearts.
  const bodyLayer = profile.groundInFront ? "" : "z-[2]";
  const groundLayer = profile.groundInFront ? "z-[2]" : "z-[1]";
  // All layers share one box so they line up pixel for pixel.
  const stageBox = floor
    ? "absolute inset-x-[6%] bottom-[10%] top-[4%] block"
    : "absolute inset-x-[6%] bottom-[4%] top-[8%] block";
  const layerImage = (src: string, alt = "") => (
    <Image src={src} alt={alt} fill sizes={sizes} priority className="object-contain object-bottom" />
  );

  return (
    <button
      type="button"
      onClick={() => setTapCount((n) => n + 1)}
      aria-label={petLabel}
      className={`pet-anim pet-stage group relative overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-highlight ${className}`}
      data-idle={profile.idle}
      data-floor={floor ?? undefined}
    >
      {floor === "ice" && <IceFloor className={`${stageBox} pointer-events-none`} />}
      {/* The shadow stays on the ground and shrinks while the pet jumps. */}
      <span
        key={`shadow-${tapCount}`}
        aria-hidden="true"
        className={`pet-shadow ${tapCount > 0 ? "pet-shadow-hop" : ""}`}
      />
      {/* Ground behind the legs: hidden by the body at rest, it fills the
          gaps in the ground while the pet is in the air. */}
      {layers.back && (
        <span
          key={`back-${tapCount}`}
          aria-hidden="true"
          className={`${stageBox} pointer-events-none ${rustle}`}
        >
          {layerImage(layers.back)}
        </span>
      )}
      <span key={tapCount} className={`${stageBox} ${bodyLayer} ${tapCount > 0 ? "pet-hop" : ""}`}>
        <span className="pet-body absolute inset-0 block">
          <span className={`pet-${profile.motion} absolute inset-0 block`}>
            {layerImage(layers.body, character.name[locale])}
          </span>
        </span>
      </span>
      {layers.ground && (
        <span
          key={`ground-${tapCount}`}
          aria-hidden="true"
          className={`${stageBox} pointer-events-none ${groundLayer} ${rustle}`}
        >
          {layerImage(layers.ground)}
        </span>
      )}

      {(profile.particle === "leaf" || profile.particle === "snow") &&
        LEAVES.map((leaf) => (
          <span
            key={leaf.left}
            aria-hidden="true"
            className={profile.particle === "snow" ? "pet-snow" : "pet-leaf"}
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

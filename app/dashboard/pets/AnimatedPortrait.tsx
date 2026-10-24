"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Heart } from "lucide-react";
import type { GlucoseStatus } from "@/lib/glucose/types";
import type { CharacterMood, Locale, PetPose, VirtualCharacter } from "@/lib/pets/types";
import { getAnimationProfile } from "@/lib/pets/animations";
import { CharacterPortrait } from "./CharacterPortrait";
import { IceFloor } from "./IceFloor";

interface AnimatedPortraitProps {
  character: VirtualCharacter;
  mood: CharacterMood;
  /** Full-body pose, for companions with pose art (the default body otherwise). */
  pose?: PetPose;
  locale: Locale;
  petLabel: string;
  sizes: string;
  className?: string;
  /** Glucose status whose color rings the pet (neon rim + halo); none when null. */
  aura?: GlucoseStatus | null;
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

// Length of the hop (keep in sync with pet-hop in globals.css). The jumping
// pose (when the companion has one) goes back at about the landing contact.
const HOP_MS = 800;
const JUMP_POSE_MS = HOP_MS * 0.85;

/**
 * Animates the existing artwork with CSS transforms only (breathing, sway,
 * mood-specific idle, tap hop). Falls back to the static portrait for
 * characters without an animation profile. All motion is disabled under
 * prefers-reduced-motion in globals.css. With an `aura`, the pet gets a neon
 * rim and a breathing halo in that glucose status's color (also in
 * globals.css). Companions with pose art show the given `pose`, cross-fading
 * when it changes, and jump for joy when tapped.
 */
export function AnimatedPortrait({
  character,
  mood,
  pose,
  locale,
  petLabel,
  sizes,
  className = "",
  aura = null,
}: AnimatedPortraitProps) {
  const [tapCount, setTapCount] = useState(0);
  const [jumping, setJumping] = useState(false);
  const [airborne, setAirborne] = useState(false);
  // Hops so far; the floe's landing bob alternates between two identical
  // keyframes by parity, which restarts it for each hop.
  const [hops, setHops] = useState(0);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (jumpTimer.current) clearTimeout(jumpTimer.current);
    if (hopTimer.current) clearTimeout(hopTimer.current);
  }, []);
  const profile = getAnimationProfile(character, mood);
  const layers = character.layers;
  const poses = layers?.poses;
  const shownPose = jumping && poses?.jumping ? "jumping" : pose;
  const bodySrc = (shownPose && poses?.[shownPose]) || layers?.body || "";
  // A new pose fades in over the previous one, which stays underneath until
  // the new one has loaded and faded in (no gap while it downloads).
  const [bodies, setBodies] = useState({ current: bodySrc, previous: null as string | null, loaded: false });
  if (bodies.current !== bodySrc) {
    setBodies({ current: bodySrc, previous: bodies.current, loaded: false });
  }

  // A tap while already in the air only adds hearts and extends the jumping
  // pose: restarting the hop mid-air would snap the pet back to the ground.
  // Swaps into or out of the jumping pose cross-fade quickly, to keep up with the hop.
  const jumpSrc = poses?.jumping;
  const poseIn =
    jumpSrc && (bodies.current === jumpSrc || bodies.previous === jumpSrc)
      ? "pet-pose-in pet-pose-in-fast"
      : "pet-pose-in";

  function handleTap() {
    setTapCount((n) => n + 1);
    if (!airborne) {
      setAirborne(true);
      setHops((n) => n + 1);
      hopTimer.current = setTimeout(() => setAirborne(false), HOP_MS);
    }
    if (!poses?.jumping) return;
    setJumping(true);
    if (jumpTimer.current) clearTimeout(jumpTimer.current);
    jumpTimer.current = setTimeout(() => setJumping(false), JUMP_POSE_MS);
  }

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
  // On the ice, the floe, the pet and its shadow all dip together when the pet
  // lands (see pet-bob in globals.css).
  const bob = floor === "ice" && hops > 0 ? (hops % 2 ? "pet-bob-a" : "pet-bob-b") : "";
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
      onPointerDown={handleTap}
      // Pointer taps already fired on press; click only covers the keyboard.
      onClick={(e) => {
        if (e.detail === 0) handleTap();
      }}
      aria-label={petLabel}
      className={`pet-anim pet-stage group relative overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-highlight ${className}`}
      data-idle={profile.idle}
      data-floor={floor ?? undefined}
      data-aura={aura ?? undefined}
    >
      {floor === "ice" && <IceFloor className={`${stageBox} pointer-events-none`} bob={bob} />}
      {/* Above the floor, below the shadow, the pet and the particles. */}
      {aura && <span aria-hidden="true" className="pet-aura" />}
      {/* The shadow stays on the ground and shrinks while the pet jumps. */}
      <span aria-hidden="true" className={`pet-bob-box ${bob}`}>
        <span className={`pet-shadow ${airborne ? "pet-shadow-hop" : ""}`} />
      </span>
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
      <span className={`${stageBox} ${bodyLayer} ${bob}`}>
        <span className={`absolute inset-0 block ${airborne ? "pet-hop" : ""}`}>
          <span className="pet-body absolute inset-0 block">
            <span className={`pet-${profile.motion} absolute inset-0 block`}>
              {bodies.previous && (
                <span aria-hidden="true" className="pet-pose-prev absolute inset-0 block">
                  {layerImage(bodies.previous)}
                </span>
              )}
              <span
                key={bodies.current}
                className={`absolute inset-0 block ${
                  bodies.previous ? (bodies.loaded ? poseIn : "opacity-0") : ""
                }`}
                onAnimationEnd={(e) => {
                  if (e.animationName === "pet-pose-in") setBodies((b) => ({ ...b, previous: null }));
                }}
              >
                <Image
                  src={bodies.current}
                  alt={character.name[locale]}
                  fill
                  sizes={sizes}
                  priority
                  className="object-contain object-bottom"
                  onLoad={() => setBodies((b) => (b.loaded ? b : { ...b, loaded: true }))}
                />
              </span>
            </span>
          </span>
        </span>
      </span>
      {/* Preloads the jumping pose so the first tap doesn't wait on the download. */}
      {jumpSrc && jumpSrc !== bodies.current && jumpSrc !== bodies.previous && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0">
          {layerImage(jumpSrc)}
        </span>
      )}
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

      {profile.emote === "zzz" &&
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

      {(profile.emote === "exclaim" || profile.emote === "question") && (
        <span key={profile.emote} aria-hidden="true" className={`pet-emote pet-emote-${profile.emote}`}>
          {profile.emote === "exclaim" ? "!" : "?"}
        </span>
      )}

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

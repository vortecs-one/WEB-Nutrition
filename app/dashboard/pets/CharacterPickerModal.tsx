"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";
import { CharacterGallery } from "./CharacterGallery";
import { useCompanion } from "./use-companion";

interface CharacterPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a character was adopted successfully. */
  onAdopted: () => void;
}

// "Available characters" popup: choosing the first companion or switching to
// another one. Opened from the companion card, or from the "Change companion"
// button over the portrait in the detail popup.
export function CharacterPickerModal({
  isOpen,
  onClose,
  onAdopted,
}: CharacterPickerModalProps) {
  const { dict } = useI18n();
  const { companion, adopt, exclusiveAccess } = useCompanion();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdopt(characterId: string) {
    setPendingId(characterId);
    setError(null);
    const ok = await adopt(characterId);
    setPendingId(null);
    if (ok) onAdopted();
    else setError(dict.pets.errorGeneric);
  }

  function handleClose() {
    setError(null);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={dict.pets.galleryTitle} size="lg">
      <div className="flex flex-col gap-3">
        <CharacterGallery
          currentId={companion?.characterId ?? null}
          pendingId={pendingId}
          exclusiveAccess={exclusiveAccess}
          onAdopt={handleAdopt}
        />
        <p className="text-xs leading-relaxed text-sidebar-foreground/60">
          {dict.pets.rightsNote} {dict.pets.lockedNote}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

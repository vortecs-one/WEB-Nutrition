"use client";

// Insulin pump page: the MiniMed 780G with its Guardian 3 sensor, whose data
// reaches CareLink through the MiniMed app. CareLink has no live connection,
// so for now this page holds the CSV import (sensor readings only). Pump
// events — boluses, basal, carbs, set changes — are left for when a real
// export confirms the CSV columns (see lib/glucose/carelink-csv.ts).

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Droplet, Loader2, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { saveGlucoseSettings } from "@/lib/glucose/actions";
import type { GlucoseRole, GlucoseSettings } from "@/lib/glucose/types";
import GlucoseRoleBadge from "../glucose/GlucoseRoleBadge";
import CareLinkImport from "./CareLinkImport";

export default function PumpDashboard({
  initialSettings,
  role,
}: {
  initialSettings: GlucoseSettings | null;
  role: GlucoseRole;
}) {
  const { dict } = useI18n();
  const t = dict.glucose;

  const [settings, setSettings] = useState<GlucoseSettings | null>(initialSettings);
  const isOwner = (settings?.role ?? role) === "owner";
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(false);

  // Importing doesn't change the active sensor (live LibreLinkUp keeps
  // working while both are in use), so offer the switch once there's data.
  const otherSensor =
    settings?.source === "librelinkup"
      ? t.sourceLibre
      : settings?.source === "nightscout"
        ? t.sourceNightscout
        : null;
  const offerSwitch = isOwner && otherSensor !== null && (settings?.careLinkReadingCount ?? 0) > 0;

  // Same save the sensor picker does; it keeps the other sources' logins,
  // so switching back needs no password.
  const handleUseGuardian = async () => {
    setSwitching(true);
    setSwitchError(false);
    const result = await saveGlucoseSettings({ source: "carelink" }).catch(() => null);
    setSwitching(false);
    if (result?.ok) {
      setSettings(result.settings);
    } else {
      setSwitchError(true);
    }
  };

  const card = "bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-4 sm:p-5";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3">
      {/* Users have no menu on small screens, so the way back lives here. */}
      <Link
        href="/dashboard/calories"
        className="inline-flex items-center gap-1 rounded-full py-1.5 pl-1 pr-3 text-sm font-medium text-muted-foreground hover:text-foreground transition"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {t.pump.back}
      </Link>

      {/* Devices */}
      <section className={card}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
            <Droplet className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">{t.pump.title}</h1>
              <GlucoseRoleBadge role={settings?.role ?? role} />
            </div>
            <p className="mt-0.5 text-sm text-sidebar-foreground/70 text-pretty">
              {t.pump.devices}
            </p>
          </div>
        </div>
      </section>

      {offerSwitch && (
        <section className={`${card} space-y-3`}>
          <p className="text-sm text-pretty">
            {t.pump.useAsSensorPrompt.replace("{sensor}", otherSensor)}
          </p>
          <button
            type="button"
            onClick={handleUseGuardian}
            disabled={switching}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none"
          >
            {switching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t.pump.useAsSensorButton}
          </button>
          {switchError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.pump.useAsSensorError}</span>
            </div>
          )}
        </section>
      )}

      <section className={card}>
        <CareLinkImport settings={settings} isOwner={isOwner} onSaved={setSettings} />
      </section>

      {/* Placeholder until the real export confirms the pump columns. */}
      <section className={card}>
        <h2 className="text-base font-semibold">{t.pump.dataTitle}</h2>
        <p className="mt-1 text-sm text-sidebar-foreground/70 text-pretty">{t.pump.dataSoon}</p>
      </section>
    </div>
  );
}

"use client";

// Insulin pump popup (MiniMed 780G + Guardian 3 via CareLink), opened from
// the Pump button on the glucose card. It shows the live device status the
// CareLink connection reports (pump and sensor levels), time in range for the
// period picked here, and the CSV import as a backfill.

import { useState } from "react";
import {
  Activity,
  BatteryFull,
  BatteryMedium,
  CalendarClock,
  Droplet,
  Loader2,
  Timer,
  XCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/provider";
import { saveGlucoseSettings } from "@/lib/glucose/actions";
import {
  type CareLinkStatus,
  type GlucoseReading,
  type GlucoseRole,
  type GlucoseSettings,
  formatGlucose,
  splitDuration,
  unitLabel,
} from "@/lib/glucose/types";
import GlucoseRangeSelector from "../glucose/GlucoseRangeSelector";
import GlucoseRoleBadge from "../glucose/GlucoseRoleBadge";
import CareLinkImport from "./CareLinkImport";
import DeviceGauge, { toneForPercent } from "./DeviceGauge";
import TimeInRange from "./TimeInRange";

const SENSOR_LIFE_MIN = 7 * 24 * 60;
const CALIBRATION_WINDOW_MIN = 12 * 60;
const RESERVOIR_CAPACITY_UNITS = 300;

export default function PumpModal({
  isOpen,
  onClose,
  settings,
  role,
  careLink,
  readings,
  ranges,
  rangeHours,
  rangeLabels,
  onRangeChange,
  onSettingsChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  settings: GlucoseSettings;
  role: GlucoseRole;
  /** Live status snapshot; null unless Guardian 3 is the active sensor. */
  careLink: CareLinkStatus | null;
  readings: GlucoseReading[];
  ranges: readonly number[];
  rangeHours: number;
  rangeLabels: Record<number, string>;
  onRangeChange: (hours: number) => void;
  /** Called with the saved settings after an import, delete or sensor switch. */
  onSettingsChange: (settings: GlucoseSettings) => void;
}) {
  const { dict, locale } = useI18n();
  const t = dict.glucose;
  const isOwner = role === "owner";
  const unit = settings.unit;

  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(false);

  // Importing doesn't change the active sensor, so offer the switch once
  // there's imported data and another sensor is the one in use.
  const otherSensor =
    settings.source === "librelinkup"
      ? t.sourceLibre
      : settings.source === "nightscout"
        ? t.sourceNightscout
        : null;
  const offerSwitch = isOwner && otherSensor !== null && settings.careLinkReadingCount > 0;

  const handleUseGuardian = async () => {
    setSwitching(true);
    setSwitchError(false);
    const result = await saveGlucoseSettings({ source: "carelink" }).catch(() => null);
    setSwitching(false);
    if (result?.ok) {
      onSettingsChange(result.settings);
    } else {
      setSwitchError(true);
    }
  };

  // The pump reports remaining sensor life at snapshot time; age it to now.
  const sensorLeftMin =
    careLink?.sensorMinutesLeft != null
      ? Math.max(0, careLink.sensorMinutesLeft - (Date.now() - careLink.fetchedAt) / 60_000)
      : null;
  const sensorLeft = splitDuration((sensorLeftMin ?? 0) * 60_000);
  const sensorPct =
    sensorLeftMin !== null ? Math.min(100, (sensorLeftMin / SENSOR_LIFE_MIN) * 100) : 0;
  const sensorInDays = sensorLeft.days > 0;

  const calibrationMin = careLink?.calibrationMinutesLeft ?? null;
  const calibrationInHours = calibrationMin !== null && calibrationMin >= 60;

  const reservoirPct =
    careLink?.reservoirPercent ??
    (careLink?.reservoirUnits != null
      ? Math.min(100, (careLink.reservoirUnits / RESERVOIR_CAPACITY_UNITS) * 100)
      : 0);

  const autoModeLabel = (mode: string) =>
    mode === "AUTO_BASAL"
      ? t.careLinkAutoModeOn
      : mode === "SAFE_BASAL"
        ? t.careLinkAutoModeSafe
        : mode === "FEATURE_OFF"
          ? t.careLinkAutoModeOff
          : mode.replace(/_/g, " ").toLowerCase();

  const updatedAt = careLink
    ? new Date(careLink.fetchedAt).toLocaleTimeString(locale, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const panel = "rounded-2xl bg-sidebar-accent p-4 sm:p-5";
  const panelTitle = "text-sm font-semibold";

  const hasPumpGauge =
    careLink &&
    (careLink.pumpBatteryPercent != null || careLink.reservoirUnits != null);
  const hasSensorGauge =
    careLink &&
    (careLink.transmitterBatteryPercent != null ||
      sensorLeftMin !== null ||
      calibrationMin !== null);

  const facts: { label: string; value: string }[] = careLink
    ? [
        careLink.activeInsulin != null
          ? { label: t.careLinkActiveInsulin, value: `${careLink.activeInsulin.toFixed(2)} U` }
          : null,
        careLink.autoMode
          ? { label: t.careLinkAutoMode, value: autoModeLabel(careLink.autoMode) }
          : null,
        careLink.lowLimit != null
          ? {
              label: t.careLinkLowLimit,
              value: `${formatGlucose(careLink.lowLimit, unit)} ${unitLabel(unit)}`,
            }
          : null,
        careLink.highLimit != null
          ? {
              label: t.careLinkHighLimit,
              value: `${formatGlucose(careLink.highLimit, unit)} ${unitLabel(unit)}`,
            }
          : null,
      ].filter((f): f is { label: string; value: string } => f !== null)
    : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.pump.title} size="lg">
      <div className="flex flex-col gap-4">
        {/* Identity */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <Droplet className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-sidebar-foreground/70 text-pretty">{t.pump.devices}</p>
            {updatedAt && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-sidebar-foreground/60">
                <span className="h-1.5 w-1.5 rounded-full bg-lime-400" aria-hidden="true" />
                {t.careLinkUpdatedAt.replace("{time}", updatedAt)}
              </p>
            )}
          </div>
          <GlucoseRoleBadge role={role} />
        </div>

        {offerSwitch && (
          <div className={`${panel} flex flex-col gap-3 sm:flex-row sm:items-center`}>
            <p className="flex-1 text-sm text-pretty">
              {t.pump.useAsSensorPrompt.replace("{sensor}", otherSensor)}
            </p>
            <button
              type="button"
              onClick={handleUseGuardian}
              disabled={switching}
              className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
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
          </div>
        )}

        {/* Device status */}
        <section aria-labelledby="pump-device-status" className="flex flex-col gap-3">
          <h3 id="pump-device-status" className="sr-only">
            {t.pump.deviceStatus}
          </h3>

          {!careLink ? (
            <p className={`${panel} text-sm text-sidebar-foreground/70 text-pretty`}>
              {settings.source === "carelink" ? t.careLinkNoStatus : t.pump.statusNeedsGuardian}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {hasPumpGauge && (
                <div className={panel}>
                  <h4 className={panelTitle}>{t.careLinkPump}</h4>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {careLink.pumpBatteryPercent != null && (
                      <DeviceGauge
                        icon={BatteryFull}
                        label={t.careLinkPumpBattery}
                        value={String(careLink.pumpBatteryPercent)}
                        unit="%"
                        pct={careLink.pumpBatteryPercent}
                        tone={toneForPercent(careLink.pumpBatteryPercent)}
                      />
                    )}
                    {careLink.reservoirUnits != null && (
                      <DeviceGauge
                        icon={Droplet}
                        label={t.careLinkReservoir}
                        value={careLink.reservoirUnits.toFixed(0)}
                        unit="U"
                        pct={reservoirPct}
                        tone={toneForPercent(reservoirPct)}
                      />
                    )}
                  </div>
                  {facts.length > 0 && (
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-sidebar-foreground/10 pt-3">
                      {facts.map((f) => (
                        <div key={f.label} className="min-w-0">
                          <dt className="text-xs text-sidebar-foreground/60">{f.label}</dt>
                          <dd className="text-sm font-semibold tabular-nums">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}

              {hasSensorGauge && (
                <div className={panel}>
                  <h4 className={panelTitle}>{t.careLinkSettingsTitle}</h4>
                  <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5">
                    {careLink.transmitterBatteryPercent != null && (
                      <DeviceGauge
                        icon={BatteryMedium}
                        label={t.careLinkTransmitterBattery}
                        value={String(careLink.transmitterBatteryPercent)}
                        unit="%"
                        pct={careLink.transmitterBatteryPercent}
                        tone={toneForPercent(careLink.transmitterBatteryPercent)}
                      />
                    )}
                    {sensorLeftMin !== null && (
                      <DeviceGauge
                        icon={CalendarClock}
                        label={t.pump.sensorLife}
                        value={
                          sensorLeftMin <= 0
                            ? "0"
                            : String(sensorInDays ? sensorLeft.days : sensorLeft.hours)
                        }
                        unit={sensorInDays ? t.pump.days : t.pump.hours}
                        pct={sensorPct}
                        tone={sensorLeftMin <= 0 ? "bad" : toneForPercent(sensorPct)}
                      />
                    )}
                    {calibrationMin !== null && (
                      <DeviceGauge
                        icon={Timer}
                        label={
                          calibrationMin === 0 ? t.careLinkCalibrationNow : t.careLinkNextCalibration
                        }
                        value={
                          calibrationInHours
                            ? String(Math.floor(calibrationMin / 60))
                            : String(Math.round(calibrationMin))
                        }
                        unit={calibrationInHours ? t.pump.hours : t.pump.minutes}
                        pct={(calibrationMin / CALIBRATION_WINDOW_MIN) * 100}
                        tone={calibrationMin === 0 ? "warn" : "ok"}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Time in range for the period shared with the chart */}
        <section aria-labelledby="pump-tir" className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="pump-tir" className={`${panelTitle} flex items-center gap-2`}>
              <Activity className="h-4 w-4 text-sidebar-foreground/60" aria-hidden="true" />
              {t.pump.timeInRange}
            </h3>
            <GlucoseRangeSelector
              ranges={ranges}
              value={rangeHours}
              onChange={onRangeChange}
              labels={rangeLabels}
              ariaLabel={t.pump.timeInRange}
            />
          </div>
          <div className="mt-4">
            <TimeInRange
              readings={readings}
              settings={settings}
              unit={unit}
              labels={{
                below: t.pump.below
                  .replace("{value}", formatGlucose(settings.targetLow, unit))
                  .replace("{unit}", unitLabel(unit)),
                inRange: t.statusInRange,
                above: t.pump.above
                  .replace("{value}", formatGlucose(settings.targetHigh, unit))
                  .replace("{unit}", unitLabel(unit)),
              }}
              emptyLabel={t.pump.noReadings}
              averageLabel={t.pump.average}
            />
          </div>
        </section>

        {/* CSV backfill */}
        <section className={panel}>
          <CareLinkImport settings={settings} isOwner={isOwner} onSaved={onSettingsChange} />
        </section>
      </div>
    </Modal>
  );
}

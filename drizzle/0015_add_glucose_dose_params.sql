-- Insulin dosing parameters (ratio, sensitivity, target range) kept per glucose
-- source, because they change with the sensor and the pump setup behind it.
-- Shape: { "carelink": { "ratio": 7, "isf": 35, "low": 100, "high": 120 }, ... }
-- (ratio in g per unit, glucose values in mg/dL). Sources without an entry
-- fall back to the app defaults.
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "dose_params" jsonb;

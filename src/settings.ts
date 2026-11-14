// The photographer's preferences, kept in api.settings and never in an edit:
// the meter mode, intensity and target set in the panel, the match target
// Measure stores, and Preferences ▸ Advanced Exposure's warning levels and
// shares.

import { clampTo, type Range } from "./model";
import { React, api } from "./rt";
import type { SettingsContribution } from "./safelight";

export type MeterMode = "average" | "centre" | "spot" | "highlights" | "ettr";
export const METER_MODES: readonly MeterMode[] = ["average", "centre", "spot", "highlights", "ettr"];

export const MODE_LABEL: Readonly<Record<MeterMode, string>> = {
  average: "Average",
  centre: "Centre-weighted",
  spot: "Spot weighted",
  highlights: "Highlight priority",
  ettr: "Expose to the right",
};

export const INTENSITIES = [25, 50, 75, 100] as const;
export type Intensity = (typeof INTENSITIES)[number];
export const INTENSITY_LABEL: Readonly<Record<Intensity, string>> = { 25: "Slight", 50: "Medium", 75: "Strong", 100: "Full" };

export const TARGET_RANGE: Required<Range> = { min: -4, max: 2, step: 0.1 };

export const KEYS = {
  mode: "meterMode",
  intensity: "intensity",
  target: "meterTarget",
  match: "matchTarget",
  highLevel: "highlightLevel",
  lowLevel: "shadowLevel",
  clipShare: "clipShare",
  ettrPercentile: "ettrPercentile",
} as const;

export interface Prefs {
  mode: MeterMode;
  intensity: Intensity;
  /** Stops from middle grey. */
  target: number;
  /** The scene luminance Measure stored, or null. */
  match: number | null;
  /** The highlight and shadow warning levels, 0–1 display values. */
  high: number;
  low: number;
  /** Share of pixels allowed past a warning level, 0–1. */
  clip: number;
  /** Expose to the right's percentile, 0–1. */
  ettr: number;
}

const num = (key: string, fallback: number, range: Range): number => {
  const v = api.settings.get<number>(key, fallback);
  return typeof v === "number" && Number.isFinite(v) ? clampTo(v, range) : fallback;
};

export function readPrefs(): Prefs {
  const mode = api.settings.get<string>(KEYS.mode, "average");
  const intensity = api.settings.get<number>(KEYS.intensity, 100);
  const match = api.settings.get<number>(KEYS.match, 0);
  return {
    mode: METER_MODES.find((m) => m === mode) ?? "average",
    intensity: INTENSITIES.find((i) => i === intensity) ?? 100,
    target: num(KEYS.target, 0, TARGET_RANGE),
    match: typeof match === "number" && match > 0 ? match : null,
    high: num(KEYS.highLevel, 250, { min: 128, max: 255 }) / 255,
    low: num(KEYS.lowLevel, 5, { min: 0, max: 127 }) / 255,
    clip: num(KEYS.clipShare, 0.1, { min: 0, max: 5 }) / 100,
    ettr: num(KEYS.ettrPercentile, 99.5, { min: 90, max: 100 }) / 100,
  };
}

/** The preferences, read again on every change from this window or another. */
export function usePrefs(): Prefs {
  const [prefs, setPrefs] = React.useState(readPrefs);
  React.useEffect(() => api.settings.onChange(() => setPrefs(readPrefs())), []);
  return prefs;
}

export const SETTINGS: SettingsContribution = {
  title: "Advanced Exposure",
  keywords: ["clipping", "warning", "auto exposure", "expose to the right", "whites", "blacks"],
  fields: [
    {
      key: KEYS.highLevel,
      label: "Highlight warning level",
      hint: "On the 0–255 scale: the clipping view and Auto treat a channel at or above this as clipped. 255 is pure white.",
      type: "number",
      default: 250,
      min: 128,
      max: 255,
      step: 1,
    },
    {
      key: KEYS.lowLevel,
      label: "Shadow warning level",
      hint: "On the 0–255 scale: the clipping view and Auto treat a pixel whose channels are all at or below this as crushed.",
      type: "number",
      default: 5,
      min: 0,
      max: 127,
      step: 1,
    },
    {
      key: KEYS.clipShare,
      label: "Auto clip share (%)",
      hint: "Shift+double-click on Whites, Blacks or Black level lets this share of the photo reach the warning level.",
      type: "number",
      default: 0.1,
      min: 0,
      max: 5,
      step: 0.05,
    },
    {
      key: KEYS.ettrPercentile,
      label: "Expose to the right percentile (%)",
      hint: "Expose to the right places this percentile of the photo's brightest channel on the highlight warning level.",
      type: "number",
      default: 99.5,
      min: 90,
      max: 100,
      step: 0.1,
    },
  ],
};

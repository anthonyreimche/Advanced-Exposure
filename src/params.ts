// The values the panel edits, all in the photo's (or a mask's) param bag
// under this extension's stages: the exposure stage at the tone anchor, the
// tone stage after it, and the clipping view's values, which only ever reach
// the live view.

import { DEFAULT_EXPOSURE, DEFAULT_TONE, EXPOSURE_RANGES, TONE_RANGES, clampTo, type Exposure, type Tone } from "./model";

export const EXT_ID = "advanced-exposure";
export const EXPOSURE_STAGE_ID = `${EXT_ID}.exposure`;
export const TONE_STAGE_ID = `${EXT_ID}.tone`;
export const THRESHOLD_STAGE_ID = `${EXT_ID}.threshold`;

export type ExposureKey = keyof Exposure;
export const EXPOSURE_KEYS: readonly ExposureKey[] = ["ev", "contrast", "highlights", "shadows", "whites", "blacks", "compression", "threshold"];
export const exposureKey = (key: ExposureKey): string => `${EXPOSURE_STAGE_ID}.${key}`;

export type ToneKey = keyof Tone;
export const TONE_KEYS: readonly ToneKey[] = ["black", "midtones"];
export const toneKey = (key: ToneKey): string => `${TONE_STAGE_ID}.${key}`;

/** The host's per-photo (or per-mask) bag, untyped: any extension writes it. */
type Bag = Readonly<Record<string, unknown>>;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function patch<K extends string>(values: Partial<Record<K, number>>, keys: readonly K[], qualify: (k: K) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) {
    const v = values[key];
    if (v !== undefined) out[qualify(key)] = v;
  }
  return out;
}

/** A missing, non-numeric or non-finite value reads as its default. */
export function readExposure(bag: Bag): Exposure {
  const out = { ...DEFAULT_EXPOSURE };
  for (const key of EXPOSURE_KEYS) {
    const v = bag[exposureKey(key)];
    if (finite(v)) out[key] = clampTo(v, EXPOSURE_RANGES[key]);
  }
  return out;
}
export const exposurePatch = (values: Partial<Exposure>): Record<string, number> => patch(values, EXPOSURE_KEYS, exposureKey);
export const exposureReset = (): Record<string, number> => exposurePatch(DEFAULT_EXPOSURE);

export function readTone(bag: Bag): Tone {
  const out = { ...DEFAULT_TONE };
  for (const key of TONE_KEYS) {
    const v = bag[toneKey(key)];
    if (finite(v)) out[key] = clampTo(v, TONE_RANGES[key]);
  }
  return out;
}
export const tonePatch = (values: Partial<Tone>): Record<string, number> => patch(values, TONE_KEYS, toneKey);
export const toneReset = (): Record<string, number> => tonePatch(DEFAULT_TONE);

/** The threshold view's values: what to show and at which levels (0–1 display). */
export type ThresholdMode = "off" | "highlights" | "shadows";

const MODE_INDEX: Readonly<Record<ThresholdMode, number>> = { off: 0, highlights: 1, shadows: 2 };

export function thresholdView(mode: ThresholdMode, levels: { high: number; low: number }): Record<string, number> {
  return {
    [`${THRESHOLD_STAGE_ID}.mode`]: MODE_INDEX[mode],
    [`${THRESHOLD_STAGE_ID}.high`]: levels.high,
    [`${THRESHOLD_STAGE_ID}.low`]: levels.low,
  };
}

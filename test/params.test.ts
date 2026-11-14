// Where each value lives: the exposure stage's and the tone stage's keys in
// the param bag, and the clipping view's values.

import { describe, expect, it } from "vitest";
import { DEFAULT_EXPOSURE } from "../src/model";
import {
  EXPOSURE_KEYS,
  TONE_KEYS,
  exposureKey,
  exposurePatch,
  exposureReset,
  readExposure,
  readTone,
  thresholdView,
  toneKey,
  tonePatch,
  toneReset,
} from "../src/params";

describe("the exposure stage's bag", () => {
  it("keys every value under the stage", () => {
    expect(EXPOSURE_KEYS.map(exposureKey)).toEqual([
      "advanced-exposure.exposure.ev",
      "advanced-exposure.exposure.contrast",
      "advanced-exposure.exposure.highlights",
      "advanced-exposure.exposure.shadows",
      "advanced-exposure.exposure.whites",
      "advanced-exposure.exposure.blacks",
      "advanced-exposure.exposure.compression",
      "advanced-exposure.exposure.threshold",
    ]);
  });

  it("reads defaults from an empty bag, stored values clamped, junk as defaults", () => {
    expect(readExposure({})).toEqual(DEFAULT_EXPOSURE);
    expect(readExposure({ [exposureKey("ev")]: 9, [exposureKey("threshold")]: 20, [exposureKey("whites")]: "5" })).toEqual({
      ...DEFAULT_EXPOSURE,
      ev: 5,
      threshold: 50,
    });
  });

  it("writes only what it is given, and resets everything", () => {
    expect(exposurePatch({ ev: 1.25 })).toEqual({ [exposureKey("ev")]: 1.25 });
    expect(exposureReset()).toEqual(Object.fromEntries(EXPOSURE_KEYS.map((k) => [exposureKey(k), DEFAULT_EXPOSURE[k]])));
  });
});

describe("the tone stage's bag", () => {
  it("keys Black level and Midtones under the stage", () => {
    expect(TONE_KEYS.map(toneKey)).toEqual(["advanced-exposure.tone.black", "advanced-exposure.tone.midtones"]);
  });

  it("reads, writes and resets", () => {
    expect(readTone({ [toneKey("black")]: 9, [toneKey("midtones")]: -1.25 })).toEqual({ black: 5, midtones: -1.25 });
    expect(tonePatch({ midtones: 0.5 })).toEqual({ [toneKey("midtones")]: 0.5 });
    expect(toneReset()).toEqual({ [toneKey("black")]: 0, [toneKey("midtones")]: 0 });
  });
});

describe("the threshold view", () => {
  it("names its mode as a number and carries the levels", () => {
    expect(thresholdView("highlights", { high: 0.98, low: 0.02 })).toEqual({
      "advanced-exposure.threshold.mode": 1,
      "advanced-exposure.threshold.high": 0.98,
      "advanced-exposure.threshold.low": 0.02,
    });
    expect(thresholdView("shadows", { high: 1, low: 0 })["advanced-exposure.threshold.mode"]).toBe(2);
  });
});

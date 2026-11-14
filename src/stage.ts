// The GPU side. The exposure stage is model.ts exposePixel on `lin`, linear
// Rec.709, at the tone anchor: after White Balance and ahead of the tone block
// (Basic's exposure and shoulder, when Basic is installed), so its exposure
// works before any tone mapping. The tone stage is tonePixel, in scene-linear,
// where masks can reach it. The threshold stage is a view aid: it draws only in
// the live view, from values setViewValues hands it, and turns the frame into
// the clipping view while a slider is dragged with Alt or Ctrl. The host
// rewrites every whole word that matches a uniform key, so no local shares
// one's name.

import { DEFAULT_EXPOSURE, EXPOSURE_RANGES, TONE_RANGES } from "./model";
import { EXPOSURE_KEYS, EXPOSURE_STAGE_ID, THRESHOLD_STAGE_ID, TONE_STAGE_ID, type ExposureKey } from "./params";
import type { ProcessingStageContribution } from "./safelight";

const EXPOSURE_HELPERS = `
float aeToneStops(float e0, float kc, float ks, float kh, float kw, float kb) {
  float e = e0 * (1.0 + 0.5 * kc);
  e += 1.5 * ks * (1.0 - smoothstep(-4.5, 0.0, e));
  e += 1.5 * kh * smoothstep(-1.0, 2.5, e);
  e += kw * smoothstep(1.5, 3.5, e);
  e += kb * (1.0 - smoothstep(-8.0, -3.5, e));
  return e;
}
`;

const EXPOSURE_GLSL = `
if (ev != 0.0 || contrast != 0.0 || highlights != 0.0 || shadows != 0.0 || whites != 0.0 || blacks != 0.0 || compression != 0.0) {
  float aeGain = exp2(clamp(ev, -5.0, 5.0));
  float aeL = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  bool aeShaped = contrast != 0.0 || highlights != 0.0 || shadows != 0.0 || whites != 0.0 || blacks != 0.0;
  if (aeShaped && aeL > 0.0) {
    float aeStops = log2(aeL * aeGain / 0.18);
    aeGain = 0.18 * exp2(aeToneStops(aeStops,
      clamp(contrast, -100.0, 100.0) / 100.0, clamp(shadows, -100.0, 100.0) / 100.0,
      clamp(highlights, -100.0, 100.0) / 100.0, clamp(whites, -100.0, 100.0) / 100.0,
      clamp(blacks, -100.0, 100.0) / 100.0)) / aeL;
  }
  lin *= aeGain;
  float aeAmount = clamp(compression, 0.0, 100.0) / 100.0;
  float aeKnee = clamp(threshold, 50.0, 95.0) / 100.0;
  float aePeak = max(max(lin.r, lin.g), lin.b);
  if (aeAmount > 0.0 && aePeak > aeKnee) {
    float aeRoom = 1.0 - aeKnee;
    float aeOver = aePeak - aeKnee;
    lin *= mix(1.0, (aeKnee + aeRoom * aeOver / (aeOver + aeRoom)) / aePeak, aeAmount);
  }
}`;

const EXPOSURE_LABELS: Readonly<Record<ExposureKey, string>> = {
  ev: "Exposure",
  contrast: "Contrast",
  highlights: "Highlights",
  shadows: "Shadows",
  whites: "Whites",
  blacks: "Blacks",
  compression: "Highlight compression",
  threshold: "Compression threshold",
};

export function exposureStage(): ProcessingStageContribution {
  return {
    id: EXPOSURE_STAGE_ID,
    name: "Advanced Exposure",
    phase: "scene-linear",
    priority: 10,
    anchor: "tone",
    glsl: EXPOSURE_GLSL.trimStart(),
    helpers: EXPOSURE_HELPERS,
    uniforms: EXPOSURE_KEYS.map((key) => ({
      key,
      glslType: "float",
      default: DEFAULT_EXPOSURE[key],
      range: EXPOSURE_RANGES[key],
      label: EXPOSURE_LABELS[key],
    })),
    dormantWhen: { ev: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, compression: 0 },
    presetScope: "global",
  };
}

const TONE_GLSL = `
if (black != 0.0 || midtones != 0.0) {
  float aeFloor = clamp(black, -2.0, 5.0) / 100.0;
  lin = (lin - vec3(aeFloor)) * (1.0 / (1.0 - aeFloor));
  float aeStops = clamp(midtones, -2.0, 2.0);
  float aeY = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  if (aeStops != 0.0 && aeY > 0.0) {
    float aeGamma = log(0.18 * exp2(aeStops)) / log(0.18);
    lin *= pow(aeY, aeGamma) / aeY;
  }
}`;

export function toneStage(): ProcessingStageContribution {
  return {
    id: TONE_STAGE_ID,
    name: "Advanced Exposure black level and midtones",
    phase: "scene-linear",
    priority: 10,
    glsl: TONE_GLSL.trimStart(),
    uniforms: [
      { key: "black", glslType: "float", default: 0, range: TONE_RANGES.black, label: "Black level" },
      { key: "midtones", glslType: "float", default: 0, range: TONE_RANGES.midtones, label: "Midtones" },
    ],
    dormantWhen: { black: 0, midtones: 0 },
    mask: { maskable: true },
    presetScope: "global",
  };
}

const THRESHOLD_GLSL = `
if (mode == 1) c = step(vec3(high), c);
else if (mode == 2) c = vec3(1.0) - step(c, vec3(low));`;

export function thresholdStage(): ProcessingStageContribution {
  return {
    id: THRESHOLD_STAGE_ID,
    name: "Advanced Exposure clipping view",
    phase: "output-encode",
    priority: 100000,
    // Declared although it is the display domain's own space: on a version 2
    // photo the host clips the input of a display stage that declares none.
    space: { encoding: "perceptual", primaries: "rec709" },
    glsl: THRESHOLD_GLSL.trimStart(),
    uniforms: [
      { key: "mode", glslType: "int", default: 0 },
      { key: "high", glslType: "float", default: 250 / 255 },
      { key: "low", glslType: "float", default: 5 / 255 },
    ],
    viewOnly: true,
    presetScope: "per-image",
  };
}

// The two stage contributions and their GLSL's static cost. Unit tests can't
// run the shader (npm run test:gpu does, on the real renderer); these hold the
// contract around it and the per-draw budget the hang watchdogs see.

import { describe, expect, it } from "vitest";
import { DEFAULT_EXPOSURE, EXPOSURE_RANGES, TONE_RANGES } from "../src/model";
import { EXPOSURE_KEYS, EXPOSURE_STAGE_ID, THRESHOLD_STAGE_ID, TONE_STAGE_ID } from "../src/params";
import { exposureStage, thresholdStage, toneStage } from "../src/stage";

const exposure = exposureStage();
const tone = toneStage();
const threshold = thresholdStage();

describe("exposureStage", () => {
  it("runs at the tone anchor, ahead of Basic's tone block (priority 100), in scene-linear", () => {
    expect([exposure.id, exposure.phase, exposure.anchor, exposure.priority]).toEqual([EXPOSURE_STAGE_ID, "scene-linear", "tone", 10]);
  });

  it("keeps to what the tone anchor allows any extension", () => {
    for (const field of ["passes", "space", "mask", "reads", "produces", "viewOnly"] as const) expect(exposure[field]).toBeUndefined();
  });

  it("declares its values with their defaults, ranges and labels", () => {
    expect(exposure.uniforms.map((u) => [u.key, u.default, u.range, u.label])).toEqual(
      EXPOSURE_KEYS.map((k) => [
        k,
        DEFAULT_EXPOSURE[k],
        EXPOSURE_RANGES[k],
        { ev: "Exposure", contrast: "Contrast", highlights: "Highlights", shadows: "Shadows", whites: "Whites", blacks: "Blacks", compression: "Highlight compression", threshold: "Compression threshold" }[k],
      ]),
    );
  });

  it("is dormant while everything but the threshold is at rest, and skips its block under the same rule", () => {
    expect(exposure.dormantWhen).toEqual({ ev: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, compression: 0 });
    expect(exposure.glsl.trim().startsWith(
      "if (ev != 0.0 || contrast != 0.0 || highlights != 0.0 || shadows != 0.0 || whites != 0.0 || blacks != 0.0 || compression != 0.0) {",
    )).toBe(true);
    expect(exposure.presetScope).toBe("global");
  });
});

describe("toneStage", () => {
  it("runs in scene-linear after the shoulder and ahead of the default priority", () => {
    expect([tone.id, tone.phase, tone.priority, tone.space]).toEqual([TONE_STAGE_ID, "scene-linear", 10, undefined]);
  });

  it("declares Black level and Midtones with their ranges and labels", () => {
    expect(tone.uniforms).toEqual([
      { key: "black", glslType: "float", default: 0, range: TONE_RANGES.black, label: "Black level" },
      { key: "midtones", glslType: "float", default: 0, range: TONE_RANGES.midtones, label: "Midtones" },
    ]);
  });

  it("is dormant at rest, skips its block under the same rule, and is maskable", () => {
    expect(tone.dormantWhen).toEqual({ black: 0, midtones: 0 });
    expect(tone.glsl.trim().startsWith("if (black != 0.0 || midtones != 0.0) {")).toBe(true);
    expect(tone.mask).toEqual({ maskable: true });
    expect(tone.presetScope).toBe("global");
  });

  it("clamps its values as readTone does, since the host binds the bag unchecked", () => {
    expect(tone.glsl).toContain("clamp(black, -2.0, 5.0)");
    expect(tone.glsl).toContain("clamp(midtones, -2.0, 2.0)");
  });
});

describe("thresholdStage", () => {
  it("is a view aid at the very end, in the display encoding, never in presets", () => {
    expect(threshold).toMatchObject({
      id: THRESHOLD_STAGE_ID,
      phase: "output-encode",
      priority: 100000,
      viewOnly: true,
      space: { encoding: "perceptual", primaries: "rec709" },
      presetScope: "per-image",
    });
  });

  it("stays in the live program behind its mode, so it shows in the next frame", () => {
    expect(threshold.dormantWhen).toBeUndefined();
    expect(threshold.mask).toBeUndefined();
    expect(threshold.uniforms).toEqual([
      { key: "mode", glslType: "int", default: 0 },
      { key: "high", glslType: "float", default: 250 / 255 },
      { key: "low", glslType: "float", default: 5 / 255 },
    ]);
  });

  it("lights clipped channels on black, or crushed ones on white", () => {
    expect(threshold.glsl).toContain("if (mode == 1) c = step(vec3(high), c);");
    expect(threshold.glsl).toContain("else if (mode == 2) c = vec3(1.0) - step(c, vec3(low));");
  });
});

describe("per-draw cost", () => {
  for (const stage of [exposure, tone, threshold]) {
    const code = `${stage.helpers ?? ""}\n${stage.glsl}`;
    it(`${stage.id}: no passes, no textures, no loops, zero fetches per pixel`, () => {
      expect(stage.passes).toBeUndefined();
      expect(stage.textures).toBeUndefined();
      expect(code).not.toMatch(/\b(texture|textureLod|texelFetch|textureGrad|textureProj)\s*\(/);
      expect(code).not.toMatch(/\bstageResult\b/);
      expect(code).not.toMatch(/\b(for|while)\s*\(/);
    });

    it(`${stage.id}: names no local after a uniform key (the host rewrites those words)`, () => {
      const declared = [...code.matchAll(/\b(?:float|vec3|bool|int)\s+([A-Za-z_]\w*)/g)].map((m) => m[1]);
      for (const u of stage.uniforms) expect(declared).not.toContain(u.key);
    });
  }
});

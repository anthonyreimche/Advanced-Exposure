// The own stage's maths and the solvers, as docs/SPEC.md states them. The CPU
// twin here is what the GPU spec holds the shader to.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPOSURE,
  DEFAULT_TONE,
  MIDDLE_GREY,
  TONE_RANGES,
  bisect,
  clampTo,
  exposePixel,
  luminance,
  midtoneGamma,
  newtonStops,
  tonePixel,
  type Exposure,
  type Rgb,
} from "../src/model";

describe("tonePixel", () => {
  it("changes nothing at rest", () => {
    for (const c of [[0, 0, 0], [0.18, 0.18, 0.18], [2, 0.5, -0.1], [0.9, 0.3, 0.05]] as Rgb[]) {
      expect(tonePixel(c, DEFAULT_TONE)).toEqual(c);
    }
  });

  it("maps the black level to black and keeps white", () => {
    const b = 0.03;
    expect(tonePixel([b, b, b], { black: 3, midtones: 0 })).toEqual([0, 0, 0]);
    for (const v of tonePixel([1, 1, 1], { black: 3, midtones: 0 })) expect(v).toBeCloseTo(1, 12);
    for (const v of tonePixel([0, 0, 0], { black: -1, midtones: 0 })) expect(v).toBeCloseTo(0.01 / 1.01, 12);
  });

  it("moves middle grey by exactly the midtones in stops, keeping black and white", () => {
    for (const m of [-2, -0.5, 0.75, 2]) {
      const [g] = tonePixel([MIDDLE_GREY, MIDDLE_GREY, MIDDLE_GREY], { black: 0, midtones: m });
      expect(Math.log2(g / MIDDLE_GREY)).toBeCloseTo(m, 10);
      for (const v of tonePixel([1, 1, 1], { black: 0, midtones: m })) expect(v).toBeCloseTo(1, 12);
      expect(tonePixel([0, 0, 0], { black: 0, midtones: m })).toEqual([0, 0, 0]);
    }
  });

  it("scales the colour by its luminance's change, keeping channel ratios", () => {
    const c: Rgb = [0.4, 0.2, 0.1];
    const out = tonePixel(c, { black: 0, midtones: 1 });
    expect(out[1] / out[0]).toBeCloseTo(0.5, 12);
    expect(out[2] / out[0]).toBeCloseTo(0.25, 12);
    expect(luminance(out)).toBeCloseTo(luminance(c) ** midtoneGamma(1), 12);
  });

  it("leaves a colour without positive luminance after the black level as it is then", () => {
    expect(tonePixel([-0.2, 0.01, 0], { black: 0, midtones: 1 })).toEqual([-0.2, 0.01, 0]);
  });

  it("clamps out-of-range values as the shader does", () => {
    const c: Rgb = [0.3, 0.3, 0.3];
    expect(tonePixel(c, { black: 50, midtones: 9 })).toEqual(tonePixel(c, { black: TONE_RANGES.black.max, midtones: TONE_RANGES.midtones.max }));
  });

  it("has the gamma that puts grey where the stops say", () => {
    expect(midtoneGamma(0)).toBe(1);
    expect(MIDDLE_GREY ** midtoneGamma(1)).toBeCloseTo(0.36, 12);
  });
});

describe("solvers", () => {
  it("newtonStops converges on a value that grows with exposure through a shoulder", async () => {
    const shoulder = (x: number) => (x < 0.8 ? x : 0.8 + (0.2 * (x - 0.8)) / (x - 0.8 + 0.3));
    const measure = async (ev: number) => shoulder(0.05 * 2 ** ev);
    const result = await newtonStops(measure, 0, 0.5, { tolerance: 0.01, maxSteps: 4, range: { min: -5, max: 5 } });
    expect(Math.abs(Math.log2((await measure(result.ev)) / 0.5))).toBeLessThan(0.01);
    expect(result.steps).toBeLessThanOrEqual(4);
  });

  it("newtonStops stops at the range's end", async () => {
    const result = await newtonStops(async (ev) => 0.001 * 2 ** ev, 0, 0.5, { tolerance: 0.01, maxSteps: 4, range: { min: -5, max: 5 } });
    expect(result.ev).toBe(5);
  });

  it("bisect finds the last value whose measure stays within the limit", async () => {
    const result = await bisect(async (v) => v * v, { lo: 0, hi: 10, limit: 20, steps: 20 });
    expect(result).toBeCloseTo(Math.sqrt(20), 3);
    expect(await bisect(async () => 100, { lo: 0, hi: 10, limit: 20, steps: 10 })).toBe(0);
    expect(await bisect(async () => 0, { lo: 0, hi: 10, limit: 20, steps: 10 })).toBe(10);
  });

  it("bisect searches downwards when the measure falls as the value grows", async () => {
    const result = await bisect(async (v) => 10 - v, { lo: 0, hi: 10, limit: 4, steps: 20, falling: true });
    expect(result).toBeCloseTo(6, 3);
  });

  it("clampTo holds a value in its range", () => {
    expect(clampTo(7, { min: -5, max: 5 })).toBe(5);
    expect(clampTo(-7, { min: -5, max: 5 })).toBe(-5);
  });
});

describe("exposePixel", () => {
  const p = (over: Partial<Exposure>): Exposure => ({ ...DEFAULT_EXPOSURE, ...over });
  const grey = (v: number): Rgb => [v, v, v];
  const stopsFromGrey = (rgb: Rgb) => Math.log2(luminance(rgb) / MIDDLE_GREY);

  it("changes nothing at rest, whatever the threshold", () => {
    for (const c of [[0, 0, 0], [0.18, 0.18, 0.18], [2, 0.5, -0.1], [0.9, 0.3, 0.05]] as Rgb[]) {
      expect(exposePixel(c, p({ threshold: 60 }))).toEqual(c);
    }
  });

  it("is a gain of exactly 2^ev on its own, before any tone mapping", () => {
    for (const ev of [-5, -1.3, 0.01, 2.5, 5]) {
      const out = exposePixel([0.4, 0.18, 0.02], p({ ev }));
      expect(out[0]).toBeCloseTo(0.4 * 2 ** ev, 10);
      expect(out[2]).toBeCloseTo(0.02 * 2 ** ev, 10);
    }
  });

  it("scales stops about middle grey for Contrast, leaving grey put", () => {
    expect(stopsFromGrey(exposePixel(grey(0.18), p({ contrast: 80 })))).toBeCloseTo(0, 10);
    expect(stopsFromGrey(exposePixel(grey(0.72), p({ contrast: 100 })))).toBeCloseTo(3, 10);
    expect(stopsFromGrey(exposePixel(grey(0.045), p({ contrast: -100 })))).toBeCloseTo(-1, 10);
  });

  it("moves each band by up to its stops, fading out away from it", () => {
    const at = (stops: number, over: Partial<Exposure>) => stopsFromGrey(exposePixel(grey(MIDDLE_GREY * 2 ** stops), p(over))) - stops;
    expect(at(-6, { shadows: 100 })).toBeCloseTo(1.5, 10);
    expect(at(1, { shadows: 100 })).toBeCloseTo(0, 10);
    expect(at(3, { highlights: -100 })).toBeCloseTo(-1.5, 10);
    expect(at(-2, { highlights: -100 })).toBeCloseTo(0, 10);
    expect(at(4, { whites: 100 })).toBeCloseTo(1, 10);
    expect(at(1, { whites: 100 })).toBeCloseTo(0, 10);
    expect(at(-9, { blacks: -100 })).toBeCloseTo(-1, 10);
    expect(at(-3, { blacks: -100 })).toBeCloseTo(0, 10);
  });

  it("keeps brightness in order at every extreme together", () => {
    for (const over of [
      { contrast: -100, shadows: 100, highlights: -100, whites: -100, blacks: 100 },
      { contrast: 100, shadows: -100, highlights: 100, whites: 100, blacks: -100 },
    ]) {
      let last = -Infinity;
      for (let stops = -12; stops <= 6; stops += 0.05) {
        const [v] = exposePixel(grey(MIDDLE_GREY * 2 ** stops), p(over));
        expect(v).toBeGreaterThan(last);
        last = v;
      }
    }
  });

  it("keeps hue: every channel scaled by one ratio", () => {
    const out = exposePixel([0.4, 0.2, 0.1], p({ ev: 0.7, contrast: 30, shadows: 40 }));
    expect(out[1] / out[0]).toBeCloseTo(0.5, 12);
    expect(out[2] / out[0]).toBeCloseTo(0.25, 12);
  });

  it("rolls the brightest channel off from the threshold towards white with Highlight compression", () => {
    const full = exposePixel(grey(3), p({ compression: 100, threshold: 80 }));
    expect(full[0]).toBeLessThan(1);
    expect(full[0]).toBeGreaterThan(0.8);
    expect(exposePixel(grey(0.7), p({ compression: 100, threshold: 80 }))).toEqual(grey(0.7));
    const half = exposePixel(grey(3), p({ compression: 50, threshold: 80 }));
    expect(half[0]).toBeCloseTo((3 + full[0]) / 2, 12);
    const c: Rgb = [2, 1, 0.5];
    const out = exposePixel(c, p({ compression: 100 }));
    expect(out[1] / out[0]).toBeCloseTo(0.5, 12);
  });

  it("only applies the gain to colour without positive luminance", () => {
    expect(exposePixel([-0.2, 0.01, 0], p({ ev: 1, contrast: 50 }))).toEqual([-0.4, 0.02, 0]);
  });
});

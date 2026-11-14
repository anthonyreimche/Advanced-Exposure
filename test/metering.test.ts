// The measures of float frames (RGBA, top-down) the meters and per-slider
// auto read, as docs/SPEC.md defines them.

import { describe, expect, it } from "vitest";
import {
  luminanceQuantile,
  meteredValue,
  peakQuantile,
  shareAtOrAbove,
  shareAtOrBelow,
  spotLuminance,
  type Frame,
} from "../src/metering";
import { luminance, type Rgb } from "../src/model";

function frame(width: number, height: number, texel: (x: number, y: number) => Rgb): Frame {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([...texel(x, y), 1], (y * width + x) * 4);
  }
  return { data, width, height };
}

const grey = (v: number): Rgb => [v, v, v];
const BLANK = frame(1, 1, () => grey(0.2));

describe("spotLuminance", () => {
  it("averages a disc 1% of the long edge across, at least 2 px", () => {
    const f = frame(400, 200, (x, y) => (Math.abs(x - 100) <= 3 && Math.abs(y - 50) <= 3 ? grey(0.5) : grey(0.1)));
    let sum = 0;
    let n = 0;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 400; x++) {
        if ((x - 100) ** 2 + (y - 50) ** 2 <= 16) {
          sum += Math.abs(x - 100) <= 3 && Math.abs(y - 50) <= 3 ? 0.5 : 0.1;
          n++;
        }
      }
    }
    expect(spotLuminance(f, { x: 100.5 / 400, y: 50.5 / 200 })).toBeCloseTo(sum / n, 6);
    const small = frame(50, 50, (x, y) => ((x - 10) ** 2 + (y - 10) ** 2 <= 4 ? grey(0.4) : grey(0)));
    expect(spotLuminance(small, { x: 10.5 / 50, y: 10.5 / 50 })).toBeCloseTo(0.4, 6);
  });

  it("weights the channels as luminance, and is null off the frame or on a blank one", () => {
    const f = frame(20, 20, () => [0.2, 0.4, 0.6]);
    expect(spotLuminance(f, { x: 0.5, y: 0.5 })).toBeCloseTo(luminance([0.2, 0.4, 0.6]), 6);
    expect(spotLuminance(f, { x: -0.1, y: 0.5 })).toBeNull();
    expect(spotLuminance(BLANK, { x: 0.5, y: 0.5 })).toBeNull();
  });
});

describe("meteredValue", () => {
  it("averages in stops over the whole frame, flooring black at 2^-14", () => {
    expect(meteredValue(frame(40, 10, (x) => grey(x < 20 ? 0.05 : 0.8)), "average")).toBeCloseTo(Math.sqrt(0.05 * 0.8), 6);
    expect(meteredValue(frame(2, 1, (x) => grey(x === 0 ? 0 : 2 ** -2)), "average")).toBeCloseTo(2 ** -8, 9);
  });

  it("weights an ellipse fitted to the frame for centre-weighted: Gaussian, σ 0.35 of the half-extents", () => {
    const W = 64;
    const H = 32;
    const value = (x: number, y: number) => 0.01 + (x * 7 + y * 3) / 1000;
    let wsum = 0;
    let lsum = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = ((x + 0.5) / W - 0.5) / 0.5;
        const v = ((y + 0.5) / H - 0.5) / 0.5;
        const w = Math.exp(-(u * u + v * v) / (2 * 0.35 ** 2));
        wsum += w;
        lsum += w * Math.log2(value(x, y));
      }
    }
    expect(meteredValue(frame(W, H, (x, y) => grey(value(x, y))), "centre")).toBeCloseTo(2 ** (lsum / wsum), 6);
  });

  it("averages in stops inside a rectangle, corners in any order", () => {
    const f = frame(100, 100, (x, y) => (x >= 20 && x <= 39 && y >= 60 && y <= 79 ? grey(x < 30 ? 0.1 : 0.4) : grey(0.9)));
    const inside = meteredValue(f, { x0: 39.5 / 100, y0: 79.5 / 100, x1: 20.5 / 100, y1: 60.5 / 100 });
    expect(inside).toBeCloseTo(Math.sqrt(0.1 * 0.4), 6);
  });

  it("is null on a blank frame", () => {
    expect(meteredValue(BLANK, "average")).toBeNull();
  });
});

describe("quantiles and shares", () => {
  const ramp = frame(1000, 1, (x) => [((x + 1) / 1000) * 0.5, (x + 1) / 1000, 0]);

  it("takes a quantile of each pixel's brightest channel, and of luminance", () => {
    expect(peakQuantile(ramp, 0.995)).toBeCloseTo(0.995, 6);
    const lum = (x: number) => luminance([((x + 1) / 1000) * 0.5, (x + 1) / 1000, 0]);
    expect(luminanceQuantile(ramp, 0.001)).toBeCloseTo(lum(1), 6);
  });

  it("counts pixels with a channel at or above a level, and with every channel at or below one", () => {
    const pixels: Rgb[] = [[1, 0.2, 0.2], [0.3, 0.99, 0.1], [0.97, 0.97, 0.97], [0, 0, 0], [0.01, 0.02, 0.01], [0.03, 0.01, 0], [0.5, 0.5, 0.5], [0.2, 0.2, 0.2]];
    const f = frame(8, 1, (x) => pixels[x]);
    expect(shareAtOrAbove(f, 0.98)).toBe(2 / 8);
    expect(shareAtOrBelow(f, 0.02)).toBe(2 / 8);
  });

  it("is null on a blank frame", () => {
    expect(peakQuantile(BLANK, 0.5)).toBeNull();
    expect(luminanceQuantile(BLANK, 0.5)).toBeNull();
    expect(shareAtOrAbove(BLANK, 1)).toBeNull();
    expect(shareAtOrBelow(BLANK, 0)).toBeNull();
  });
});

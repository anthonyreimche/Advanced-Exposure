// Measures of float frames (RGBA, rows top-down): the meters' readings on the
// linear scene, and the clip shares and percentiles on the output.

import { luminance } from "./model";

export interface Frame {
  data: Float32Array;
  width: number;
  height: number;
}

export interface Uv {
  x: number;
  y: number;
}

/** A rectangle in the frame's 0–1 coordinates, corners in any order. */
export interface UvRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Below this a luminance counts as this, so black can't sink a log average. */
const LOG_FLOOR = 2 ** -14;
/** Centre-weighted: the Gaussian's σ in half-extents of the frame. */
const CENTRE_SIGMA = 0.35;

/** The host's "no renderer" frame is 1×1. */
const blank = (f: Frame) => f.width < 2 && f.height < 2;

const pixelLuminance = (f: Frame, i: number) => luminance([f.data[4 * i], f.data[4 * i + 1], f.data[4 * i + 2]]);

const pixelOf = (f: Frame, uv: Uv) => ({
  x: Math.min(f.width - 1, Math.max(0, Math.floor(uv.x * f.width))),
  y: Math.min(f.height - 1, Math.max(0, Math.floor(uv.y * f.height))),
});

/** The mean luminance of a disc 1 % of the long edge in radius (2 px at
 *  least) around `uv`; null off the frame or on a blank one. */
export function spotLuminance(f: Frame, uv: Uv): number | null {
  if (blank(f) || uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) return null;
  const c = pixelOf(f, uv);
  const radius = Math.max(2, 0.01 * Math.max(f.width, f.height));
  const reach = Math.floor(radius);
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, c.y - reach); y <= Math.min(f.height - 1, c.y + reach); y++) {
    for (let x = Math.max(0, c.x - reach); x <= Math.min(f.width - 1, c.x + reach); x++) {
      if ((x - c.x) ** 2 + (y - c.y) ** 2 > radius * radius) continue;
      sum += pixelLuminance(f, y * f.width + x);
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}

/** The log-average luminance of the whole frame, plain or weighted to the
 *  centre, or of a rectangle; null on a blank frame or an empty rectangle. */
export function meteredValue(f: Frame, mode: "average" | "centre" | UvRect): number | null {
  if (blank(f)) return null;
  let x0 = 0;
  let y0 = 0;
  let x1 = f.width - 1;
  let y1 = f.height - 1;
  if (typeof mode === "object") {
    const a = pixelOf(f, { x: Math.min(mode.x0, mode.x1), y: Math.min(mode.y0, mode.y1) });
    const b = pixelOf(f, { x: Math.max(mode.x0, mode.x1), y: Math.max(mode.y0, mode.y1) });
    [x0, y0, x1, y1] = [a.x, a.y, b.x, b.y];
  }
  let weights = 0;
  let stops = 0;
  for (let y = y0; y <= y1; y++) {
    const v = ((y + 0.5) / f.height - 0.5) / 0.5;
    for (let x = x0; x <= x1; x++) {
      let w = 1;
      if (mode === "centre") {
        const u = ((x + 0.5) / f.width - 0.5) / 0.5;
        w = Math.exp(-(u * u + v * v) / (2 * CENTRE_SIGMA * CENTRE_SIGMA));
      }
      weights += w;
      stops += w * Math.log2(Math.max(pixelLuminance(f, y * f.width + x), LOG_FLOOR));
    }
  }
  return weights > 0 ? 2 ** (stops / weights) : null;
}

function quantile(values: Float32Array, q: number): number {
  values.sort();
  return values[Math.min(values.length - 1, Math.max(0, Math.round(q * (values.length - 1))))];
}

/** The `q` quantile of each pixel's brightest channel; null on a blank frame. */
export function peakQuantile(f: Frame, q: number): number | null {
  if (blank(f)) return null;
  const n = f.width * f.height;
  const peaks = new Float32Array(n);
  for (let i = 0; i < n; i++) peaks[i] = Math.max(f.data[4 * i], f.data[4 * i + 1], f.data[4 * i + 2]);
  return quantile(peaks, q);
}

/** The `q` quantile of the luminance; null on a blank frame. */
export function luminanceQuantile(f: Frame, q: number): number | null {
  if (blank(f)) return null;
  const n = f.width * f.height;
  const values = new Float32Array(n);
  for (let i = 0; i < n; i++) values[i] = pixelLuminance(f, i);
  return quantile(values, q);
}

/** The share of pixels with a channel at or above `level`; null on a blank frame. */
export function shareAtOrAbove(f: Frame, level: number): number | null {
  if (blank(f)) return null;
  const n = f.width * f.height;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    if (f.data[4 * i] >= level || f.data[4 * i + 1] >= level || f.data[4 * i + 2] >= level) hits++;
  }
  return hits / n;
}

/** The share of pixels with every channel at or below `level`; null on a blank frame. */
export function shareAtOrBelow(f: Frame, level: number): number | null {
  if (blank(f)) return null;
  const n = f.width * f.height;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    if (f.data[4 * i] <= level && f.data[4 * i + 1] <= level && f.data[4 * i + 2] <= level) hits++;
  }
  return hits / n;
}

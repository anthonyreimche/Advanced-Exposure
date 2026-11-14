// The own stage's maths on the CPU (docs/SPEC.md), the twin the GPU spec
// holds the shader to, and the solvers Auto uses to place a measured value.
// Light is linear Rec.709.

export type Rgb = [number, number, number];

export interface Range {
  min: number;
  max: number;
  step?: number;
}

export interface Tone {
  /** The input value that becomes black, in percent of white. */
  black: number;
  /** Middle grey's move, in stops. */
  midtones: number;
}

export const TONE_RANGES: Readonly<Record<keyof Tone, Required<Range>>> = {
  black: { min: -2, max: 5, step: 0.01 },
  midtones: { min: -2, max: 2, step: 0.01 },
};

export const DEFAULT_TONE: Readonly<Tone> = { black: 0, midtones: 0 };

export const MIDDLE_GREY = 0.18;

export const clampTo = (v: number, r: Range): number => Math.min(Math.max(v, r.min), r.max);

export const luminance = (rgb: Readonly<Rgb>): number => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/** The power on luminance that moves middle grey `stops` and keeps 0 and 1. */
export const midtoneGamma = (stops: number): number =>
  stops === 0 ? 1 : Math.log(MIDDLE_GREY * 2 ** stops) / Math.log(MIDDLE_GREY);

export function tonePixel(rgb: Readonly<Rgb>, t: Tone): Rgb {
  const black = clampTo(t.black, TONE_RANGES.black) / 100;
  const midtones = clampTo(t.midtones, TONE_RANGES.midtones);
  if (black === 0 && midtones === 0) return [rgb[0], rgb[1], rgb[2]];
  const k = 1 / (1 - black);
  const out: Rgb = [(rgb[0] - black) * k, (rgb[1] - black) * k, (rgb[2] - black) * k];
  const y = luminance(out);
  if (midtones === 0 || !(y > 0)) return out;
  const ratio = y ** midtoneGamma(midtones) / y;
  return [out[0] * ratio, out[1] * ratio, out[2] * ratio];
}

export interface Exposure {
  /** Stops of linear gain. */
  ev: number;
  /** −100 to 100: stops scaled about middle grey by 1 ± 0.5. */
  contrast: number;
  /** −100 to 100 each: up to 1.5 stops (Highlights, Shadows) or 1 stop
   *  (Whites, Blacks) for their band. */
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  /** 0 to 100: how far the brightest channel rolls off towards white above the threshold. */
  compression: number;
  /** 50 to 95: where the roll-off starts, in percent of white. */
  threshold: number;
}

export const EXPOSURE_RANGES: Readonly<Record<keyof Exposure, Required<Range>>> = {
  ev: { min: -5, max: 5, step: 0.01 },
  contrast: { min: -100, max: 100, step: 1 },
  highlights: { min: -100, max: 100, step: 1 },
  shadows: { min: -100, max: 100, step: 1 },
  whites: { min: -100, max: 100, step: 1 },
  blacks: { min: -100, max: 100, step: 1 },
  compression: { min: 0, max: 100, step: 1 },
  threshold: { min: 50, max: 95, step: 1 },
};

export const DEFAULT_EXPOSURE: Readonly<Exposure> = {
  ev: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  compression: 0,
  threshold: 80,
};

/** GLSL's smoothstep, for edges in rising order. */
const smoothstep = (lo: number, hi: number, x: number): number => {
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Stops from middle grey through Contrast, then each band in turn. Each step
 *  keeps its input's order (its slope stays above zero), so the whole does. */
export function toneStops(stops: number, p: Exposure): number {
  const c = clampTo(p.contrast, EXPOSURE_RANGES.contrast) / 100;
  const s = clampTo(p.shadows, EXPOSURE_RANGES.shadows) / 100;
  const h = clampTo(p.highlights, EXPOSURE_RANGES.highlights) / 100;
  const w = clampTo(p.whites, EXPOSURE_RANGES.whites) / 100;
  const b = clampTo(p.blacks, EXPOSURE_RANGES.blacks) / 100;
  let e = stops * (1 + 0.5 * c);
  e += 1.5 * s * (1 - smoothstep(-4.5, 0, e));
  e += 1.5 * h * smoothstep(-1, 2.5, e);
  e += w * smoothstep(1.5, 3.5, e);
  e += b * (1 - smoothstep(-8, -3.5, e));
  return e;
}

/** The roll-off of a brightest channel `n` past knee `t`: slope 1 at the
 *  knee, white as its limit. */
const rollOff = (n: number, t: number): number => t + ((1 - t) * (n - t)) / (n - t + (1 - t));

export function exposePixel(rgb: Readonly<Rgb>, p: Exposure): Rgb {
  const ev = clampTo(p.ev, EXPOSURE_RANGES.ev);
  const amount = clampTo(p.compression, EXPOSURE_RANGES.compression) / 100;
  const knee = clampTo(p.threshold, EXPOSURE_RANGES.threshold) / 100;
  const shaped = p.contrast !== 0 || p.highlights !== 0 || p.shadows !== 0 || p.whites !== 0 || p.blacks !== 0;
  if (ev === 0 && !shaped && amount === 0) return [rgb[0], rgb[1], rgb[2]];
  const L = luminance(rgb);
  let k = 2 ** ev;
  if (shaped && L > 0) {
    const stops = Math.log2((L * k) / MIDDLE_GREY);
    k = (MIDDLE_GREY * 2 ** toneStops(stops, p)) / L;
  }
  const out: Rgb = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
  const n = Math.max(out[0], out[1], out[2]);
  if (amount === 0 || !(n > knee)) return out;
  const r = 1 + (rollOff(n, knee) / n - 1) * amount;
  return [out[0] * r, out[1] * r, out[2] * r];
}

export interface NewtonOptions {
  tolerance: number;
  maxSteps: number;
  range: Range;
}

/** The exposure, from `start`, at which `measure` (a value that grows with
 *  exposure, about one stop per stop below the shoulder) reads `target`:
 *  each step corrects by the remaining error in stops. */
export async function newtonStops(
  measure: (ev: number) => Promise<number>,
  start: number,
  target: number,
  { tolerance, maxSteps, range }: NewtonOptions,
): Promise<{ ev: number; steps: number }> {
  let ev = clampTo(start, range);
  for (let step = 1; step <= maxSteps; step++) {
    const value = await measure(ev);
    if (!(value > 0)) return { ev, steps: step };
    const error = Math.log2(target / value);
    const next = clampTo(ev + error, range);
    if (Math.abs(error) < tolerance || next === ev) return { ev, steps: step };
    ev = next;
  }
  return { ev, steps: maxSteps };
}

export interface BisectOptions {
  lo: number;
  hi: number;
  limit: number;
  steps: number;
  /** The measure falls as the value grows: find the lowest value within the
   *  limit instead of the highest. */
  falling?: boolean;
}

/** The highest value in [lo, hi] whose measure stays at or under `limit` (the
 *  lowest with `falling`), for a measure monotonic in the value. */
export async function bisect(
  measure: (v: number) => Promise<number>,
  { lo, hi, limit, steps, falling = false }: BisectOptions,
): Promise<number> {
  const within = async (v: number) => (await measure(v)) <= limit;
  const [good, bad] = falling ? [hi, lo] : [lo, hi];
  if (await within(bad)) return bad;
  if (!(await within(good))) return good;
  let ok = good;
  let fail = bad;
  for (let i = 0; i < steps; i++) {
    const mid = (ok + fail) / 2;
    if (await within(mid)) ok = mid;
    else fail = mid;
  }
  return ok;
}

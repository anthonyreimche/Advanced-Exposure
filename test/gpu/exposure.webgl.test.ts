// The stages on the real renderer. Run via `npm run test:gpu` (run.cjs copies
// this file into a SafeLight checkout and runs it under its headless Chromium
// + SwiftShader rig). What the CPU suite cannot check:
//  • installing Advanced Exposure changes no photo: at rest every frame is
//    bit-identical with and without it, with Basic and without, on process
//    versions 1, 2 and 3, with the core shoulder on and off, for photos with
//    Basic edits too;
//  • the exposure stage compiles at the tone anchor and renders model.ts
//    exposePixel, on its own (no Basic installed);
//  • beside Basic it runs ahead of Basic's tone block (its gain goes through
//    Basic's shoulder), and the two exposures add below the shoulder;
//  • the tone stage renders tonePixel, and its mask copy acts inside the mask;
//  • the clipping view lights clipped channels (or crushed ones) in the live
//    view's frame, and never reaches a measurement, an export or a thumbnail.
//
// Stage output is read at "scene", the linear colour the display transform
// receives. The open probe skips the core shoulder, so nothing after a stage
// changes its output before the read; references start from captured idle
// frames, so the RGBA16F upload doesn't count.

import { describe, expect, it } from "vitest";
import { DEFAULT_EXPOSURE, exposePixel, tonePixel, type Exposure, type Rgb, type Tone } from "@ae/model";
import { THRESHOLD_STAGE_ID, exposurePatch, exposureReset, thresholdView, tonePatch, toneReset } from "@ae/params";
import { exposureStage, thresholdStage, toneStage } from "@ae/stage";
import { CURRENT_PROCESS_VERSION } from "@/catalog/process-version";
import { defaultMaskAdjustments, type DevelopParams, type Mask } from "@/catalog/types";
import type { ProcessingStageContribution } from "@/extensions/types";
import type { ResolvedPipeline, WebGLRendererOpts } from "@/rendering/webgl/renderer";
import {
  LINEAR_PROBE_PIPELINE,
  OPEN_PROBE,
  builtinStages,
  floatImage,
  glHarness,
  identityParams,
  withRenderer,
} from "@/rendering/webgl/webgl.test-support";

const W = 128;
const H = 96;
const SCENE_SPACE = { encoding: "linear", primaries: "rec709" } as const;
const AS_DRAWN = { encoding: "perceptual", primaries: "rec709" } as const;
const BASIC = "safelight.basic";

/** Linear Rec.709 from 0.002 to 2: a grey ramp across, colour growing down,
 *  and a band whose red sits below zero. */
const SCENE = floatImage(W, H, (x, y) => {
  const t = x / (W - 1);
  const u = y / (H - 1);
  const L = 0.002 * 1000 ** t;
  if (u > 0.85) return [-0.02 + 0.01 * t, L, L * 0.6];
  const chroma = u < 0.2 ? 0 : 0.6 * Math.min(1, (u - 0.2) / 0.5);
  const ang = u * Math.PI * 4;
  return [L * (1 + chroma * Math.cos(ang)), L * (1 + chroma * Math.cos(ang - 2.094)), L * (1 + chroma * Math.cos(ang + 2.094))];
});

type Bag = Record<string, unknown>;
type Installed = ProcessingStageContribution & { extensionId?: string };

const OURS = (): ProcessingStageContribution[] => [exposureStage(), toneStage(), thresholdStage()];
const withBasic = (): Installed[] => builtinStages();
const withoutBasic = (): Installed[] => builtinStages().filter((s) => s.extensionId !== BASIC);

interface RenderOptions {
  base?: Installed[];
  stages?: ProcessingStageContribution[];
  pipeline?: ResolvedPipeline;
  params?: Partial<DevelopParams>;
  masks?: Mask[];
  renderer?: Partial<WebGLRendererOpts>;
  point?: "scene" | "pre-output";
  image?: ReturnType<typeof floatImage>;
}

function frames(bags: Record<string, Bag>, o: RenderOptions = {}): Record<string, Float32Array> {
  const { base = withoutBasic(), stages = OURS(), pipeline = OPEN_PROBE, masks = [], point = "scene", image = SCENE } = o;
  const out: Record<string, Float32Array> = {};
  withRenderer({ stages: [...base, ...stages], pipeline, processVersionCap: 3, ...o.renderer }, (renderer) => {
    renderer.setImage(image);
    renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION, masks, ...o.params }));
    for (const [name, bag] of Object.entries(bags)) {
      renderer.setContributedParams(bag);
      const frame = renderer.readFloatFrame(point, Infinity, point === "scene" ? SCENE_SPACE : AS_DRAWN);
      if (!frame) throw new Error(`no frame for ${name}`);
      out[name] = frame.data;
    }
  });
  return out;
}

const pixel = (data: Float32Array, k: number): Rgb => [data[4 * k], data[4 * k + 1], data[4 * k + 2]];
const differing = (a: Float32Array, b: Float32Array) => a.reduce((n, v, i) => (v === b[i] ? n : n + 1), 0);

function compare(idle: Float32Array, on: Float32Array, model: (rgb: Rgb) => Rgb, inside = (_x: number) => true) {
  let worst = 0;
  let where = "";
  let change = 0;
  for (let k = 0; k < W * H; k++) {
    if (!inside(k % W)) continue;
    const input = pixel(idle, k);
    const want = model(input);
    const got = pixel(on, k);
    for (let c = 0; c < 3; c++) {
      const e = Math.abs(got[c] - want[c]) / Math.max(1, Math.abs(want[c]));
      change = Math.max(change, Math.abs(want[c] - input[c]));
      if (e > worst) {
        worst = e;
        where = `(${k % W},${Math.floor(k / W)}) ch${c}: in ${input[c].toFixed(6)} gpu ${got[c].toFixed(6)} ref ${want[c].toFixed(6)}`;
      }
    }
  }
  return { worst, where, change };
}

describe("existing photos are unchanged by installing Advanced Exposure", () => {
  const edits: Record<string, Partial<DevelopParams>> = {
    untouched: {},
    "a Basic edit": { exposure: 1.3, highlights: -60, shadows: 40, whites: 20, contrast: 25 },
  };
  const cases = [1, 2, 3].flatMap((processVersion) =>
    [
      { basic: "with Basic", base: withBasic },
      { basic: "without Basic", base: withoutBasic },
    ].flatMap(({ basic, base }) =>
      [
        { shoulder: "core shoulder on", pipeline: LINEAR_PROBE_PIPELINE },
        { shoulder: "core shoulder off", pipeline: OPEN_PROBE },
      ].map((p) => ({ processVersion, basic, base, ...p })),
    ),
  );
  it.each(cases)("version $processVersion, $basic, $shoulder: bit-identical", ({ processVersion, base, pipeline }) => {
    for (const params of Object.values(edits)) {
      const o = { base: base(), pipeline, params: { processVersion, ...params }, point: "pre-output" as const };
      const without = frames({ without: {} }, { ...o, stages: [] }).without;
      const installed = frames({ empty: {}, defaults: { ...exposureReset(), ...toneReset() } }, o);
      expect(differing(installed.empty, without)).toBe(0);
      expect(differing(installed.defaults, without)).toBe(0);
    }
  });
});

const edit = (over: Partial<Exposure>): Exposure => ({ ...DEFAULT_EXPOSURE, ...over });

const EXPOSURE_CASES: [string, Exposure][] = [
  ["+1.5 EV", edit({ ev: 1.5 })],
  ["-2.3 EV", edit({ ev: -2.3 })],
  ["contrast +70", edit({ contrast: 70 })],
  ["shadows +80, highlights -60", edit({ shadows: 80, highlights: -60 })],
  ["whites +50, blacks -50", edit({ whites: 50, blacks: -50 })],
  ["compression 100 from 70 %", edit({ ev: 1, compression: 100, threshold: 70 })],
  ["everything", edit({ ev: 0.6, contrast: -40, highlights: 30, shadows: -20, whites: -30, blacks: 40, compression: 60, threshold: 85 })],
];

describe("the exposure stage, on its own", () => {
  const bags: Record<string, Bag> = { idle: exposureReset() };
  for (const [name, p] of EXPOSURE_CASES) bags[name] = exposurePatch(p);
  const rendered = frames(bags);

  it.each(EXPOSURE_CASES)("renders the model's result: %s", (name, p) => {
    const s = compare(rendered.idle, rendered[name], (rgb) => exposePixel(rgb, p));
    console.log(`[ae-gpu] ${name}: worst relative error ${s.worst.toExponential(2)} at ${s.where}`);
    expect(s.change).toBeGreaterThan(1e-3);
    expect(s.worst).toBeLessThan(1e-4);
  });
});

/** A neutral ramp from 0.05 to 3 across, the same down every column. */
const RAMP_W = 128;
const RAMP = floatImage(RAMP_W, 4, (x) => {
  const v = 0.05 * 60 ** (x / (RAMP_W - 1));
  return [v, v, v];
});

/** Basic's default shoulder at Exposure and Highlights 0 (core's local-tone.ts). */
const basicShoulder = (x: number) => (x <= 0.85 ? x : 0.85 + (0.15 * (x - 0.85)) / (x - 0.85 + 0.5));

describe("beside Basic", () => {
  const ramp = (bag: Bag, params: Partial<DevelopParams> = {}) =>
    frames({ f: bag }, { base: withBasic(), pipeline: LINEAR_PROBE_PIPELINE, image: RAMP, params }).f;
  const row = (data: Float32Array, x: number) => data[(RAMP_W + x) * 4];

  it("runs ahead of Basic's tone block: its gain goes through Basic's shoulder", () => {
    const lifted = ramp(exposurePatch({ ev: 1 }));
    let worst = 0;
    for (let x = 0; x < RAMP_W; x++) {
      const want = basicShoulder(2 * 0.05 * 60 ** (x / (RAMP_W - 1)));
      worst = Math.max(worst, Math.abs(row(lifted, x) - want) / want);
      expect(row(lifted, x)).toBeLessThan(1);
    }
    console.log(`[ae-gpu] ahead of Basic: worst relative error ${worst.toExponential(2)}`);
    expect(worst).toBeLessThan(1e-3);
  });

  it("adds its exposure to Basic's below the shoulder", () => {
    const both = ramp(exposurePatch({ ev: 0.5 }), { exposure: 0.5 });
    const basicOnly = ramp(exposureReset(), { exposure: 1 });
    for (let x = 0; x < RAMP_W / 2; x++) {
      if (row(basicOnly, x) > 0.8) continue;
      expect(Math.abs(row(both, x) - row(basicOnly, x)) / row(basicOnly, x)).toBeLessThan(1e-4);
    }
  });
});

const TONE_CASES: [string, Tone][] = [
  ["black +3 %", { black: 3, midtones: 0 }],
  ["midtones +1.2 EV", { black: 0, midtones: 1.2 }],
  ["black +2 %, midtones -0.5 EV", { black: 2, midtones: -0.5 }],
];

describe("the tone stage", () => {
  const bags: Record<string, Bag> = { idle: toneReset() };
  for (const [name, t] of TONE_CASES) bags[name] = tonePatch(t);
  const rendered = frames(bags);

  it.each(TONE_CASES)("renders the model's result: %s", (name, t) => {
    const s = compare(rendered.idle, rendered[name], (rgb) => tonePixel(rgb, t));
    console.log(`[ae-gpu] ${name}: worst relative error ${s.worst.toExponential(2)} at ${s.where}`);
    expect(s.change).toBeGreaterThan(1e-3);
    expect(s.worst).toBeLessThan(1e-4);
  });

  it("applies a mask's copy inside the mask only", () => {
    const t: Tone = { black: 0, midtones: 1 };
    const mask: Mask = {
      id: "m",
      name: "Mask",
      visible: true,
      invert: false,
      opacity: 100,
      adj: defaultMaskAdjustments(),
      panels: ["advanced-exposure.panel"],
      bag: tonePatch(t),
      components: [{ id: "right", kind: "linear", mode: "add", invert: false, linear: { x0: 0.5, y0: 0, x1: 0.5001, y1: 0 } }],
    };
    const off = frames({ off: toneReset() }).off;
    const on = frames({ on: toneReset() }, { masks: [mask] }).on;
    for (let k = 0; k < W * H; k++) {
      if (k % W >= W / 2 - 1) continue;
      for (let c = 0; c < 3; c++) expect(on[4 * k + c]).toBe(off[4 * k + c]);
    }
    const s = compare(off, on, (rgb) => tonePixel(rgb, t), (x) => x > W / 2 + 2);
    expect(s.change).toBeGreaterThan(1e-3);
    expect(s.worst).toBeLessThan(1e-4);
  });
});

/** Thirds: deep shadow, a mid value, past white. The open probe hands the
 *  linear colour to the canvas as it is, so the mid third draws about 128. */
const THIRDS = floatImage(24, 8, (x) => (x < 8 ? [0.001, 0.001, 0.001] : x < 16 ? [0.5, 0.5, 0.5] : [2, 2, 2]));
const LEVELS = { high: 250 / 255, low: 5 / 255 };

/** The canvas's mean over each third's inner columns, all channels, 0–255. */
function thirds(): { dark: number; mid: number; bright: number } {
  const { canvas, gl } = glHarness();
  const px = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const third = canvas.width / 3;
  const mean = (i: number) => {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = Math.ceil(i * third) + 1; x < Math.floor((i + 1) * third) - 1; x++) {
        for (let c = 0; c < 3; c++) sum += px[(y * canvas.width + x) * 4 + c];
        n += 3;
      }
    }
    return sum / n;
  };
  return { dark: mean(0), mid: mean(1), bright: mean(2) };
}

function liveThirds(bag: Bag): { dark: number; mid: number; bright: number } {
  return withRenderer({ stages: [...withoutBasic(), ...OURS()], pipeline: OPEN_PROBE, drawsViewStages: true }, (renderer) => {
    renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
    renderer.uploadSource("thirds:0", THIRDS);
    renderer.setContributedParams(bag);
    renderer.render();
    return thirds();
  });
}

describe("the clipping view", () => {
  it("draws the photo as it is while off", () => {
    const t = liveThirds(thresholdView("off", LEVELS));
    expect(t.dark).toBeLessThan(2);
    expect(t.mid).toBeGreaterThan(100);
    expect(t.mid).toBeLessThan(160);
    expect(t.bright).toBeGreaterThan(254);
  });

  it("lights the clipped channels on black in the live view", () => {
    const t = liveThirds(thresholdView("highlights", LEVELS));
    expect([t.dark < 1, t.mid < 1, t.bright > 254]).toEqual([true, true, true]);
  });

  it("shows crushed shadows as black on white", () => {
    const t = liveThirds(thresholdView("shadows", LEVELS));
    expect([t.dark < 1, t.mid > 254, t.bright > 254]).toEqual([true, true, true]);
  });

  it("never reaches an export, a thumbnail or a measurement", () => {
    const shown = thresholdView("highlights", LEVELS);
    const without = frames({ without: {} }, { stages: [], point: "pre-output" }).without;
    const exported = frames({ on: shown }, { point: "pre-output" });
    expect(differing(exported.on, without)).toBe(0);
    const live = frames({ on: shown }, { point: "pre-output", renderer: { drawsViewStages: true } });
    expect(differing(live.on, without)).toBe(0);
  });

  it("keys its values under its own stage", () => {
    expect(Object.keys(thresholdView("off", LEVELS)).every((k) => k.startsWith(`${THRESHOLD_STAGE_ID}.`))).toBe(true);
  });
});

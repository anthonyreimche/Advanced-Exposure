// Auto, per-slider auto, Measure and Match on the open photo: what they render,
// what they set, and the one undo step each makes. The fake renders a neutral
// scene whose light doubles with each stop of the exposure stage's Exposure
// (read from the render's param bag), through a shoulder, and an output that
// its Whites brighten and its Blacks darken.

import { describe, expect, it } from "vitest";
import { autoBlackLevel, autoBlacks, autoExposure, autoWhites, matchSpot, measureSpot, undoCameraEc } from "../src/auto";
import { luminanceQuantile, peakQuantile, shareAtOrAbove, shareAtOrBelow, spotLuminance } from "../src/metering";
import { exposureKey, readExposure, toneKey, toneReset } from "../src/params";
import { initRuntime } from "../src/rt";
import { readPrefs, type Prefs } from "../src/settings";
import type { FloatFrame } from "../src/safelight";
import { fakeApi, floatFrame, point, type RenderCall, type RigOptions } from "./support/fake-api";

const W = 40;
const H = 20;
/** Scene light at 0 EV: 0.002 to 2, rising across, the same down every column. */
const base = (x: number) => 0.002 * 1000 ** (x / (W - 1));
const shoulder = (v: number) => (v < 0.8 ? v : 0.8 + (0.2 * (v - 0.8)) / (v - 0.8 + 0.4));

type Bag = Readonly<Record<string, unknown>>;

function sceneAt(bag: Bag, light = base): FloatFrame {
  const { ev } = readExposure(bag);
  return floatFrame(W, H, (x) => {
    const v = shoulder(light(x) * 2 ** ev);
    return [v, v, v];
  });
}

function outputAt(bag: Bag): FloatFrame {
  const { ev, whites, blacks } = readExposure(bag);
  return floatFrame(W, H, (x) => {
    const d = Math.max(base(x) * 2 ** ev, 0) ** (1 / 2.2) * (1 + 0.003 * whites) + 0.001 * blacks;
    return [d, d, d];
  });
}

const bagOf = (call: RenderCall): Bag => call.options?.paramBag ?? {};

function renderer(call: RenderCall): FloatFrame {
  return call.options?.point === "scene" ? sceneAt(bagOf(call)) : outputAt(bagOf(call));
}

function rig(options: RigOptions = {}) {
  const r = fakeApi(options);
  initRuntime(r.api);
  r.setRender(renderer);
  return r;
}

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...readPrefs(), ...over });
const exposure = (r: ReturnType<typeof rig>) => readExposure(r.bag()).ev;
const withEv = (ev: number): Bag => ({ [exposureKey("ev")]: ev });

describe("autoExposure, scene modes", () => {
  it("measures the whole photo's scene with this extension's own values at rest and the rest of the bag kept", async () => {
    const r = rig({ bag: { [toneKey("midtones")]: 1, "other.stage.amount": 0.5 } });
    await autoExposure(prefs({ mode: "average" }));
    const call = r.renders[0];
    expect(call.kind).toBe("photo");
    expect(call.options).toEqual({
      point: "scene",
      space: { encoding: "linear", primaries: "rec709" },
      paramBag: { "other.stage.amount": 0.5, [exposureKey("ev")]: 0, ...toneReset() },
    });
  });

  it("places the log average on the target through the shoulder, in at most four renders", async () => {
    const r = rig();
    const result = await autoExposure(prefs({ mode: "average", target: 0 }));
    expect(result.kind).toBe("done");
    expect(r.renders.length).toBeLessThanOrEqual(4);
    const frame = sceneAt(withEv(exposure(r)));
    let stops = 0;
    for (let x = 0; x < W; x++) stops += Math.log2(frame.data[4 * x]);
    expect(Math.abs(stops / W - Math.log2(0.18))).toBeLessThan(0.02);
    expect(r.commits).toEqual(["Advanced Exposure auto (Average)"]);
  });

  it("scales the change by the intensity", async () => {
    const full = rig({ bag: withEv(0.5) });
    await autoExposure(prefs({ mode: "average", intensity: 100 }));
    const whole = exposure(full) - 0.5;
    const half = rig({ bag: withEv(0.5) });
    await autoExposure(prefs({ mode: "average", intensity: 50 }));
    expect(exposure(half) - 0.5).toBeCloseTo(whole / 2, 1);
  });

  it("weights the centre for Centre-weighted, which brightens a photo dark in the middle less than Average", async () => {
    const dim = (x: number) => (Math.abs(x - W / 2) < 6 ? 0.01 : 0.2);
    const average = rig();
    average.setRender((call) => sceneAt(bagOf(call), dim));
    await autoExposure(prefs({ mode: "average" }));
    const centre = rig();
    centre.setRender((call) => sceneAt(bagOf(call), dim));
    await autoExposure(prefs({ mode: "centre" }));
    expect(exposure(centre)).toBeGreaterThan(exposure(average));
    expect(centre.commits).toEqual(["Advanced Exposure auto (Centre-weighted)"]);
  });

  it("meters a rectangle of the view for Spot weighted", async () => {
    const r = rig();
    const result = await autoExposure(prefs({ mode: "spot" }), { x0: 0.5, y0: 0, x1: 0.6, y1: 1 });
    expect(result.kind).toBe("done");
    expect(r.renders.every((c) => c.kind === "view" && c.options?.point === "scene")).toBe(true);
    const x = Math.floor(0.55 * W);
    expect(Math.log2(shoulder(base(x) * 2 ** exposure(r)) / 0.18)).toBeLessThan(0.4);
    expect(r.commits).toEqual(["Advanced Exposure auto (Spot weighted)"]);
  });
});

describe("autoExposure, output modes", () => {
  it("darkens until the brightest half percent is under the warning level, for Highlight priority", async () => {
    const r = rig({ bag: withEv(1) });
    const p = prefs({ mode: "highlights" });
    await autoExposure(p);
    const at = (ev: number) => peakQuantile(outputAt(withEv(ev)), 0.995) ?? 0;
    expect(exposure(r)).toBeLessThan(1);
    expect(at(exposure(r))).toBeLessThanOrEqual(p.high);
    expect(at(exposure(r) + 0.05)).toBeGreaterThan(p.high);
    expect(r.renders.length).toBeLessThanOrEqual(10);
    expect(r.renders.every((c) => c.options?.point === "pre-output")).toBe(true);
  });

  it("never brightens for Highlight priority", async () => {
    const r = rig({ bag: withEv(-3) });
    expect(await autoExposure(prefs({ mode: "highlights" }))).toEqual({ kind: "failed", reason: "No highlights reach the warning level." });
    expect(r.commits).toEqual([]);
  });

  it("brightens the percentile up to the warning level for Expose to the right", async () => {
    const r = rig({ bag: withEv(-3) });
    const p = prefs({ mode: "ettr", ettr: 0.99 });
    await autoExposure(p);
    const at = (ev: number) => peakQuantile(outputAt(withEv(ev)), 0.99) ?? 0;
    expect(exposure(r)).toBeGreaterThan(-3);
    expect(at(exposure(r))).toBeLessThanOrEqual(p.high);
    expect(at(exposure(r) + 0.05)).toBeGreaterThan(p.high);
    expect(r.commits).toEqual(["Advanced Exposure auto (Expose to the right)"]);
  });
});

describe("per-slider auto", () => {
  it("sets Whites as high as keeps the clip share at the warning level", async () => {
    const r = rig({ bag: withEv(-1) });
    const p = prefs({ clip: 0.05 });
    await autoWhites(p);
    const w = readExposure(r.bag()).whites;
    const share = (whites: number) => shareAtOrAbove(outputAt({ ...withEv(-1), [exposureKey("whites")]: whites }), p.high) ?? 1;
    expect(Number.isInteger(w)).toBe(true);
    expect(share(w)).toBeLessThanOrEqual(0.05);
    expect(share(w + 2)).toBeGreaterThan(0.05);
    expect(r.commits).toEqual(["Advanced Exposure auto whites"]);
  });

  it("sets Blacks as low as keeps the clip share at the shadow level", async () => {
    const r = rig();
    const p = prefs({ clip: 0.05, low: 0.05 });
    await autoBlacks(p);
    const b = readExposure(r.bag()).blacks;
    const share = (blacks: number) => shareAtOrBelow(outputAt({ [exposureKey("blacks")]: blacks }), p.low) ?? 1;
    expect(share(b)).toBeLessThanOrEqual(0.05);
    expect(share(b - 2)).toBeGreaterThan(0.05);
    expect(r.commits).toEqual(["Advanced Exposure auto blacks"]);
  });

  it("makes the darkest clip share of the scene black with the Black level", async () => {
    const r = rig();
    await autoBlackLevel(prefs({ clip: 0.05 }));
    const black = r.bag()[toneKey("black")];
    expect(typeof black).toBe("number");
    const darkest = luminanceQuantile(sceneAt({}), 0.05) ?? 0;
    expect(black).toBeCloseTo(darkest * 100, 6);
    expect(r.commits).toEqual(["Advanced Exposure auto black level"]);
  });
});

describe("Measure and Match", () => {
  it("stores a spot's scene luminance, then puts another photo's spot on it", async () => {
    const r = rig();
    r.setCanvasSize(W * 10, H * 10);
    const measured = await measureSpot(point(20 * 10 + 5, 100));
    expect(measured.kind).toBe("done");
    const stored = r.settings.get("matchTarget");
    expect(stored).toBeCloseTo(spotLuminance(sceneAt({}), { x: 20.5 / W, y: 0.5 }) ?? 0, 6);
    r.develop.setState({ photoId: "photo-2" });
    r.setRender((call) => sceneAt(bagOf(call), (x) => base(x) / 4));
    const matched = await matchSpot(point(20 * 10 + 5, 100), readPrefs());
    expect(matched.kind).toBe("done");
    expect(exposure(r)).toBeCloseTo(2, 1);
    expect(r.commits).toEqual(["Advanced Exposure match"]);
  });

  it("can't match without a measured target", async () => {
    rig();
    expect(await matchSpot(point(10, 10), readPrefs())).toEqual({ kind: "failed", reason: "Measure a spot on a reference photo first." });
  });
});

describe("Undo camera exposure compensation", () => {
  it("sets Exposure to cancel the camera's compensation, as one step", () => {
    const r = rig({ cameraEc: 0.7 });
    expect(undoCameraEc()).toEqual({ kind: "done", status: "Exposure −0.70 EV" });
    expect(r.bag()).toEqual({ [exposureKey("ev")]: -0.7 });
    expect(exposure(r)).toBe(-0.7);
    expect(r.commits).toEqual(["Advanced Exposure undo camera compensation"]);
  });
});

describe("failures", () => {
  it("changes nothing without a photo or without float frames", async () => {
    const none = rig({ photoId: null });
    expect(await autoExposure(prefs())).toEqual({ kind: "failed", reason: "No photo is open." });
    expect(none.renders).toEqual([]);
    const blank = rig();
    blank.setRender(() => null);
    expect(await autoExposure(prefs())).toEqual({ kind: "failed", reason: "Couldn't measure the photo: this graphics card has no float render targets." });
    expect(blank.commits).toEqual([]);
  });

  it("drops the result when the photo changed during the measurement", async () => {
    const r = rig();
    const pending = autoExposure(prefs());
    r.develop.setState({ photoId: "photo-2" });
    expect(await pending).toEqual({ kind: "failed", reason: "The photo changed before the measurement finished." });
    expect(r.commits).toEqual([]);
  });
});

// Auto, per-slider auto, Measure and Match on the open photo. The exposure
// stage runs ahead of the tone mapping (and of Basic's tone block, when Basic
// is installed), so a reading can't be placed in closed form: scene modes take
// Newton steps in stops (newtonStops), output modes and Whites/Blacks bisect
// (bisect), each step a fresh small float render with the trial value in the
// render's param bag. Scene readings are taken with Black level and Midtones
// at rest, so they meter the light the exposure stage hands on; output
// readings with the whole edit, as it would clip. Each result is one undo
// step; a photo that changed while a measurement was in flight gets nothing.

import {
  luminanceQuantile,
  meteredValue,
  peakQuantile,
  shareAtOrAbove,
  shareAtOrBelow,
  spotLuminance,
  type Frame,
  type Uv,
  type UvRect,
} from "./metering";
import { EXPOSURE_RANGES, MIDDLE_GREY, TONE_RANGES, bisect, clampTo, newtonStops, type Exposure } from "./model";
import { exposurePatch, readExposure, tonePatch, toneReset } from "./params";
import { api } from "./rt";
import type { CanvasPoint, CatalogPhoto, DevelopParams, DevelopState, StageSpace } from "./safelight";
import { KEYS, MODE_LABEL, type Prefs } from "./settings";

export type AutoResult = { kind: "done"; status: string } | { kind: "failed"; reason: string };

const SCENE: StageSpace = { encoding: "linear", primaries: "rec709" };
const OUTPUT: StageSpace = { encoding: "perceptual", primaries: "rec709" };
const EV_RANGE = EXPOSURE_RANGES.ev;
const NEWTON = { tolerance: 0.01, maxSteps: 4, range: EV_RANGE };
/** Bisection steps between the two ends: ten renders in all. */
const BISECT_STEPS = 8;
/** Highlight priority's share: the brightest half percent. */
const PRIORITY_QUANTILE = 0.995;

const failed = (reason: string): AutoResult => ({ kind: "failed", reason });
const NO_PHOTO = "No photo is open.";
const NO_FRAME = "Couldn't measure the photo: this graphics card has no float render targets.";
const MOVED_ON = "The photo changed before the measurement finished.";

/** Ends a measurement whose answer would no longer be wanted or possible. */
class Stop extends Error {}

const develop = (): DevelopState => api.stores.useDevelopStore.getState();

export const signedEv = (ev: number): string => `${ev >= 0 ? "+" : "−"}${Math.abs(ev).toFixed(2)} EV`;

interface Session {
  photoId: string;
  params: DevelopParams;
  bag: Readonly<Record<string, unknown>>;
  exposure: Exposure;
}

function begin(): Session {
  const s = develop();
  if (!s.photoId) throw new Stop(NO_PHOTO);
  return { photoId: s.photoId, params: s.previewParams ?? s.params, bag: s.paramBag, exposure: readExposure(s.paramBag) };
}

function checked(session: Session, frame: Frame | null): Frame {
  if (develop().photoId !== session.photoId) throw new Stop(MOVED_ON);
  if (!frame) throw new Stop(NO_FRAME);
  return frame;
}

/** The whole photo, small, with `trial` over its exposure values: its scene
 *  with Black level and Midtones at rest, or its output. */
async function photoFrame(session: Session, trial: Partial<Exposure>, at: "scene" | "output"): Promise<Frame> {
  const bag = { ...session.bag, ...exposurePatch(trial), ...(at === "scene" ? toneReset() : {}) };
  const frame = await api.develop.renderPhotoFloatFrame(session.photoId, session.params, {
    point: at === "scene" ? "scene" : "pre-output",
    space: at === "scene" ? SCENE : OUTPUT,
    paramBag: bag,
  });
  return checked(session, frame);
}

/** The view's scene with `trial` over its exposure values, Black level and
 *  Midtones at rest. */
async function viewFrame(session: Session, trial: Partial<Exposure>): Promise<Frame> {
  const frame = await api.develop.captureFloatFrame(session.params, {
    point: "scene",
    space: SCENE,
    paramBag: { ...exposurePatch(trial), ...toneReset() },
  });
  return checked(session, frame);
}

const read = (value: number | null): number => {
  if (value === null) throw new Stop(NO_FRAME);
  return value;
};

async function run(work: () => Promise<AutoResult> | AutoResult): Promise<AutoResult> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof Stop) return failed(err.message);
    console.warn("[advanced-exposure] measurement failed:", err);
    return failed("The measurement failed; see the console.");
  }
}

function commit(session: Session, values: Record<string, number>, label: string): void {
  if (develop().photoId !== session.photoId) throw new Stop(MOVED_ON);
  develop().setDynParams(values);
  void develop().commitEdit(`Advanced Exposure ${label}`);
}

const hundredths = (v: number) => Number((Math.round(v * 100) / 100).toFixed(2));

function placeExposure(session: Session, solved: number, prefs: Prefs, label: string): AutoResult {
  const start = session.exposure.ev;
  const ev = clampTo(hundredths(start + (prefs.intensity / 100) * (solved - start)), EV_RANGE);
  commit(session, exposurePatch({ ev }), label);
  return { kind: "done", status: `Exposure ${signedEv(ev)}` };
}

/** Auto Exposure by `prefs.mode`; Spot weighted meters `spot` (a rectangle
 *  or a click on the view, 0–1 across the frame). */
export function autoExposure(prefs: Prefs, spot?: UvRect | Uv): Promise<AutoResult> {
  return run(async () => {
    const session = begin();
    const start = session.exposure.ev;
    const label = `auto (${MODE_LABEL[prefs.mode]})`;
    if (prefs.mode === "highlights" || prefs.mode === "ettr") {
      const q = prefs.mode === "highlights" ? PRIORITY_QUANTILE : prefs.ettr;
      const peak = async (ev: number) => read(peakQuantile(await photoFrame(session, { ev }, "output"), q));
      if (prefs.mode === "highlights" && (await peak(start)) <= prefs.high) return failed("No highlights reach the warning level.");
      const lo = Math.max(EV_RANGE.min, start - 5);
      const hi = prefs.mode === "highlights" ? start : Math.min(EV_RANGE.max, start + 5);
      // Highlight priority has measured its upper end already.
      const steps = prefs.mode === "highlights" ? BISECT_STEPS - 1 : BISECT_STEPS;
      return placeExposure(session, await bisect(peak, { lo, hi, limit: prefs.high, steps }), prefs, label);
    }
    const mode = prefs.mode;
    const target = MIDDLE_GREY * 2 ** prefs.target;
    const metered = async (ev: number): Promise<number> => {
      if (mode !== "spot") return read(meteredValue(await photoFrame(session, { ev }, "scene"), mode));
      if (!spot) throw new Stop("Drag a rectangle on the image, or click a spot, to meter.");
      const frame = await viewFrame(session, { ev });
      return read("x0" in spot ? meteredValue(frame, spot) : spotLuminance(frame, spot));
    };
    const { ev } = await newtonStops(metered, start, target, NEWTON);
    return placeExposure(session, ev, prefs, label);
  });
}

export function autoWhites(prefs: Prefs): Promise<AutoResult> {
  return run(async () => {
    const session = begin();
    const share = async (whites: number) => read(shareAtOrAbove(await photoFrame(session, { whites }, "output"), prefs.high));
    const whites = Math.floor(await bisect(share, { lo: -100, hi: 100, limit: prefs.clip, steps: BISECT_STEPS }));
    commit(session, exposurePatch({ whites }), "auto whites");
    return { kind: "done", status: `Whites ${whites}` };
  });
}

export function autoBlacks(prefs: Prefs): Promise<AutoResult> {
  return run(async () => {
    const session = begin();
    const share = async (blacks: number) => read(shareAtOrBelow(await photoFrame(session, { blacks }, "output"), prefs.low));
    const blacks = Math.ceil(await bisect(share, { lo: -100, hi: 100, limit: prefs.clip, steps: BISECT_STEPS, falling: true }));
    commit(session, exposurePatch({ blacks }), "auto blacks");
    return { kind: "done", status: `Blacks ${blacks}` };
  });
}

export function autoBlackLevel(prefs: Prefs): Promise<AutoResult> {
  return run(async () => {
    const session = begin();
    const darkest = read(luminanceQuantile(await photoFrame(session, {}, "scene"), prefs.clip));
    const black = clampTo(darkest * 100, TONE_RANGES.black);
    commit(session, tonePatch({ black }), "auto black level");
    return { kind: "done", status: `Black level ${black.toFixed(2)} %` };
  });
}

/** The press as 0–1 across the view's frame, which only captureFrame's bitmap
 *  (1:1 with the canvas) measures. */
async function pressUv(point: CanvasPoint, params: DevelopParams): Promise<Uv> {
  const bitmap = await api.develop.captureFrame(params, { paramBag: toneReset() });
  const { width, height } = bitmap;
  bitmap.close();
  const uv = { x: point.x / width, y: point.y / height };
  if (width < 2 || height < 2 || uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) throw new Stop("The press was off the image.");
  return uv;
}

export function measureSpot(point: CanvasPoint): Promise<AutoResult> {
  return run(async () => {
    const session = begin();
    const uv = await pressUv(point, session.params);
    const L = read(spotLuminance(await viewFrame(session, {}), uv));
    if (!(L > 0)) throw new Stop("The spot is black: there is nothing to match.");
    api.settings.set(KEYS.match, L);
    return { kind: "done", status: `Measured ${signedEv(Math.log2(L / MIDDLE_GREY))} from middle grey` };
  });
}

export function matchSpot(point: CanvasPoint, prefs: Prefs): Promise<AutoResult> {
  return run(async () => {
    if (prefs.match === null) throw new Stop("Measure a spot on a reference photo first.");
    const session = begin();
    const uv = await pressUv(point, session.params);
    const metered = async (ev: number) => read(spotLuminance(await viewFrame(session, { ev }), uv));
    const { ev } = await newtonStops(metered, session.exposure.ev, prefs.match, NEWTON);
    const placed = hundredths(ev);
    commit(session, exposurePatch({ ev: placed }), "match");
    return { kind: "done", status: `Exposure ${signedEv(placed)}` };
  });
}

/** A photo's in-camera exposure compensation, from its Exif; null for none. */
export function cameraEc(photoId: string | null, photos: readonly CatalogPhoto[] = api.stores.useCatalogStore.getState().photos): number | null {
  if (!photoId) return null;
  const ec = photos.find((p) => p.id === photoId)?.exif.exposureCompensation;
  return typeof ec === "number" && Number.isFinite(ec) && ec !== 0 ? ec : null;
}

export function undoCameraEc(): AutoResult {
  const s = develop();
  if (!s.photoId) return failed(NO_PHOTO);
  const ec = cameraEc(s.photoId);
  if (ec === null) return failed("The camera recorded no exposure compensation.");
  const ev = clampTo(hundredths(-ec), EV_RANGE);
  s.setDynParams(exposurePatch({ ev }));
  void s.commitEdit("Advanced Exposure undo camera compensation");
  return { kind: "done", status: `Exposure ${signedEv(ev)}` };
}

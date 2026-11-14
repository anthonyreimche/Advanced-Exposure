// The panel: the exposure rows, Highlight compression, Black level and
// Midtones, the meters and the series tools on the photo; Black level and
// Midtones alone in a mask; Shift+double-click auto and the Alt/Ctrl
// threshold view. Every row edits the extension's own values.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activate } from "../src/index";
import { THRESHOLD_STAGE_ID, exposureKey, readExposure, toneKey } from "../src/params";
import { AdvancedExposurePanel, SpotOverlay } from "../src/Panel";
import { React } from "../src/rt";
import { KEYS } from "../src/settings";
import type { FloatFrame } from "../src/safelight";
import { fakeApi, floatFrame, point, type RenderCall, type RigOptions } from "./support/fake-api";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const evOf = (call: RenderCall) => readExposure(call.options?.paramBag ?? {}).ev;
const scene = (call: RenderCall): FloatFrame =>
  floatFrame(40, 30, () => {
    const v = 0.045 * 2 ** evOf(call);
    return [v, v, v];
  });

function setup(options: RigOptions = {}) {
  const rig = fakeApi(options);
  activate(rig.api);
  rig.setRender(scene);
  const view = render(<AdvancedExposurePanel />);
  const slider = (label: string) => {
    const found = rig.sliders(view.container).find((s) => s.label === label);
    if (!found) throw new Error(`no ${label} slider`);
    return found;
  };
  return { rig, view, slider };
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const labels = (rig: ReturnType<typeof fakeApi>, root: ParentNode) => rig.sliders(root).map((s) => s.label);

describe("rows", () => {
  it("shows the exposure rows, Highlight compression, Black level and Midtones, in that order", () => {
    const { rig, view } = setup();
    expect(labels(rig, view.container)).toEqual([
      "Exposure",
      "Contrast",
      "Highlights",
      "Shadows",
      "Whites",
      "Blacks",
      "Amount",
      "Threshold",
      "Black level",
      "Midtones",
      "Target",
    ]);
  });

  it("edits the exposure stage's values, Exposure in hundredths", () => {
    const { rig, slider } = setup({ bag: { [exposureKey("ev")]: 0.5, [exposureKey("contrast")]: 10 } });
    expect(slider("Exposure")).toMatchObject({ value: 0.5, min: -5, max: 5, step: 0.01, defaultValue: 0, icon: "core.exposure" });
    expect(slider("Contrast")).toMatchObject({ value: 10, min: -100, max: 100, step: 1, icon: "core.contrast" });
    act(() => slider("Exposure").onChange(1.37));
    expect(rig.bag()[exposureKey("ev")]).toBe(1.37);
    expect(rig.commits).toEqual([]);
    act(() => slider("Exposure").onCommit?.());
    expect(rig.commits).toEqual(["Advanced Exposure exposure"]);
  });

  it("edits Highlight compression's amount and threshold", () => {
    const { rig, slider } = setup({ bag: { [exposureKey("threshold")]: 70 } });
    expect(slider("Amount")).toMatchObject({ value: 0, min: 0, max: 100, step: 1, defaultValue: 0 });
    expect(slider("Threshold")).toMatchObject({ value: 70, min: 50, max: 95, step: 1, defaultValue: 80 });
    act(() => slider("Amount").onChange(40));
    act(() => slider("Threshold").onChange(85));
    expect(rig.bag()).toEqual({ [exposureKey("compression")]: 40, [exposureKey("threshold")]: 85 });
    act(() => slider("Threshold").onCommit?.());
    expect(rig.commits).toEqual(["Advanced Exposure compression threshold"]);
  });

  it("edits Black level and Midtones in its own stage's bag", () => {
    const { rig, slider } = setup();
    expect(slider("Black level")).toMatchObject({ min: -2, max: 5, step: 0.01, defaultValue: 0 });
    expect(slider("Midtones")).toMatchObject({ min: -2, max: 2, step: 0.01, defaultValue: 0 });
    act(() => slider("Midtones").onChange(0.6));
    expect(rig.bag()).toEqual({ [toneKey("midtones")]: 0.6 });
  });

  it("offers only Black level and Midtones in a mask, writing the mask's bag", () => {
    const { rig, view, slider } = setup({ maskId: "m1" });
    expect(labels(rig, view.container)).toEqual(["Black level", "Midtones"]);
    act(() => slider("Black level").onChange(1.5));
    expect(rig.maskBag()).toEqual({ [toneKey("black")]: 1.5 });
    expect(rig.bag()).toEqual({});
    expect(screen.queryByRole("button", { name: "Auto" })).toBeNull();
  });
});

describe("auto", () => {
  it("runs the chosen meter on Auto with its intensity, and reports the result", async () => {
    const { rig } = setup();
    act(() => {
      rig.api.settings.set(KEYS.mode, "average");
      rig.api.settings.set(KEYS.target, 1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    await flush();
    expect(rig.bag()[exposureKey("ev")]).toBe(3);
    expect(rig.commits).toEqual(["Advanced Exposure auto (Average)"]);
    expect(screen.getByRole("status").textContent).toBe("Exposure +3.00 EV");
  });

  it("keeps the mode, intensity and target as preferences", () => {
    const { rig, slider } = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "Meter mode" }), { target: { value: "ettr" } });
    expect(rig.settings.get(KEYS.mode)).toBe("ettr");
    fireEvent.click(screen.getByRole("radio", { name: "Strong" }));
    expect(rig.settings.get(KEYS.intensity)).toBe(75);
    act(() => slider("Target").onChange(-0.7));
    expect(rig.settings.has(KEYS.target)).toBe(false);
    act(() => slider("Target").onCommit?.());
    expect(rig.settings.get(KEYS.target)).toBe(-0.7);
    expect(rig.bag()).toEqual({});
  });

  it("sets one value on Shift+double-click: Exposure, Whites, Blacks and Black level offer it", () => {
    const { slider } = setup();
    for (const label of ["Exposure", "Whites", "Blacks", "Black level"]) expect(slider(label).onAuto).toBeTypeOf("function");
    for (const label of ["Contrast", "Highlights", "Shadows", "Amount", "Threshold", "Midtones", "Target"]) {
      expect(slider(label).onAuto).toBeUndefined();
    }
  });

  it("meters Exposure alone on Shift+double-click", async () => {
    const { rig, slider } = setup();
    act(() => slider("Exposure").onAuto?.());
    await flush();
    expect(rig.bag()[exposureKey("ev")]).toBe(2);
    expect(rig.commits).toEqual(["Advanced Exposure auto (Average)"]);
  });

  it("arms a rectangle on the image for Spot weighted, and meters it on release", async () => {
    const { rig } = setup();
    act(() => rig.api.settings.set(KEYS.mode, "spot"));
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    const tool = rig.canvasTool();
    expect(tool).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Drag a rectangle on the image, or click a spot. Esc cancels.");
    const overlay = render(React.createElement(SpotOverlay, { rect: { x: 0, y: 0, w: 400, h: 300 } }));
    const surface = overlay.getByTestId("spot-surface");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 300 }));
    Object.defineProperty(surface, "offsetWidth", { value: 400 });
    Object.defineProperty(surface, "offsetHeight", { value: 300 });
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 60, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 200, clientY: 150, pointerId: 1 });
    await flush();
    expect(rig.canvasTool()).toBeNull();
    expect(rig.renders.every((c) => c.kind === "view")).toBe(true);
    expect(rig.commits).toEqual(["Advanced Exposure auto (Spot weighted)"]);
  });
});

describe("threshold view", () => {
  it("shows clipped highlights while Exposure, Highlights, Whites or compression is dragged with Alt or Ctrl", () => {
    const { rig, slider } = setup();
    for (const label of ["Exposure", "Highlights", "Whites", "Amount", "Threshold"]) {
      act(() => slider(label).onModifierPreview?.(true));
      expect(rig.viewValues()?.[`${THRESHOLD_STAGE_ID}.mode`]).toBe(1);
      act(() => slider(label).onModifierPreview?.(false));
      expect(rig.viewValues()).toBeNull();
    }
  });

  it("shows crushed shadows for Shadows, Blacks and Black level, at the warning levels", () => {
    const { rig, slider } = setup();
    act(() => rig.api.settings.set(KEYS.lowLevel, 10));
    for (const label of ["Shadows", "Blacks", "Black level"]) {
      act(() => slider(label).onModifierPreview?.(true));
      expect(rig.viewValues()).toEqual({
        [`${THRESHOLD_STAGE_ID}.mode`]: 2,
        [`${THRESHOLD_STAGE_ID}.high`]: 250 / 255,
        [`${THRESHOLD_STAGE_ID}.low`]: 10 / 255,
      });
      act(() => slider(label).onModifierPreview?.(false));
    }
  });

  it("is never part of the edit", () => {
    const { rig, slider } = setup();
    act(() => slider("Whites").onModifierPreview?.(true));
    expect(Object.keys(rig.bag()).some((k) => k.startsWith(THRESHOLD_STAGE_ID))).toBe(false);
  });

  it("lets go of the view when the panel closes mid-preview", () => {
    const { rig, view, slider } = setup();
    act(() => slider("Whites").onModifierPreview?.(true));
    view.unmount();
    expect(rig.viewValues()).toBeNull();
  });
});

describe("series", () => {
  it("offers the camera's compensation, and undoes it", () => {
    const { rig } = setup({ cameraEc: 0.7 });
    const button = screen.getByRole("button", { name: "Undo camera EC (+0.70 EV)" });
    fireEvent.click(button);
    expect(rig.bag()[exposureKey("ev")]).toBe(-0.7);
    expect(screen.getByRole("status").textContent).toBe("Exposure −0.70 EV");
  });

  it("disables Undo camera EC when the camera recorded none", () => {
    setup();
    expect((screen.getByRole("button", { name: "Undo camera EC" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("arms Measure and Match on the image, one press each, letting go after", async () => {
    const { rig } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    expect(rig.pickDrag()).not.toBeNull();
    act(() => rig.pickDrag()?.onPress?.(point(200, 150)));
    await flush();
    expect(rig.pickDrag()).toBeNull();
    expect(rig.settings.get(KEYS.match)).toBeCloseTo(0.045, 6);
    act(() => rig.develop.setState({ photoId: "photo-2" }));
    rig.setRender((call) =>
      floatFrame(40, 30, () => {
        const v = 0.01125 * 2 ** evOf(call);
        return [v, v, v];
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    act(() => rig.pickDrag()?.onPress?.(point(200, 150)));
    await flush();
    expect(rig.bag()[exposureKey("ev")]).toBe(2);
    expect(rig.commits).toEqual(["Advanced Exposure match"]);
  });

  it("stays armed with the same tool while the panel re-renders", () => {
    const { rig, slider } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    const tool = rig.pickDrag();
    act(() => slider("Exposure").onChange(0.5));
    act(() => rig.settle());
    expect(rig.pickDrag()).toBe(tool);
    expect(screen.getByRole("button", { name: "Measure" }).getAttribute("data-active")).toBe("true");
  });

  it("disarms when core lets go of the tool, and when the panel closes", () => {
    const { rig, view } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    act(() => rig.dropPickDrag());
    expect(screen.getByRole("button", { name: "Measure" }).getAttribute("data-active")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Match" }));
    view.unmount();
    expect(rig.pickDrag()).toBeNull();
  });
});

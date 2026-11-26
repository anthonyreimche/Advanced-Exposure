// What activate() registers: the exposure stage, the tone stage, the clipping
// view, the panel with its mask instance and Preferences ▸ Advanced Exposure,
// all named under the manifest's id; and that it needs nothing of Basic.

import { describe, expect, it } from "vitest";
import manifest from "../safelight.json";
import pkg from "../package.json";
import { PANEL_ID, activate } from "../src/index";
import { EXT_ID, TONE_KEYS, exposureKey, exposureReset, toneKey, toneReset } from "../src/params";
import { AdvancedExposurePanel } from "../src/Panel";
import { SETTINGS } from "../src/settings";
import { exposureStage, thresholdStage, toneStage } from "../src/stage";
import { fakeApi } from "./support/fake-api";

describe("activate", () => {
  it("registers the exposure stage, the tone stage and the clipping view", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.stages).toEqual([exposureStage(), toneStage(), thresholdStage()]);
  });

  it("names no Basic stage and lists no dependency", () => {
    expect(manifest).not.toHaveProperty("worksWith");
    expect(JSON.stringify([exposureStage(), toneStage(), thresholdStage()])).not.toContain("safelight.basic");
  });

  it("registers the panel in Develop, its mask instance owning Black level and Midtones", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.panels).toHaveLength(1);
    expect(rig.panels[0]).toMatchObject({
      id: PANEL_ID,
      title: "Advanced Exposure",
      component: AdvancedExposurePanel,
      defaultDock: { module: "develop", direction: "right", width: 280 },
      mask: { component: AdvancedExposurePanel, owns: TONE_KEYS.map(toneKey) },
    });
    expect(rig.settingsSections).toEqual([SETTINGS]);
  });

  it("resets every value it edits as one undo step, leaving other stages' values", () => {
    const rig = fakeApi({ bag: { [exposureKey("ev")]: 1.2, [exposureKey("whites")]: -10, [toneKey("black")]: 2, "other.stage.amount": 1 } });
    activate(rig.api);
    rig.panels[0].onReset?.();
    expect(rig.bag()).toEqual({ ...exposureReset(), ...toneReset(), "other.stage.amount": 1 });
    expect(rig.commits).toEqual(["Advanced Exposure reset"]);
  });

  it("names its contributions under the manifest's id", () => {
    expect(EXT_ID).toBe(manifest.id);
    expect(PANEL_ID.startsWith(`${manifest.id}.`)).toBe(true);
    for (const stage of [exposureStage(), toneStage(), thresholdStage()]) expect(stage.id.startsWith(`${manifest.id}.`)).toBe(true);
  });

  it("carries one version and licence in the manifest and the package, and needs the core with the open tone anchor and Slider auto", () => {
    expect(manifest.version).toBe("1.0.1");
    expect(pkg.version).toBe(manifest.version);
    expect(manifest.license).toBe("GPL-3.0-or-later");
    expect(pkg.license).toBe(manifest.license);
    expect(manifest.minAppVersion).toBe("3.2.8");
  });
});

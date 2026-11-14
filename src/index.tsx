// Advanced Exposure, a Safelight extension (GPL-3.0-or-later): exposure ahead
// of the tone mapping, with Contrast, Highlights, Shadows, Whites, Blacks and
// Highlight compression, then a linear Black level and Midtones; meters,
// per-slider auto and a clipping view (docs/SPEC.md). It runs on its own, or
// beside Basic, ahead of Basic's tone block. Registers the exposure stage (at
// the tone anchor), the tone stage, the clipping view, the Develop panel
// (which also edits a mask's Black level and Midtones) and Preferences ▸
// Advanced Exposure.

import { EXT_ID, TONE_KEYS, exposureReset, toneKey, toneReset } from "./params";
import { AdvancedExposurePanel } from "./Panel";
import { initRuntime } from "./rt";
import type { SafelightAPI } from "./safelight";
import { SETTINGS } from "./settings";
import { exposureStage, thresholdStage, toneStage } from "./stage";

export const PANEL_ID = `${EXT_ID}.panel`;

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  host.registerProcessingStage(exposureStage());
  host.registerProcessingStage(toneStage());
  host.registerProcessingStage(thresholdStage());
  host.registerPanel({
    id: PANEL_ID,
    title: "Advanced Exposure",
    component: AdvancedExposurePanel,
    defaultDock: { module: "develop", direction: "right", width: 280 },
    onReset: () => {
      const dev = host.stores.useDevelopStore.getState();
      dev.setDynParams({ ...exposureReset(), ...toneReset() });
      void dev.commitEdit("Advanced Exposure reset");
    },
    mask: { component: AdvancedExposurePanel, owns: TONE_KEYS.map(toneKey) },
  });
  host.registerSettings(SETTINGS);
}

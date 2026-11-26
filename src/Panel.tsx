// The panel. On the photo: the exposure stage's rows and Highlight
// compression, Black level and Midtones, Metering, and Series. In a mask, Black
// level and Midtones alone. Every row edits the param bag through the param
// scope. A drag writes live and commits on
// release, so one gesture is one undo step. Alt or Ctrl held during a drag
// shows the threshold view; Shift+double-click sets a row automatically.

import {
  type AutoResult,
  autoBlackLevel,
  autoBlacks,
  autoExposure,
  autoWhites,
  cameraEc,
  matchSpot,
  measureSpot,
  signedEv,
  undoCameraEc,
} from "./auto";
import type { Uv, UvRect } from "./metering";
import { DEFAULT_EXPOSURE, DEFAULT_TONE, EXPOSURE_RANGES, TONE_RANGES } from "./model";
import {
  exposurePatch,
  readExposure,
  readTone,
  thresholdView,
  tonePatch,
  type ExposureKey,
  type ThresholdMode,
  type ToneKey,
} from "./params";
import { React, api } from "./rt";
import type { CanvasPoint, OverlayRect2, ParamScope, SliderProps } from "./safelight";
import {
  INTENSITIES,
  INTENSITY_LABEL,
  KEYS,
  METER_MODES,
  MODE_LABEL,
  TARGET_RANGE,
  readPrefs,
  usePrefs,
  type Prefs,
} from "./settings";

const EXPOSURE_ROWS: readonly { key: ExposureKey; label: string }[] = [
  { key: "ev", label: "Exposure" },
  { key: "contrast", label: "Contrast" },
  { key: "highlights", label: "Highlights" },
  { key: "shadows", label: "Shadows" },
  { key: "whites", label: "Whites" },
  { key: "blacks", label: "Blacks" },
];

const COMPRESSION_ROWS: readonly { key: ExposureKey; label: string; commit: string }[] = [
  { key: "compression", label: "Amount", commit: "highlight compression" },
  { key: "threshold", label: "Threshold", commit: "compression threshold" },
];

const TONE_ROWS: readonly { key: ToneKey; label: string }[] = [
  { key: "black", label: "Black level" },
  { key: "midtones", label: "Midtones" },
];

/** Which threshold view a row shows while dragged with Alt or Ctrl. */
const PREVIEW: Readonly<Partial<Record<ExposureKey | ToneKey, ThresholdMode>>> = {
  ev: "highlights",
  highlights: "highlights",
  whites: "highlights",
  compression: "highlights",
  threshold: "highlights",
  shadows: "shadows",
  blacks: "shadows",
  black: "shadows",
};

type Report = (result: AutoResult) => void;

/** The threshold view while a drag holds Alt or Ctrl, dropped when the panel
 *  closes mid-drag. */
function useThresholdPreview(prefs: Prefs) {
  const showing = React.useRef(false);
  React.useEffect(
    () => () => {
      if (showing.current) api.develop.setViewValues(null);
    },
    [],
  );
  return (mode: ThresholdMode | undefined): SliderProps["onModifierPreview"] =>
    mode &&
    ((active: boolean) => {
      showing.current = active;
      api.develop.setViewValues(active ? thresholdView(mode, prefs) : null);
    });
}

export function AdvancedExposurePanel() {
  const scope = api.develop.useParamScope();
  return <div style={{ padding: 8 }}>{scope.maskId === null ? <PhotoPanel scope={scope} /> : <ToneRows scope={scope} />}</div>;
}

interface ToneRowsProps {
  scope: ParamScope;
  preview?: (mode: ThresholdMode | undefined) => SliderProps["onModifierPreview"];
  onAutoBlack?: () => void;
}

function ToneRows({ scope, preview, onAutoBlack }: ToneRowsProps) {
  const { Slider } = api.components;
  const tone = readTone(scope.getParams());
  return (
    <>
      {TONE_ROWS.map(({ key, label }) => (
        <Slider
          key={key}
          label={label}
          value={tone[key]}
          min={TONE_RANGES[key].min}
          max={TONE_RANGES[key].max}
          step={TONE_RANGES[key].step}
          defaultValue={DEFAULT_TONE[key]}
          onChange={(v) => scope.setParams(tonePatch({ [key]: v }))}
          onCommit={() => scope.commit(`Advanced Exposure ${label.toLowerCase()}`)}
          onModifierPreview={preview?.(PREVIEW[key])}
          onAuto={key === "black" ? onAutoBlack : undefined}
        />
      ))}
    </>
  );
}

function PhotoPanel({ scope }: { scope: ParamScope }) {
  const { AutoButton, Slider } = api.components;
  const { Section, tokens } = api.ui;
  const prefs = usePrefs();
  const hasPhoto = api.stores.useDevelopStore((s) => s.photoId !== null);
  const exposure = readExposure(scope.getParams());
  const [status, setStatus] = React.useState("");
  const preview = useThresholdPreview(prefs);
  const held = api.develop.useCanvasToolHeld();

  // Another tool or a picker took the canvas: Spot weighted stands down.
  React.useEffect(() => {
    if (!held) cancelSpot();
  }, [held]);

  const report = React.useCallback<Report>((r) => setStatus(r.kind === "done" ? r.status : r.reason), []);
  const measuring = React.useCallback(
    (work: () => Promise<AutoResult>) => {
      setStatus("Measuring…");
      void work().then(report);
    },
    [report],
  );
  const runAuto = () => {
    const now = readPrefs();
    if (now.mode === "spot") {
      armSpot((spot) => measuring(() => autoExposure(readPrefs(), spot)), () => setStatus(""));
      setStatus("Drag a rectangle on the image, or click a spot. Esc cancels.");
      return;
    }
    measuring(() => autoExposure(now));
  };

  const AUTO: Partial<Record<ExposureKey, () => void>> = {
    ev: runAuto,
    whites: () => measuring(() => autoWhites(readPrefs())),
    blacks: () => measuring(() => autoBlacks(readPrefs())),
  };

  const row = (key: ExposureKey, label: string, commit = label.toLowerCase(), icon?: string) => (
    <Slider
      key={key}
      icon={icon}
      label={label}
      value={exposure[key]}
      min={EXPOSURE_RANGES[key].min}
      max={EXPOSURE_RANGES[key].max}
      step={EXPOSURE_RANGES[key].step}
      defaultValue={DEFAULT_EXPOSURE[key]}
      onChange={(v) => scope.setParams(exposurePatch({ [key]: v }))}
      onCommit={() => scope.commit(`Advanced Exposure ${commit}`)}
      onModifierPreview={preview(PREVIEW[key])}
      onAuto={AUTO[key]}
    />
  );

  return (
    <>
      <AutoButton title={`Auto exposure (${MODE_LABEL[prefs.mode]})`} disabled={!hasPhoto} onClick={runAuto} />
      {EXPOSURE_ROWS.map(({ key, label }) => row(key, label, label.toLowerCase(), `core.${key === "ev" ? "exposure" : key}`))}
      <Section title="Highlight compression">{COMPRESSION_ROWS.map(({ key, label, commit }) => row(key, label, commit))}</Section>
      <ToneRows scope={scope} preview={preview} onAutoBlack={() => measuring(() => autoBlackLevel(readPrefs()))} />
      <Metering prefs={prefs} />
      <Series report={report} measuring={measuring} />
      <div role="status" aria-live="polite" style={{ color: tokens.textMuted, fontSize: 11, minHeight: 14, marginTop: 4 }}>
        {status}
      </div>
    </>
  );
}

function Metering({ prefs }: { prefs: Prefs }) {
  const { Slider } = api.components;
  const { Section, Select, SegmentedControl, Stack } = api.ui;
  const [draftTarget, setDraftTarget] = React.useState<number | null>(null);
  return (
    <Section title="Metering">
      <Stack gap={6}>
        <Select
          ariaLabel="Meter mode"
          value={prefs.mode}
          options={METER_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
          onChange={(v) => api.settings.set(KEYS.mode, v)}
        />
        <SegmentedControl
          size="sm"
          value={String(prefs.intensity)}
          options={INTENSITIES.map((i) => ({ value: String(i), label: INTENSITY_LABEL[i], title: `${i} % of the metered change` }))}
          onChange={(v) => api.settings.set(KEYS.intensity, Number(v))}
        />
        <Slider
          label="Target"
          value={draftTarget ?? prefs.target}
          min={TARGET_RANGE.min}
          max={TARGET_RANGE.max}
          step={TARGET_RANGE.step}
          defaultValue={0}
          onChange={setDraftTarget}
          onCommit={() => {
            if (draftTarget !== null) api.settings.set(KEYS.target, draftTarget);
            setDraftTarget(null);
          }}
        />
      </Stack>
    </Section>
  );
}

type PickKind = "measure" | "match";

interface SeriesProps {
  report: Report;
  measuring: (work: () => Promise<AutoResult>) => void;
}

function Series({ report, measuring }: SeriesProps) {
  const { Button, Row, Section } = api.ui;
  const photoId = api.stores.useDevelopStore((s) => s.photoId);
  const photos = api.stores.useCatalogStore((s) => s.photos);
  const ec = cameraEc(photoId, photos);
  const held = api.develop.usePickDragHeld();
  const [picking, setPicking] = React.useState<PickKind | null>(null);

  // Core lets go of the tool on Escape, or when another extension takes it.
  React.useEffect(() => {
    if (!held) setPicking(null);
  }, [held]);

  React.useEffect(() => {
    if (!picking) return;
    const onPress = (point: CanvasPoint) => {
      setPicking(null);
      measuring(() => (picking === "measure" ? measureSpot(point) : matchSpot(point, readPrefs())));
    };
    api.develop.setPickDrag({ onPress });
    return () => api.develop.setPickDrag(null);
  }, [picking, measuring]);

  const pickButton = (kind: PickKind, label: string, title: string) => (
    <Button
      size="sm"
      active={picking === kind}
      aria-pressed={picking === kind}
      title={`${title} (Esc cancels)`}
      disabled={!photoId}
      onClick={() => setPicking(picking === kind ? null : kind)}
    >
      {label}
    </Button>
  );

  return (
    <Section title="Series">
      <Row gap={6} wrap>
        <Button size="sm" disabled={ec === null} onClick={() => report(undoCameraEc())} title="Set Exposure to cancel the compensation the camera was set to">
          {ec === null ? "Undo camera EC" : `Undo camera EC (${signedEv(ec)})`}
        </Button>
        {pickButton("measure", "Measure", "Click a spot on the reference photo to keep its brightness")}
        {pickButton("match", "Match", "Click the same subject on this photo to give it the measured brightness")}
      </Row>
    </Section>
  );
}

let pendingSpot: { pick: (spot: UvRect | Uv) => void; cancel: () => void } | null = null;

/** Hand the canvas to the Spot weighted rectangle; `pick` gets what was drawn. */
function armSpot(pick: (spot: UvRect | Uv) => void, cancel: () => void): void {
  pendingSpot = { pick, cancel };
  api.develop.setCanvasTool({
    overlay: SpotOverlay,
    zoomable: true,
    onEscape: cancelSpot,
  });
}

function cancelSpot(): void {
  pendingSpot?.cancel();
  pendingSpot = null;
}

/** A drag shorter than this, in screen pixels, is a click on a spot. */
const CLICK_PX = 4;

/** The Spot weighted rectangle over the image. `rect` is the box the frame
 *  shows; the pointer is placed in its layout px, which Interface scale
 *  leaves as it is. */
export function SpotOverlay({ rect }: { rect: OverlayRect2 }) {
  const { tokens } = api.ui;
  const [drag, setDrag] = React.useState<{ from: Uv; to: Uv; startX: number; startY: number } | null>(null);

  const uvAt = (e: React.PointerEvent<HTMLDivElement>): Uv => {
    const p = api.develop.framePoint(e.currentTarget, e.clientX, e.clientY);
    return { x: (p.x - rect.x) / rect.w, y: (p.y - rect.y) / rect.h };
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const to = uvAt(e);
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= CLICK_PX;
    const spot: UvRect | Uv = moved ? { x0: drag.from.x, y0: drag.from.y, x1: to.x, y1: to.y } : drag.from;
    setDrag(null);
    const pending = pendingSpot;
    pendingSpot = null;
    api.develop.setCanvasTool(null);
    pending?.pick(spot);
  };

  const box =
    drag &&
    ({
      left: rect.x + Math.min(drag.from.x, drag.to.x) * rect.w,
      top: rect.y + Math.min(drag.from.y, drag.to.y) * rect.h,
      width: Math.abs(drag.to.x - drag.from.x) * rect.w,
      height: Math.abs(drag.to.y - drag.from.y) * rect.h,
    } as const);

  return (
    <div
      data-testid="spot-surface"
      style={{ position: "absolute", inset: 0, cursor: api.cursors.resolve("pick"), pointerEvents: "auto" }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const at = uvAt(e);
        setDrag({ from: at, to: at, startX: e.clientX, startY: e.clientY });
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, to: uvAt(e) })}
      onPointerUp={finish}
    >
      {box && <div style={{ position: "absolute", ...box, border: `1px solid ${tokens.accent}`, pointerEvents: "none" }} />}
    </div>
  );
}

# Advanced Exposure: specification

Issue #239. Anthony approved the proposal on 2026-11-13, then ruled that
Advanced Exposure runs on its own: "No, make Advanced Exposure run on its
own." The survey behind it is [RESEARCH.md](RESEARCH.md); the first design,
now replaced, is [SPEC-1.0.0.md](SPEC-1.0.0.md). The UI never names another
program.

**The idea.** A power-user exposure tool with values of its own, rendered
where a true exposure belongs: on the linear image after White Balance and
ahead of any tone mapping. Around them it adds precision, metering,
automation and clipping feedback. It needs nothing else. If Basic is also
installed, both apply, like two exposure modules: Advanced Exposure first,
then Basic's tone block (its Exposure, Highlights, Shadows and the default
shoulder).

The extension is unreleased, so it stays at 1.0.0. Its param bag changed from
the earlier drafts. The `advanced-exposure.exposure.{ev,black,protect}` keys
of the first draft and the second draft's writes to Basic's DevelopParams and
to `safelight.basic.highlight-compression.*` are gone. The keys are now
`advanced-exposure.exposure.*` (below) and `advanced-exposure.tone.{black,midtones}`.

## Where it runs: the open tone anchor (core 3.2.5)

Every extension stage in `scene-linear` runs after the tone block, so an
exposure there arrives after Basic's shoulder has already rolled the
highlights off. Two seams could put a stage ahead of it:

1. **List Advanced Exposure as an official extension**
   (`electron/official-extensions.json`), which would let it use anchors as
   Basic does. Rejected. That list is the Essentials extracted from core (plus
   Developer Tools): the essentials migration treats every row whose `replaces`
   is null as extracted and installs it on existing profiles. Official stages
   also write raw, un-namespaced GLSL. Listing it would auto-install it and
   grant more than a placement.
2. **Open the `tone` anchor to every extension** (chosen). An extension's
   `scene-linear` stage that names `anchor: "tone"` is written at that anchor
   as its own namespaced, braced block. It runs with Safelight's stages there
   by priority, so at priority 10 it runs ahead of Basic's tone block
   (priority 100). It can't declare passes, a space, a mask, reads or produces,
   and registration refuses it otherwise. Every other anchor stays Safelight's.
   The change is additive. A program without such a stage is the same text,
   so no frozen hash moves and no photo changes; the GPU spec proves it
   bit-identical with and without Advanced Exposure, with and without Basic,
   on process versions 1, 2 and 3.

`minAppVersion` is 3.2.5, for the open anchor, Slider `onAuto` and view-only
stages (3.2.4). Older builds ignore the anchor and would run the stage after
the shoulder.

## Values

### `advanced-exposure.exposure`: at the tone anchor, priority 10, not maskable

| Row | Key | Range, step | Default |
|---|---|---|---|
| Exposure | `ev` | ±5 EV, 0.01 | 0 |
| Contrast | `contrast` | ±100, 1 | 0 |
| Highlights | `highlights` | ±100, 1 | 0 |
| Shadows | `shadows` | ±100, 1 | 0 |
| Whites | `whites` | ±100, 1 | 0 |
| Blacks | `blacks` | ±100, 1 | 0 |
| Highlight compression: Amount | `compression` | 0 to 100, 1 | 0 (off) |
| Highlight compression: Threshold | `threshold` | 50 to 95 % of white, 1 | 80 |

`dormantWhen` holds every key but `threshold` at 0. At rest the block is skipped.

Maths (model.ts `exposePixel`, linear Rec.709, `L` the Rec.709 luminance):

1. Gain `g = 2^ev`. With every shaping value at 0 the colour is scaled by `g`
   exactly: a true exposure in stops.
2. Shaping, when any of Contrast to Blacks is set and `L > 0`. Work in stops
   from middle grey after the gain, `e = log2(L·g / 0.18)`, and apply in turn:
   - Contrast: `e ← e·(1 + 0.5c)`.
   - Shadows: `e ← e + 1.5s·(1 − smoothstep(−4.5, 0, e))`.
   - Highlights: `e ← e + 1.5h·smoothstep(−1, 2.5, e)`.
   - Whites: `e ← e + w·smoothstep(1.5, 3.5, e)`.
   - Blacks: `e ← e + b·(1 − smoothstep(−8, −3.5, e))`.

   Here `c, s, h, w, b` are each slider ÷ 100. Each step's slope stays above
   zero, so brightness keeps its order at every setting. The colour is scaled
   by `0.18·2^e / L`, which keeps hue and saturation ratios. Contrast pivots on
   middle grey.
3. Highlight compression, when Amount > 0. With `n` the brightest channel and
   knee `t` = Threshold/100, for `n > t` the roll-off is
   `t + (1 − t)(n − t)/(n − t + 1 − t)`: slope 1 at the knee, white as its
   limit. All three channels are scaled by `mix(1, rolled/n, Amount/100)`.

Highlights and Shadows here are global tone bands, not Basic's local
(region-based) ones. Exposure by EV band at finer detail stays Tone
Equalizer's.

### `advanced-exposure.tone`: scene-linear, priority 10, maskable

| Row | Key | Range, step |
|---|---|---|
| Black level | `black` | −2 to +5 % of white, 0.01 |
| Midtones | `midtones` | ±2 EV at middle grey, 0.01 |

`x' = (x − b)/(1 − b)`. Midtones raises luminance to the power
`γ = ln(0.18·2^m)/ln 0.18`, applied as a ratio. These run after the tone
block (and Basic's shoulder, when Basic is installed), where masks can reach
them. Masks get these two only.

## Auto, per-slider auto, series

As approved:

- **Auto modes:** Average, Centre-weighted, Spot weighted (a rectangle or a
  click on the image), Highlight priority (only darkens) and Expose to the
  right.
- **Intensity:** Slight / Medium / Strong / Full.
- **Target:** stops from middle grey, a preference.
- **Shift+double-click** (core Slider `onAuto`): Exposure, Whites, Blacks and
  Black level.
- **Series:** Undo camera EC, Measure and Match.

They now write `advanced-exposure.exposure.*` (and `advanced-exposure.tone.black`).

- Scene modes measure at the scene point with Black level and Midtones at
  rest, solving for `ev` by Newton steps in stops (at most 4 renders).
- Output modes and Whites/Blacks bisect on the output with the whole edit (at
  most 10 renders).
- Each puts its trial values in the render's param bag.

## Clipping view

`advanced-exposure.threshold`, unchanged: a view-only output-encode stage
driven by `setViewValues` while a slider is dragged with Alt or Ctrl. It never
reaches the edit, an export, a thumbnail or a measurement (GPU-tested).

## Speed

A drag changes uniforms only. There are no passes and no texture reads. Both
editing stages are dormant at rest, and the clipping view sits behind its
uniform. Auto and Match run off the drag path and commit once.

## Left to others

- Exposure by EV band → Tone Equalizer.
- Point curves → Tone Curve.
- Per-channel levels → Tone Levels.
- Presence and colour → Basic.
- The scope → Exposure Histogram.
- The persistent clipping overlay → core.
- No face-priority metering: Safelight has no face detector.
- The scene histogram strip is left for a later version.

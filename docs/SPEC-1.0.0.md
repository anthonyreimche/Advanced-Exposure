# Advanced Exposure: specification

Issue anthonyreimche/SafeLight#239, "Extension: Advanced exposure tools: a more
advanced version of the basic panel."

Basic gives one Exposure slider (±5 EV in tenths, before the tone shoulder) and
Auto Tone, which sets six sliders at once from the histogram. Advanced Exposure
is for the photographer who wants to place exposure on purpose: in exact stops,
by metering a part of the picture, with a known black level, and with a
readout of what clips. It is one scene-linear stage and one panel.

## Controls

### Stage values (per photo, in the edit)

Stored in the param bag under `advanced-exposure.exposure.{key}`. All three
are maskable, so a mask can carry its own.

| Key | Label | Range | Step | Default | Unit |
|---|---|---|---|---|---|
| `ev` | Exposure | −6 to +6 | 0.01 | 0 | stops (EV) |
| `black` | Black level | −2 to +5 | 0.01 | 0 | percent of white, in linear light |
| `protect` | Highlight protection | 0 to 100 | 1 | 100 | percent |

### Panel-only tools (never in the edit)

- **Spot meter** (eyedropper): click the image; Exposure is set so the
  clicked spot lands on the **Target**.
- **Black point** (eyedropper): click the image; Black level is set so the
  clicked spot becomes black.
- **Auto** (the panel's small Auto button, top right, as in Basic) runs the
  chosen meter mode: **Average**, **Centre-weighted** or **Highlights**. One
  click sets Exposure from the whole photo.
- **Target**: where the metered value is placed, in stops from middle grey
  (18 %), −4 to +2 in 0.1 steps, default 0. A preference (Settings), not part
  of any photo's edit, like a camera's exposure compensation dial. The meter
  mode is a preference too.
- **Clipping readout**: the share of the photo whose highlights clip and whose
  shadows are crushed, as the edit renders now, with buttons that turn on the
  core's clipping overlay for each.

Each tool that changes the edit is one undo step: "Advanced Exposure spot
meter", "Advanced Exposure black point", "Advanced Exposure auto (Average)" and
so on. Slider drags commit on release as "Advanced Exposure exposure" etc.

## Maths

Linear Rec.709 light, `x` an input channel value, `g = 2^ev`, `b = black/100`.

### Exposure and black level

    y = (x − b) / (1 − b) · g

per channel, the same for all three. The black level is the input value that
becomes 0, and input white (1.0) stays where Exposure alone puts it: at `g`.
With `b = 0` it is a plain gain of `g`, exact in stops. `1 − b ≥ 0.95` over the
whole range, so the division is safe. A negative black level lifts the
blacks (adds a veil); a positive one removes one.

### Highlight protection

The core tone shoulder runs before every scene-linear stage (when the photo's
display transform doesn't skip it), so the stage receives highlights already
rolled off under white. A plain gain above 0 EV pushes them back past white,
where they clip hard. Protection rolls off the gained values instead, so that
**no channel that was at or under white before the stage ends above white**.

It acts on the brightest channel `n = max(r, g, b)` of `y`, scaling all three
by the same ratio, so hue and saturation are kept. With knee `K = 0.75`,
`M = g` (where input white went) and `M > 1`:

    d = 1 − K,  E = M − K,  r = d · E / (E − d)
    s(n) = n                              for n ≤ K
    s(n) = K + r · (n − K) / (n − K + r)  for n > K

`s` is continuous with slope 1 at the knee, increasing, and `s(M) = 1`
exactly. As `M → 1` it tends to the identity. The protected colour is
`y · mix(1, s(n)/n, protect/100)`.

Protection only acts while `g > 1`. Below the knee nothing changes, so middle
grey up to +2 EV (0.18 · 4 = 0.72) is placed exactly. On a display transform
that skips the core shoulder (scene values above 1), protection still maps 1.0
to white and compresses the headroom above it; turn it down to hand the
headroom to the transform instead.

### Metering

Luminance `L = 0.2126 r + 0.7152 g + 0.0722 b` of the linear scene as the
display transform receives it, measured with this stage's photo values at
their defaults (other tools' edits included, and a mask's own Advanced
Exposure inside that mask). Target value `T = 0.18 · 2^target`.

- **Spot meter:** `L` is the mean over a disc of radius 1 % of the frame's
  long edge (at least 2 px) around the click. Then
  `ev = log2(T · (1 − b) / (L − b))`, which puts the spot exactly on `T`
  through the formula above (exact while the spot's brightest channel stays
  under the knee). A spot at or below the black level can't be metered.
- **Black point:** `b = L` at the spot (mean over the same disc), so the spot
  maps to 0. Values outside the range clamp to it.
- **Average:** the log average `exp2(mean(log2(max(L, 2^−14))))` over the
  whole photo → `T`, as the spot meter.
- **Centre-weighted:** the same log average, each pixel weighted by
  `exp(−ρ² / (2 · 0.35²))`, `ρ` its distance from the centre in units of the
  half-width and half-height (an ellipse fitted to the frame).
- **Highlights:** `P` is the 99.5th percentile of each pixel's brightest
  channel; `ev = log2((1 − b) / (P − b))` puts it on white. With protection on,
  the brightest half percent rolls off below white instead of clipping. The
  Target doesn't apply.

A result outside −6 to +6 clamps to the range, and the panel says so. A photo
that can't be measured (no float render targets, no photo) leaves the edit as
it was and says why.

### Clipping readout

From the whole photo, rendered small (at most 640 px) with the current edit at
the signed colour the output stage receives: **highlights** is the share of
pixels with any channel at or above 1, **shadows** the share with every
channel at or below 0. These are the core clipping overlay's own rules. It is
measured after each settled render while the panel is open, at most every
200 ms, one render in flight. A small frame averages neighbouring pixels, so
isolated clipped pixels count for less than in the full-size overlay.

## Stage placement

- `scene-linear`, priority 10: after the core's linear edits (White Balance,
  Basic's Exposure, Highlights, Shadows and shoulder, mask tone), before other
  scene-linear stages at the default priority, such as Tone Equalizer (50), so
  those see the exposed image.
- No `space`: the default linear Rec.709 `lin` is what the maths is written
  for. No passes, no texture reads: a handful of ALU operations per pixel.
- `dormantWhen: { ev: 0, black: 0 }`: at those values the stage is an exact
  no-op whatever `protect` holds, and its GLSL skips its block. The live view
  leaves it out of the program until a photo needs it (Safelight 3.2.1+).
- `mask: { maskable: true }`: a mask's copy applies the mask's values inside
  the mask, on version 2 photos and later.
- `presetScope: "global"`.
- The same text on every process version: the stage is new, so there are no
  older photos whose look it must keep.

## What it leaves to others

- **Exposure by tonal range** (brighten the shadows only, darken one octave):
  Tone Equalizer. Range-limited exposure would duplicate it.
- **Local exposure in an area:** Masking, with this stage's own mask copy.
- **Contrast, Highlights, Shadows, Whites, Blacks** as tone shapes, and the
  default shoulder: Basic. Advanced Exposure doesn't touch Basic's sliders and
  works whether Basic is installed or not.
- **Tone curves and levels in display values:** Tone Curve and Tone Levels.
- **The exposure histogram in stops:** Exposure Histogram. The readout here is
  two numbers, for metering, not a scope.
- **Scene-to-display mapping and its white/black relative exposure:**
  Parametric Tone Mappers.
- **The clipping overlay itself:** core's (the readout's buttons turn it on).

## Minimum app version

3.2.1, for `dormantWhen`: the stage stays out of the program until a photo
moves Exposure or Black level. The rest needs 3.2.0: `setPickDrag`/
`usePickDragHeld` for the eyedroppers, `useParamScope`, float captures at the
scene point, masks for extension stages.

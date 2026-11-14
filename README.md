# Advanced Exposure for Safelight

Exposure where a true exposure belongs: on the linear image, ahead of any tone
mapping. It runs on its own. With Basic also installed, both apply,
Advanced Exposure first, then Basic's tone block. Around its values it adds
metering, automation and a clipping view. The specification, with the maths,
is [docs/SPEC.md](docs/SPEC.md); the survey of exposure tools it draws on is
[docs/RESEARCH.md](docs/RESEARCH.md).

- **Exposure** in hundredths of a stop (±5): an exact gain in linear light.
- **Contrast** in stops about middle grey, and **Highlights, Shadows, Whites,
  Blacks**, each moving its band of the tonal range by up to 1.5 (or 1)
  stops, with brightness always kept in order.
- **Highlight compression:** **Amount** rolls the brightest channel off from
  the **Threshold** towards white, keeping hue. Off by default.
- **Black level:** the level, in percent of white and in linear light, that
  becomes black, with white kept.
- **Midtones:** moves middle grey up to two stops either way, with black and
  white fixed.
- **Auto** (top right) runs the meter mode chosen under Metering:
  - **Average** and **Centre-weighted** place the photo's log average on the
    Target, in stops from middle grey.
  - **Spot weighted** asks you to drag a rectangle on the image, or click a
    spot.
  - **Highlight priority** only darkens, until the brightest half percent is
    under the highlight warning level.
  - **Expose to the right** puts a percentile of the brightest channel on that
    level, darker or brighter.

  **Intensity** (Slight, Medium, Strong, Full) applies 25 to 100 % of the
  metered change.
- **Shift+double-click** a slider to set it alone: Exposure meters with the
  current mode, Whites and Blacks go to where 0.1 % of the photo reaches the
  warning levels, and Black level makes the darkest 0.1 % black. A plain
  double-click still resets.
- **Clipping view:** hold Alt or Ctrl while dragging Exposure, Highlights,
  Whites or Highlight compression, and the image goes black except where a
  channel reaches the highlight warning level, shown in that channel's colour.
  Shadows, Blacks and Black level show the reverse. It appears only in the
  live view, never in an export or a thumbnail.
- **Series:**
  - **Undo camera EC** cancels the exposure compensation the camera was set
    to.
  - **Measure** a spot on a reference photo, then **Match** the same subject
    on the next photos, to give them the same brightness.

The warning levels (250 and 5 on the 0–255 scale), the clip share and the
Expose to the right percentile are in **Preferences ▸ Advanced Exposure**. The
meter mode, intensity, target and the measured spot are kept between photos.

Needs Safelight 3.2.5, which lets an extension run ahead of the tone mapping.

**In masks:** add Advanced Exposure to a mask from the Masking panel's Adjust
tab for a Black level and Midtones inside the mask. It needs the current
processing: on a photo edited in an earlier Safelight, use Update processing
first.

## Development

```bash
npm install
npm run check      # typecheck, build, then the unit tests
npm run test:gpu   # the stages on a SafeLight checkout's WebGL rig (SAFELIGHT_CORE=…)
```

`npm test` reads `dist/` for the bundle checks, so build first.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).

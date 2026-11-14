# Exposure tools in popular raw editors

Research for issue #239, after Anthony's verdict on 1.0.0: "Not very good, see
popular exposure tools from other raw editors." Surveyed 2026-11-13 from
official manuals where they were reachable and from reviews and user forums
where they weren't (marked *forum*). The names of other programs appear here
for reference only. They never appear in the extension's UI.

## Tool × editor

| Tool | Lightroom / ACR | Capture One | DxO PhotoLab | darktable | RawTherapee / ART | Basic (Safelight) |
|---|---|---|---|---|---|---|
| **Exposure in stops** | Exposure ±5 EV. Moves the midtones, with the highlight roll-off built into the process | Exposure ±4 EV; Brightness separately | Exposure Compensation ±4 EV | Exposure, ±3 on the slider and ±18 typed, in linear scene light before the tone mapper | Exposure compensation, before the tone curves | Exposure ±5 EV in tenths, before the shoulder |
| **Remove the camera's exposure compensation** | – | – | – | "Compensate camera exposure": subtracts the Exif bias | – | – |
| **Midtones / brightness, end points fixed** | (via Exposure) | **Brightness**: moves the mid-point and keeps black and white | Selective Tone **Midtones** | (via the tone mapper) | **Lightness** (RT) | – |
| **Highlight recovery** | Highlights; Whites | HDR **Highlight**: reviewers rate it best, with "no halos" at extremes | Selective Tone Highlights (*forum*: too broad, it moves the midtones) | Tone mapper; highlight reconstruction | **Highlight compression + threshold**, paired with highlight reconstruction | Highlights (local on v2) |
| **Shadow recovery** | Shadows; Blacks | HDR **Shadow** ("keep low for natural results") | **Smart Lighting** (local); Selective Tone Shadows | Tone equalizer | Shadow compression; tone equalizer (ART) | Shadows (local on v2) |
| **End points** | Whites / Blacks | HDR White / Black; **Levels** (per channel, auto) | Selective Tone Blacks | **Black level correction**; filmic white/black | **Black** (RT); black point compensation (ART) | Whites / Blacks (display gamma) |
| **Auto** | Auto (adaptive); **Shift + double-click** one slider sets it alone (Whites/Blacks to the first clipping pixels) | Auto Adjust; **Auto Levels at a 0.1 % clip threshold** (set in Preferences) | **Smart Lighting** Uniform / **Spot weighted** (faces, or a rectangle you draw), with Slight / Medium / Strong intensity; Exposure Compensation auto: **Highlight priority** Slight/Medium/Strong, or **Centre-weighted average** | **Automatic mode**: shift a chosen histogram **percentile** to a target level (deflicker) | **Auto Levels** with a **Clip %** | Auto Tone (six sliders) |
| **Spot or area metering** | – | – | Spot weighted rectangle | Picker on Exposure: puts the area's mean on a target. **Area exposure mapping**: measure on a reference photo, the target persists across photos and sessions, correct the others to it | – | – |
| **Histogram as a control** | **Drag the Blacks / Shadows / Exposure / Highlights / Whites zones**, which highlight on hover | Levels handles on the histogram | – | Drag the scope to move exposure or black (scene-referred) | Curve over the histogram | Core histogram drags Basic's sliders |
| **Clipping feedback** | **Alt-drag** a slider: threshold view, black (or white) with clipped channels in colour; J toggles the overlay | Exposure warning with **adjustable threshold** (250 by default), per channel, colours set in Preferences; shadow warning optional | Clipping masks | Raw and processed over-/under-exposure indicators | Clipping indicators with adjustable thresholds | Core overlay (≥ 1, ≤ 0) |
| **Tone curve modes** | Point curve (RGB or per channel) | **Luma vs RGB curve**: luma shapes contrast without the saturation shift | Tone curve | Rgb curve, preserving colour by norm | **Standard, Weighted standard, Film-like, Saturation & value blending, Luminance, Perceptual** | Tone Curve (extension) |

## What makes each one good in use

- **Lightroom.** Speed and directness. The histogram is a control surface with five labelled zones. Alt-drag is the clipping check people use all the time: the image turns black and only the clipped channels light up. Shift+double-click sets one slider automatically and leaves the rest alone, so Auto stops being all or nothing. The weak point (*forum*, Kasson's test): highlight recovery is weaker than Capture One's.
- **Capture One.** Reviewers name its recovery quality: HDR Highlight/Shadow without halos even at the ends. Photographers like the split of jobs: Exposure for brightness, Brightness for midtones with fixed end points, Levels for the end points (with Auto Levels at 0.1 %), and the luma curve for contrast without a colour shift. The warning threshold is adjustable. Its complaint is a warning that flags single channels the image doesn't show (*forum*).
- **DxO PhotoLab.** The auto modes are photographic. Spot weighted puts the exposure where you draw a rectangle, or on faces. Intensity steps (Slight 25 / Medium 50 / Strong 75) make Auto a dial instead of a switch. Highlight priority meters for the highlights. The complaint (*forum*): Selective Tone bands overlap, so Highlights also moves the midtones.
- **darktable.** Exact and repeatable. Exposure lives in linear scene light, and "compensate camera exposure" undoes the in-camera dial. The black level is linear. Spot mapping keeps a target lightness across photos and sessions, which is what a series needs. Automatic mode is a percentile and a target, which makes it predictable. The tone equalizer (exposure per EV band) is a separate module; Safelight already has it.
- **RawTherapee / ART.** Transparent parameters. Highlight compression has an explicit threshold and works with reconstruction. Auto Levels takes a Clip %. The curve modes let you choose how a tone change treats colour: film-like keeps the hue of RGB curves; luminance and perceptual keep saturation.
- **Others.** ON1 and Luminar centre on AI "brilliance" auto amounts (a strength slider over an automatic edit), which adds nothing distinct beyond DxO's intensity dial. Affinity's Develop has Exposure, Black point and Brightness, which is the same split as Capture One's.

## What this means for Safelight

1. **Placement.** The best exposure tools work before the tone mapping. In Safelight that is Basic's tone block, ahead of the core shoulder. A third-party stage runs after the shoulder (1.0.0's problem, which its highlight-protection hack worked around). Core lets only official extensions anchor ahead of it.
2. **The features people rate** are interaction and automation, not more sliders: histogram zones, Alt-drag threshold views, per-slider auto, auto modes with an intensity, a spot/rectangle meter, and a target that persists across a series.
3. **Recovery quality** is a rendering matter. On v2, Basic's Highlights and Shadows are already local (region-based). An advanced panel should drive them well rather than add a second recovery.
4. **Overlap to avoid.** Exposure by EV band is Tone Equalizer's. Point curves are Tone Curve's. Per-channel levels are Tone Levels'.

## Sources

- darktable manual, exposure module: https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/exposure/
- darktable forum on compensate camera exposure: https://discuss.pixls.us/t/disabling-3-2s-compensate-camera-expsosure-by-default/19911
- RawPedia, Exposure (via search; the page itself was unreachable): https://rawpedia.rawtherapee.com/Exposure
- RawPedia toolchain: https://rawpedia.pixls.us/toolchain_pipeline/
- ART reference: https://art.pixls.us/Reference
- Capture One support, Exposure and Contrast: https://support.captureone.com/hc/en-us/sections/360000693537-Exposure-and-Contrast
- Capture One support, Auto adjustments: https://support.captureone.com/hc/en-us/articles/360002609238
- Capture One exposure warning threshold: https://support.captureone.com/hc/en-us/articles/360002603617
- Capture One Brightness vs Exposure: https://blog.thomasfitzgeraldphotography.com/blog/2017/4/4-places-to-adjust-brightness-in-capture-one-pro
- Capture One HDR tool: https://imagealchemist.net/capture-one-high-dynamic-range/
- Capture One vs Lightroom recovery: https://fstoppers.com/reviews/software-wars-can-capture-one-pro-defeat-lightroom-classic-623443 ; https://blog.kasson.com/z9/lightroom-highlight-recovery
- Lightroom histogram zones: https://jkost.com/blog/?p=22721 ; https://www.phototraces.com/lightroom-tutorials/lightroom-histogram/
- Lightroom Alt clipping preview: https://lightroomkillertips.com/highlight-and-shadow-clipping/ ; Shift+double-click: https://theluxelens.com/blogs/luxe-blog/how-to-use-lightroom-seven-hidden-features-and-tips-for-white-and-black-points
- DxO Smart Lighting (manual excerpt): https://forum.dxo.com/t/has-dxo-provided-information-on-dxo-smart-lighting-and-how-to-find-it/38267
- DxO exposure compensation auto modes: https://feedback.dxo.com/t/working-highlight-priority-autoexposure-compensation/22193
- DxO Selective Tone overlap: https://feedback.dxo.com/t/understanding-selective-tone-control/9916/21 ; https://feedback.dxo.com/t/selective-tone-highlights-too-broad/25489/16
- ON1 Brilliance AI: https://scottdavenport.squarespace.com/blog/on1-photo-raw-brilliance-ai-vs-tone-color

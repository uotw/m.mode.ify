# M.mode.ify

**Generate an M-mode image, post hoc, from any saved 2D (B-mode) ultrasound clip — along any line you choose.**

M.mode.ify is a free, cross-platform desktop app. You load a clip, draw a line through the anatomy of interest, and it reconstructs an M-mode strip along that line, with on-image calibration and time/distance measurement. Everything runs **locally on your machine** — clips are never uploaded.

It implements the technique published in:

> Smith BC III, Avila J. **M.mode.ify: A Free Online Tool to Generate Post Hoc M-Mode Images From Any Ultrasound Clip.** *J Ultrasound Med.* 2016;35(2):435–439. doi:[10.7863/ultra.15.02024](https://doi.org/10.7863/ultra.15.02024) · PMID [26764277](https://pubmed.ncbi.nlm.nih.gov/26764277/)

More background and theory: <https://coreultrasound.com/m.mode.ify.theory/>

---

## Download

Latest signed builds (these links always point at the newest release):

| Platform | Download |
| --- | --- |
| **macOS — Apple Silicon (arm64)** | [M.mode.ify-arm64.dmg](https://github.com/uotw/m.mode.ify/releases/latest/download/M.mode.ify-arm64.dmg) |
| **macOS — Intel (x64)** | [M.mode.ify-x64.dmg](https://github.com/uotw/m.mode.ify/releases/latest/download/M.mode.ify-x64.dmg) |
| **Windows (x64)** | [M.mode.ify-Setup-x64.exe](https://github.com/uotw/m.mode.ify/releases/latest/download/M.mode.ify-Setup-x64.exe) |

All releases: <https://github.com/uotw/m.mode.ify/releases/latest>

macOS builds are Developer ID–signed and notarized; the Windows installer is code-signed. Supported clip formats include MP4, MOV, AVI, WMV, MPG/MPEG, and FLV.

---

## What is M-mode, and why generate it after the fact?

**M-mode (motion mode)** conveys movement over time in a single still image: one line through the tissue is sampled repeatedly, and those samples are laid side by side so the **horizontal axis is time** and the **vertical axis is depth** along that line. It remains valuable for measurements such as fetal heart rate, internal jugular distensibility (volume responsiveness), and **E-point septal separation (EPSS)** for estimating cardiac function.

The catch with native M-mode is that, on essentially every ultrasound system, it can **only be captured live, during the scan**, along a line the sonographer chooses in the moment. If you only saved a 2D cine clip, the opportunity is gone.

M.mode.ify removes that limitation: it builds the M-mode **after** the scan, from the saved clip, along **any** line and angle you like — including orientations a machine could never produce ("anatomic M-mode").

---

## How it works

Given a B-mode clip and a user-drawn line, the app:

1. **Decomposes the clip into frames** (via ffmpeg).
2. **Measures the line's angle** from your selected start/end points.
3. **Rotates each frame** by that angle so your line becomes vertical.
4. **Crops a narrow column** at the line position out of every rotated frame. The column width — the **M-mode line width** — is **user-selectable from 1 to 5 px** (default 3). Wider columns capture more horizontal detail but stretch the time axis; the default of 3 px gives a sensible time scale at the typical 30–60 fps of clinical clips.
5. **Appends the columns left → right**, producing the M-mode strip: x = time, y = depth along your line.
6. **Stacks a labeled reference frame** (your line drawn in white over the first frame) beneath the strip, then trims.

As you drag the line, a **live M-mode preview updates in real time** in the sidebar — and re-renders instantly when you change the line width — so you can fine-tune placement and width before committing to the full-resolution build.

A reference still with the white M-mode line is kept alongside the result so you can see exactly where the trace was taken.

### Calibration & measurement

Because pixels-per-centimeter and frame rate vary by clip, you calibrate once per clip by **clicking and dragging along a known distance on the image's depth scale**. The number of centimeters spanned is **selectable** (the published tool used a fixed 4 cm; this app lets you pick), and the drag is shown with end-caps and evenly spaced tick marks.

- **Distance calibration** (depth axis) uses the Pythagorean length of your calibration drag — unaffected by line width:
  `pixels_per_cm = √((X₂−X₁)² + (Y₂−Y₁)²) / (cm spanned)`
- **Time calibration** (horizontal axis) maps M-mode width to time from the clip's frames and duration. Each frame contributes a column equal to the chosen **line width** `w` (1–5 px), so:
  `pixels_per_second = (total frames × w) / (clip duration in seconds)`
  Because the time scale tracks `w`, changing the line width keeps your time measurements accurate.

You can then click-drag directly on the M-mode to read out **distance in millimeters** or **time in hundredths of a second**, and save the M-mode with the measurement annotations baked in.

---

## Clinical & research uses

From the original paper and its references, post-hoc M-mode along an arbitrary line enables, for example:

- **Cardiac tamponade** — place the line across a collapsing right ventricle and the mitral valve to confirm RV collapse occurs while the mitral valve is open (diastole), without needing an on-screen ECG.
- **EPSS / fractional shortening** — derive these even from a non-orthogonal parasternal long-axis or apical view, where a machine M-mode line couldn't be positioned correctly.
- **Quality assurance** — compare a measured EPSS/fractional shortening against a provider's visual EF estimate.
- **Research** — extract M-mode data retrospectively from archived clips, along any axis, rather than relying on M-mode lines that were (or weren't) captured at scan time.

## Limitations

As discussed in the paper, M.mode.ify **does not replace a native M-mode scan**:

- Temporal resolution is limited to the clip's frame rate, so the trace can look choppy and is less accurate for fast-moving subjects, especially with low–frame-rate clips.
- Calibration errors translate directly into distance error (measuring over a larger known distance reduces this).
- The signal is reconstructed from B-mode pixels, so it is noisier than true M-mode signal processing.

---

## How this app differs from the original web tool

This is the open-source **desktop** application. Unlike the original browser-based tool, it:

- runs entirely **offline / locally** — clips are processed on your computer and never uploaded, so there is no upload size limit and no need to strip identifiers before sending anything anywhere;
- ships native **macOS (Apple Silicon + Intel)** and **Windows** builds;
- adds a **live M-mode preview** that updates as you draw, plus a **user-selectable line width (1–5 px)** and a selectable calibration distance;
- bundles its own media tools, so there is nothing else to install.

---

## Building from source

```bash
npm install
npm start                 # run locally

npm run dist-macarm       # macOS arm64 .dmg
npm run dist-mac64        # macOS x64 .dmg
npm run dist-win64        # Windows x64 installer
```

Releases are produced by the `Release` GitHub Actions workflow on a `v*` tag: it signs + notarizes the macOS builds and code-signs the Windows installer, then attaches all three to a GitHub Release.

### Tech

- **[Electron](https://www.electronjs.org/)** + **[jQuery](https://jquery.com/)**
- **[ffmpeg](https://ffmpeg.org)** / **ffprobe** for frame extraction and clip info (via `ffmpeg-static` + `ffprobe-static`)
- **[ImageMagick](https://imagemagick.org/)** via **[@imagemagick/magick-wasm](https://github.com/dlemstra/magick-wasm)** for the rotate/crop/append pipeline (runs on a worker thread)

---

## License & credits

Copyright © 2026 **Ben C. Smith, MD, FACEP**.

M.mode.ify is free software, licensed under the **GNU General Public License, version 3 or later (GPL-3.0-or-later)** — see the [`LICENSE`](LICENSE) file. This matches the GPL-licensed FFmpeg binaries the app bundles and distributes.

Bundled third-party components:

- **FFmpeg / FFprobe** (via [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static) + [`ffprobe-static`](https://github.com/joshwnj/ffprobe-static)) — GPLv3-licensed builds; their corresponding source is available from the FFmpeg project (<https://ffmpeg.org>) and the build provider.
- **ImageMagick** via [@imagemagick/magick-wasm](https://github.com/dlemstra/magick-wasm) — ImageMagick License (Apache-2.0).
- **Electron**, **jQuery**, **@electron/remote** — MIT.

See **About → in the app menu** for full attributions, or the [original article](https://pubmed.ncbi.nlm.nih.gov/26764277/) for the technique.

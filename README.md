# VideoAPP

A smartphone-friendly **Progressive Web App (PWA)** for **frame-by-frame video analysis** with time measurement between start and end markers.

Everything runs locally in the browser — your videos never leave the device.

## Features

- **Frame-by-frame navigation** via buttons, keyboard shortcuts, or a horizontal swipe on the video
- **Start / End markers** with the duration shown in seconds and frames
- **Multiple measurements** (lap times): save, rename, jump back to, or delete
- **Automatic FPS detection** — read straight from MP4/MOV container metadata, with a playback-based fallback for other formats
- **CSV export** of all measurements
- **PNG screenshot** of the current frame
- **Video zoom** up to 8× via pinch (mobile) or Ctrl + wheel (desktop), with pan when zoomed
- **Playback speed** 0.25× – 2.0×
- **Offline-capable** (service worker) and **installable** to the home screen (PWA)
- Hover any control or display for a tooltip describing what it does

## Usage

1. Open the app in a browser or install it via *Add to Home Screen*.
2. Tap **Load video** and pick a file from your device.
3. The FPS field shows the detected frame rate (read-only).
4. Step frame by frame with `−1F` / `+1F`; play / pause with the centre button; jump 10 frames with `−10F` / `+10F`.
5. Tap **Start** at the desired position, then **End** — the duration appears immediately, in both seconds and frames.
6. Tap **＋ Save** to add the measurement to the list. After saving, the previous end automatically becomes the new start, so you can chain measurements.
7. Use **CSV** to download the measurement list, **Screenshot** to save the current frame as a PNG.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| ← / → | One frame back / forward |
| ↓ / ↑ | 10 frames back / forward |
| S | Set start marker |
| E | Set end marker |
| L | Save measurement |
| + / − | Zoom in / out |
| 0 | Reset zoom |
| Ctrl + wheel | Zoom under the cursor (desktop) |

### Touch Gestures

- **Horizontal swipe over the video** — scrub frame by frame.
- **Pinch (two fingers)** — zoom.
- **One-finger drag while zoomed** — pan the visible region.
- **Double-tap on the video** — play / pause.

## FPS Detection

The frame rate is determined in two stages:

1. **Container metadata** (primary, instant): The MP4/MOV atom tree (`moov → trak → mdia → mdhd.timescale / stts.sample_duration`) is read directly from the file. Codec-independent — works for **HEVC, H.264, AV1 and VP9** inside MP4/MOV.
2. **Playback-based** (fallback): If the container can't be parsed (e.g. WebM), the app briefly plays the video muted at 2× speed and samples frame intervals via `requestVideoFrameCallback`.

The detected value is snapped to the nearest common rate (23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 90, 100, 119.88, 120, 240). If both methods fail, the app defaults to 30 fps.

### HEVC note

HEVC is a codec, not a container. iPhone HEVC videos are stored inside `.mov` files; the FPS metadata lives in the container, so detection works the same as for H.264. Actually **playing** HEVC requires browser codec support — iOS / macOS Safari and modern Chrome on Android handle it; on desktop Chrome 105+ with a hardware decoder is needed; Firefox support is limited. Where playback works, detection works.

## Hosting

The app is fully static — drop the repository contents onto any web server (GitHub Pages, Netlify, Vercel, your own nginx).

To preview locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

**Install on iPhone:** open the page in **Safari** → tap the share button → *Add to Home Screen*.
**Install on Android:** open the page in Chrome → menu → *Install app* or *Add to Home Screen*.

## Tech

- Vanilla HTML / CSS / JavaScript — no framework, no build step
- HTML5 `<video>` with `requestVideoFrameCallback` for per-frame updates
- Custom ISO-BMFF (MP4 / MOV) atom parser for FPS extraction
- Service worker for offline caching
- Mobile-first CSS with ≥ 48 px touch targets and safe-area insets for notches

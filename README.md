# 🖐️ AR Hand Letter

A web-based augmented reality app that uses your device camera and hand tracking to place a floating 3D page or text in your hand. The page follows your open palm, and zoom is controlled by how spread your fingertips are. Supports **PDF documents** and **text/paragraphs** from a simple JSON config. Works on **Android**, **iOS**, **iPadOS**, and **desktop** browsers.

---

## Features

- **Open-palm tracking** — Hand centroid from all 21 MediaPipe landmarks (palm + fingers) drives the **center** of the 3D page (not a corner).
- **Fingertip zoom** — Polygon formed by **fingertips only** (no palm): area controls zoom level. Fingers spread → zoom 5; fingers pinched together → zoom 1. Adaptive min/max over recent frames.
- **PDF rendering** — Page content can be real PDFs: first page is rendered via PDF.js and used as the 3D texture. Fallback to text from `content.json` if no `pdfUrl` or load fails.
- **Text & paragraphs** — Letters category and text blocks support full sentences/paragraphs: center-aligned, word-wrapped, with configurable font and padding.
- **Content from JSON** — `src/data/content.json` defines categories (e.g. Pages, Letters, Numbers). First page in the list is the default. Add entries with `pdfUrl` for PDFs or text for descriptions.
- **Three material styles** — Gold (metallic), Chrome (mirror), Neon (glow).
- **Front/rear camera toggle** — Works on phones and desktops.
- **Modular codebase** — ES modules: `app`, `config`, `state`, `dom`, `scene`, `handTracking`, `camera`, `animation`, `ui`, `resize`.
- **Zero build step** — Pure HTML/CSS/JS; Three.js, MediaPipe, and PDF.js from CDN.
- **Docker** — One-command run with Docker Compose (HTTPS on 3090, HTTP on 3080).

---

## Project structure

```
ll/
├── src/
│   ├── index.html          # Entry; loads scripts and PDF.js
│   ├── css/
│   │   └── style.css       # Dark glassmorphism, content list, HUD
│   ├── js/
│   │   ├── app.js          # Init, content load, wiring
│   │   ├── config.js       # CONFIG (smoothing, zoom, text, etc.)
│   │   ├── state.js        # Shared state (hand, zoom, content)
│   │   ├── dom.js          # DOM refs and camera overlay
│   │   ├── scene.js        # Three.js scene, materials, letter/page mesh, PDF texture
│   │   ├── handTracking.js # MediaPipe hands, centroid, fingertip polygon area → zoom
│   │   ├── camera.js       # getUserMedia, start/stop/switch camera
│   │   ├── animation.js    # Render loop: position from centroid, scale from zoom
│   │   ├── ui.js           # Content list, style toggle, picker, loading/HUD
│   │   └── resize.js       # Window resize for Three.js
│   └── data/
│       ├── content.json    # Categories and items (pages with pdfUrl, letters, numbers)
│       ├── hello.pdf       # Optional dummy PDF
│       └── files/          # PDFs referenced by pdfUrl (e.g. happy-birthday-rifah.pdf)
├── nginx/
│   └── nginx.conf          # Nginx config (e.g. SSL, security headers)
├── Dockerfile              # Nginx Alpine image serving src
├── docker-compose.yml      # Service ar-ll, ports 3090 (HTTPS), 3080 (HTTP)
├── .dockerignore
├── .gitignore
└── README.md
```

---

## Quick start

### Local (no Docker)

Serve the **`src/`** directory so that `./data/content.json` and `./data/files/*.pdf` resolve correctly:

```bash
# From project root
python3 -m http.server 3000 --directory src
# Or
npx -y serve src -l 3000
```

Then open **http://localhost:3000** (use **https** if required for camera on your setup).

### Docker

```bash
docker compose up -d
```

- **HTTPS**: https://localhost:3090 (or https://\<your-ip\>:3090 on LAN)
- **HTTP**: http://localhost:3080

Use HTTPS when the server is configured for it; otherwise you may see “plain HTTP request sent to HTTPS port” (400).

```bash
docker compose down
```

### GitHub Pages (CI)

A workflow in `.github/workflows/deploy-pages.yml` runs on **push to `main`** and deploys the app to **GitHub Pages**.

1. **Enable GitHub Pages**: repo **Settings → Pages → Build and deployment → Source**: **GitHub Actions**.
2. Push to `main`; the workflow copies the contents of `src/` into the artifact (site root has `index.html`, `js/`, `css/`, `data/`), then uploads and deploys.

**Static paths** are correct because the deployed root is the contents of `src/`:
- `./data/content.json` → `/data/content.json`
- `data/files/*.pdf` → `/data/files/...`
- `js/app.js`, `css/style.css` → `/js/`, `/css/`

---

## Content configuration

`src/data/content.json` defines what appears in the bottom content list and what is rendered in 3D.

- **Pages** — Items with `type: "page"` and optional `pdfUrl`. If `pdfUrl` is set, that PDF’s first page is rendered as the 3D page texture; otherwise (or on error) the `label`/`text` fields are used as a text fallback.
- **Letters / Numbers** — String of characters; each character or full text block can be shown (letters support sentences/paragraphs).

Example:

```json
{
  "categories": [
    {
      "id": "pages",
      "name": "Pages",
      "items": [
        {
          "type": "page",
          "id": "happy-birthday",
          "label": "Happy Birthday",
          "text": "Happy Birthday to you!",
          "pdfUrl": "data/files/happy-birthday-rifah.pdf"
        }
      ]
    },
    { "id": "letters", "name": "Letters", "items": "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
    { "id": "numbers", "name": "Numbers", "items": "0123456789" }
  ]
}
```

The first item of the first category is used as the default content on load.

---

## How it works

### Hand centroid (page center)

- All **21** MediaPipe hand landmarks (wrist + fingers) are averaged in normalized (x, y, z).
- That **centroid** is mapped to 3D world space with the camera FOV and used as the **center** of the page (not a corner).
- Smoothed with `handCentroidSmoothing` and `positionSmoothing` to reduce jitter.

### Fingertip polygon → zoom

- Only **fingertips** (landmarks 4, 8, 12, 16, 20) are used; palm is excluded.
- Points are ordered by angle around their centroid so the polygon is non–self-intersecting.
- **Area** is computed with the shoelace formula in normalized (x, y).
- A rolling window of recent areas is used to get min/max; current area is mapped to zoom level **1–5** (configurable `zoomMin`/`zoomMax`). Fingers spread → large area → zoom 5; fingers pinched → small area → zoom 1.
- Zoom is smoothed and applied as the 3D page scale.

### 3D page

- **Position**: Hand centroid (smoothed).
- **Orientation**: Always upright (billboard: looks at camera).
- **Scale**: From fingertip polygon area (zoom 1–5).
- **Texture**: From PDF (PDF.js) when `pdfUrl` is set; otherwise from text/label in `content.json`.

---

## Configuration

Tunables live in **`src/js/config.js`**:

| Key | Purpose |
|-----|--------|
| `positionSmoothing` | Lerp factor for 3D position (lower = smoother). |
| `handCentroidSmoothing` | Lerp for normalized hand centroid before mapping to 3D. |
| `letterScale` | Base size of 3D content. |
| `textBlockMaxWidth`, `textBlockFontSize`, `textBlockLineHeight`, `textBlockPadding` | Text/paragraph layout for letter blocks. |
| `handConfidence` | MediaPipe min detection confidence (0–1). |
| `depthScale`, `fov` | Depth mapping and camera FOV. |
| `zoomMin`, `zoomMax` | Zoom range (e.g. 1 = pinched, 5 = spread). |
| `zoomSmoothing` | Lerp for zoom scale per frame. |
| `areaHistoryFrames` | Number of area samples for adaptive zoom min/max (~1.5 s at 60 fps). |

---

## Mobile / network testing

1. Start the server (local or Docker).
2. On the same WiFi, open the app using your machine’s IP:
   - **HTTPS**: `https://<your-ip>:3090` (Docker)
   - **HTTP**: `http://<your-ip>:3000` (local) or `http://<your-ip>:3080` (Docker)
3. Grant camera permission when prompted.

**iOS / Safari**: Camera usually requires a secure context (HTTPS or localhost). For local dev over HTTP, use a tunnel or serve with SSL (e.g. `npx -y serve src -l 3000 --ssl` or mkcert).

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Camera | WebRTC `getUserMedia` |
| Hand detection | MediaPipe Hands (21 landmarks) |
| 3D | Three.js r128 (WebGL) |
| PDF | PDF.js (first page → canvas texture) |
| Serving | Nginx (Docker) or any static server locally |

---

## Browser support

| Browser | Notes |
|--------|--------|
| Chrome (Android / Desktop) | Full support |
| Safari (iOS / iPadOS 15+) | Full support; HTTPS typically required for camera |
| Firefox, Edge (Desktop) | Full support |

---

## License

MIT

---

## Acknowledgments

- [MediaPipe](https://google.github.io/mediapipe/) — Hand tracking
- [Three.js](https://threejs.org/) — 3D rendering
- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF rendering
- [Inter](https://rsms.me/inter/) — UI typeface

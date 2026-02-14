# 🖐️ AR Hand Letter

A web-based augmented reality application that detects your hand via camera and renders a realistic floating 3D letter as if held by your hand. Works on **Android**, **iOS**, **iPadOS**, and **desktop** browsers.

---

## ✨ Features

- **Real-time hand tracking** — 21-landmark detection via [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands.html)
- **Accurate 3D positioning** — Letter rotation and position computed from a proper 3D coordinate frame using cross-product palm plane math
- **Three material styles** — Gold (metallic PBR), Chrome (mirror), Neon (glowing)
- **Full character set** — A–Z, 0–9, and special symbols
- **Smooth physics** — Quaternion slerp rotation, vector lerp positioning, gentle floating bob
- **Front/rear camera toggle** — Works on all devices
- **Mobile-first design** — Responsive glassmorphism UI with safe-area support
- **Zero build step** — Pure HTML/CSS/JS, all libraries from CDN
- **Dockerized** — One-command deployment via Docker Compose

---

## 📁 Project Structure

```
ar-hand-letter/
├── src/                        # Application source
│   ├── index.html              # Entry point
│   ├── css/
│   │   └── style.css           # Dark glassmorphism theme
│   └── js/
│       └── app.js              # Camera, hand tracking, 3D rendering
├── docker/
│   └── nginx.conf              # Nginx config with security headers
├── Dockerfile                  # Multi-stage build (nginx-alpine)
├── docker-compose.yml          # Container orchestration
├── .dockerignore
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### Local Development (no Docker)

Serve the `src/` directory with any static file server:

```bash
# Using npx (no install needed)
npx -y serve src -l 3000

# Or Python
python3 -m http.server 3000 --directory src

# Or PHP
php -S localhost:3000 -t src
```

Then open **http://localhost:3000** in your browser.

### Docker

```bash
# Build and run
docker compose up -d

# App is available at http://localhost:8080
```

Or build the image directly:

```bash
docker build -t ar-hand-letter .
docker run -d -p 8080:80 --name ar-hand-letter ar-hand-letter
```

### Stop / Remove

```bash
docker compose down
```

---

## 📱 Mobile Testing

1. Start the server (local or Docker)
2. Find your machine's local IP:
   ```bash
   hostname -I       # Linux
   ipconfig getifaddr en0  # macOS
   ```
3. Open `http://<your-ip>:8080` on your mobile device (same WiFi)

> **iOS Note**: Safari requires HTTPS for camera access. For local development, use a tool like [mkcert](https://github.com/FiloSottile/mkcert) or serve with SSL:
> ```bash
> npx -y serve src -l 3000 --ssl
> ```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Camera | WebRTC `getUserMedia` | Cross-platform camera capture |
| Hand Detection | MediaPipe Hands v0.4 | Real-time 21-landmark hand detection (WASM/GPU) |
| 3D Rendering | Three.js r128 | WebGL-based realistic letter rendering |
| Serving | Nginx 1.25 (Alpine) | Production-grade static file serving |
| Container | Docker + Docker Compose | Reproducible deployment |

---

## 🧠 How It Works

### Hand Tracking → 3D Orientation

The app builds a **proper 3D coordinate frame** from the MediaPipe palm landmarks:

```
v_up     = normalize(wrist → middle_mcp)      // hand's "up" vector
v_right  = normalize(index_mcp → pinky_mcp)   // across the palm
v_normal = cross(v_up, v_right)                // palm normal (depth axis)
```

These three orthogonal vectors form a **rotation matrix** converted to a **quaternion** that drives the letter's exact 3D orientation — including depth tilt, roll, and yaw. Position is mapped from normalized landmark coordinates to Three.js world space using the camera's FOV for accurate projection.

**Smoothing** uses quaternion `slerp` for rotation and `lerp` for position, giving the letter a fluid, physically grounded feel without jitter.

---

## ⚙️ Configuration

Key parameters in `src/js/app.js`:

```javascript
const CONFIG = {
    positionSmoothing: 0.22,   // Lower = smoother, higher = more responsive
    rotationSmoothing: 0.18,   // Quaternion slerp factor
    bobAmplitude: 0.012,       // Floating bob height
    bobSpeed: 1.6,             // Bob oscillation speed
    letterScale: 0.35,         // 3D letter size
    floatHeight: 0.08,         // Height above palm center
    handConfidence: 0.7,       // Min detection confidence (0–1)
};
```

---

## 🌐 Browser Compatibility

| Browser | Status |
|---|---|
| Chrome (Android) | ✅ Full support |
| Safari (iOS 15+) | ✅ Requires HTTPS |
| Safari (iPadOS 15+) | ✅ Requires HTTPS |
| Chrome (Desktop) | ✅ Full support |
| Firefox (Desktop) | ✅ Full support |
| Edge (Desktop) | ✅ Full support |

---

## 📄 License

MIT

---

## 🙏 Acknowledgments

- [MediaPipe](https://google.github.io/mediapipe/) by Google — hand tracking AI
- [Three.js](https://threejs.org/) — 3D rendering engine
- [Inter](https://rsms.me/inter/) — UI typeface

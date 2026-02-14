/* ============================================
   AR Hand Letter — Hand Tracking (MediaPipe)
   ============================================
   - Hand centroid (palm + fingers) = center of page.
   - Fingertip polygon area (fingers only, no palm) = zoom:
     area large (fingers spread) → zoom 5, area small (pinched) → zoom 1.
   ============================================ */

import { CONFIG } from './config.js';
import { state } from './state.js';
import { dom, getCameraContext } from './dom.js';

const Hands = typeof window !== 'undefined' ? window.Hands : null;

let hands;

/** MediaPipe hand: 21 landmarks. Fingertips = thumb(4), index(8), middle(12), ring(16), pinky(20). */
const NUM_LANDMARKS = 21;
const FINGERTIP_INDICES = [4, 8, 12, 16, 20];

/** Rolling area history for adaptive zoom min/max. */
let areaHistory = [];
const MAX_HISTORY = CONFIG.areaHistoryFrames ?? 90;

function point(x, y) {
    return { x, y };
}

/** Signed polygon area (2D) via shoelace. Points in order. */
function polygonArea(points) {
    if (points.length < 3) return 0;
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) * 0.5;
}

/** Order points by angle from centroid so polygon is non-self-intersecting. */
function orderByAngle(points) {
    if (points.length <= 2) return points;
    let cx = 0, cy = 0;
    points.forEach((p) => { cx += p.x; cy += p.y; });
    cx /= points.length;
    cy /= points.length;
    return [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

/**
 * Compute zoom level 1–5 from fingertip polygon area.
 * Uses running min/max of area over recent frames so it adapts to the user.
 */
function areaToZoomLevel(area) {
    if (area <= 0) return CONFIG.zoomMin ?? 1;
    areaHistory.push(area);
    if (areaHistory.length > MAX_HISTORY) areaHistory.shift();
    const minA = Math.min(...areaHistory);
    const maxA = Math.max(...areaHistory);
    const range = maxA - minA;
    if (range <= 1e-9) return CONFIG.zoomMin ?? 1;
    const t = (area - minA) / range;
    const zoomMin = CONFIG.zoomMin ?? 1;
    const zoomMax = CONFIG.zoomMax ?? 5;
    return zoomMin + (zoomMax - zoomMin) * Math.max(0, Math.min(1, t));
}

function processHandLandmarks(landmarks) {
    const mirrored = state.facingMode === 'user';

    const tip = (i) => {
        const lm = landmarks[i];
        return point(mirrored ? 1 - lm.x : lm.x, lm.y);
    };

    let sumX = 0, sumY = 0, sumZ = 0;
    const n = Math.min(landmarks.length, NUM_LANDMARKS);
    for (let i = 0; i < n; i++) {
        const lm = landmarks[i];
        sumX += mirrored ? 1 - lm.x : lm.x;
        sumY += lm.y;
        sumZ += lm.z ?? 0;
    }
    if (n === 0) {
        state.handCentroid = null;
        state.zoomLevel = CONFIG.zoomMin ?? 1;
        return;
    }

    state.handCentroid = {
        x: sumX / n,
        y: sumY / n,
        z: sumZ / n,
    };

    const tips = [];
    for (const i of FINGERTIP_INDICES) {
        if (i < landmarks.length) tips.push(tip(i));
    }
    if (tips.length < 2) {
        state.fingertipPolygonArea = 0;
        state.zoomLevel = CONFIG.zoomMin ?? 1;
        dom.statusText.textContent = 'Hand detected';
        dom.statusText.style.color = '#22c55e';
        return;
    }

    const ordered = orderByAngle(tips);
    const area = polygonArea(ordered);
    state.fingertipPolygonArea = area;
    state.zoomLevel = areaToZoomLevel(area);

    dom.statusText.textContent = 'Hand detected';
    dom.statusText.style.color = '#22c55e';
}

function onHandResults(results) {
    const cameraCtx = getCameraContext();
    cameraCtx.save();
    cameraCtx.clearRect(0, 0, dom.cameraCanvas.width, dom.cameraCanvas.height);

    if (state.facingMode === 'user') {
        cameraCtx.translate(dom.cameraCanvas.width, 0);
        cameraCtx.scale(-1, 1);
    }
    cameraCtx.drawImage(results.image, 0, 0, dom.cameraCanvas.width, dom.cameraCanvas.height);
    cameraCtx.restore();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        processHandLandmarks(landmarks);
        if (!state.handDetected) {
            state.handDetected = true;
            dom.trackingStatus.classList.add('tracking');
        }
    } else {
        if (state.handDetected) {
            state.handDetected = false;
            dom.trackingStatus.classList.remove('tracking');
            dom.statusText.textContent = 'Show your hand';
            dom.statusText.style.color = '';
        }
        state.handCentroid = null;
        state.fingertipPolygonArea = 0;
        state.zoomLevel = CONFIG.zoomMin ?? 1;
        areaHistory = [];
    }
}

export function initHandDetection(updateLoadingStatus) {
    if (!Hands) {
        console.error('MediaPipe Hands not loaded');
        return;
    }
    updateLoadingStatus('Loading hand detection model...');

    hands = new Hands({
        locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: CONFIG.handConfidence,
        minTrackingConfidence: 0.5,
    });
    hands.onResults(onHandResults);
}

let detecting = false;

export function startDetectionLoop() {
    if (detecting) return;
    detecting = true;

    async function detect() {
        if (!detecting || !state.cameraReady) return;
        try {
            await hands.send({ image: dom.video });
        } catch (e) { /* skip frame */ }
        requestAnimationFrame(detect);
    }
    detect();
}

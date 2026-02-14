/* ============================================
   AR Hand Letter — Camera (getUserMedia)
   Safari- and Chrome-compatible switch logic.
   ============================================ */

import { state } from './state.js';
import { dom } from './dom.js';

const VIDEO_READY_TIMEOUT_MS = 8000;
const RELEASE_DELAY_MS = 600;

export async function startCamera() {
    const constraints = {
        video: {
            facingMode: state.facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
        },
        audio: false,
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        dom.video.srcObject = stream;

        const ready = new Promise((resolve, reject) => {
            const onReady = () => {
                cleanup();
                const vw = dom.video.videoWidth;
                const vh = dom.video.videoHeight;
                if (vw > 0 && vh > 0) {
                    dom.cameraCanvas.width = vw;
                    dom.cameraCanvas.height = vh;
                    dom.landmarkCanvas.width = vw;
                    dom.landmarkCanvas.height = vh;
                    state.cameraReady = true;
                    resolve();
                }
            };

            const cleanup = () => {
                dom.video.removeEventListener('loadedmetadata', onReady);
                dom.video.removeEventListener('loadeddata', onReady);
                dom.video.removeEventListener('canplay', onReady);
            };

            dom.video.addEventListener('loadedmetadata', onReady, { once: true });
            dom.video.addEventListener('loadeddata', onReady, { once: true });
            dom.video.addEventListener('canplay', onReady, { once: true });

            if (dom.video.readyState >= 2) onReady();
        });

        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Camera video timeout')), VIDEO_READY_TIMEOUT_MS)
        );

        await Promise.race([ready, timeout]);

        const playPromise = dom.video.play();
        if (playPromise != null && typeof playPromise.catch === 'function') {
            await playPromise.catch(() => {});
        }
    } catch (err) {
        if (state.facingMode === 'environment') {
            state.facingMode = 'user';
            return startCamera();
        }
        throw err;
    }
}

export function stopCamera() {
    const video = dom.video;
    if (!video) return;

    video.pause();
    const stream = video.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach((t) => t.stop());
    }
    video.srcObject = null;
}

function releaseCamera() {
    stopCamera();
    if (dom.video) {
        dom.video.load();
    }
    state.cameraReady = false;
}

let switching = false;

export async function switchCamera(startDetectionLoop, updateLoadingStatus, hideLoading) {
    if (switching || !state.cameraReady) return;
    switching = true;
    if (dom.toggleCameraBtn) dom.toggleCameraBtn.disabled = true;

    updateLoadingStatus('Switching camera...');
    dom.loadingScreen.classList.remove('hidden', 'fade-out');

    try {
        releaseCamera();
        await new Promise((r) => setTimeout(r, RELEASE_DELAY_MS));

        state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';

        await startCamera();
        startDetectionLoop();
    } catch (err) {
        console.error('Camera switch failed:', err);
        state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
        try {
            await startCamera();
            startDetectionLoop();
        } catch (e) {
            console.error('Camera fallback failed:', e);
        }
    } finally {
        switching = false;
        if (dom.toggleCameraBtn) dom.toggleCameraBtn.disabled = false;
        hideLoading();
    }
}

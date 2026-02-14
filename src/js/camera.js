/* ============================================
   AR Hand Letter — Camera (getUserMedia)
   Chrome Android/iOS: deviceId for reliable front/back.
   Safari: no video.load() on release, longer delay for back.
   ============================================ */

import { state } from './state.js';
import { dom } from './dom.js';

const VIDEO_READY_TIMEOUT_MS = 10000;

/** Safari: skip video.load() on release (can break next stream); use longer delay for back camera */
function isSafari() {
    const ua = navigator.userAgent || '';
    return /Safari/i.test(ua) && !/Chrom|CriOS|FxiOS/i.test(ua);
}

/** Chrome (Android/iOS) or Chromium-based */
function isChrome() {
    const ua = navigator.userAgent || '';
    return /Chrome|CriOS|Chromium/i.test(ua);
}

/** Delay after releasing stream before requesting new one (ms) */
function getReleaseDelayMs() {
    return isSafari() ? 1200 : 500;
}

let videoInputDevices = [];

async function getVideoDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        videoInputDevices = devices.filter((d) => d.kind === 'videoinput');
        return videoInputDevices;
    } catch (e) {
        videoInputDevices = [];
        return [];
    }
}

/** Pick deviceId for desired facingMode (user = front, environment = back). Prefer deviceId on Chrome. */
function getVideoConstraints() {
    const wantFront = state.facingMode === 'user';
    const devices = videoInputDevices;

    if (isChrome() && Array.isArray(devices) && devices.length > 0) {
        const byLabel = wantFront
            ? devices.find((d) => /front|user|selfie|facing front/i.test(d.label || ''))
            : devices.find((d) => /back|environment|rear|facing back/i.test(d.label || ''));
        if (byLabel?.deviceId) {
            return { video: { deviceId: { exact: byLabel.deviceId } }, audio: false };
        }
        const byCapabilities = devices.find((d) => {
            try {
                const cap = d.getCapabilities?.();
                const facing = cap?.facing?.length ? cap.facing[0] : cap?.facing;
                return wantFront ? facing === 'user' : facing === 'environment';
            } catch (_) {
                return false;
            }
        });
        if (byCapabilities?.deviceId) {
            return { video: { deviceId: { exact: byCapabilities.deviceId } }, audio: false };
        }
    }

    return {
        video: { facingMode: state.facingMode },
        audio: false,
    };
}

export async function startCamera() {
    if (videoInputDevices.length === 0) {
        await getVideoDevices();
    }

    const constraints = getVideoConstraints();

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        dom.video.srcObject = stream;
        getVideoDevices().then(() => {}).catch(() => {});

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
                dom.video.removeEventListener('playing', onReady);
            };

            dom.video.addEventListener('loadedmetadata', onReady, { once: true });
            dom.video.addEventListener('loadeddata', onReady, { once: true });
            dom.video.addEventListener('canplay', onReady, { once: true });
            dom.video.addEventListener('playing', onReady, { once: true });

            if (dom.video.readyState >= 2 && dom.video.videoWidth > 0) {
                onReady();
            }
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
    if (dom.video && !isSafari()) {
        dom.video.load();
    }
    state.cameraReady = false;
}

const SWITCH_TIMEOUT_MS = 15000;

let switching = false;

export async function switchCamera(startDetectionLoop, stopDetectionLoop, resetTrackingState, updateLoadingStatus, hideLoading) {
    if (switching || !state.cameraReady) return;
    switching = true;
    if (dom.toggleCameraBtn) dom.toggleCameraBtn.disabled = true;

    updateLoadingStatus('Switching camera...');
    dom.loadingScreen.classList.remove('hidden', 'fade-out');

    const doSwitch = async () => {
        stopDetectionLoop();
        if (resetTrackingState) resetTrackingState();
        releaseCamera();
        await new Promise((r) => setTimeout(r, getReleaseDelayMs()));

        state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
        await startCamera();
        startDetectionLoop();
    };

    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Switch timeout')), SWITCH_TIMEOUT_MS)
        );
        await Promise.race([doSwitch(), timeout]);
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

/* ============================================
   AR Hand Letter — Camera (getUserMedia)
   ============================================ */

import { state } from './state.js';
import { dom } from './dom.js';

export async function startCamera() {
    try {
        const constraints = {
            video: {
                facingMode: state.facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        dom.video.srcObject = stream;

        return new Promise((resolve) => {
            dom.video.onloadedmetadata = () => {
                dom.video.play();
                const vw = dom.video.videoWidth;
                const vh = dom.video.videoHeight;
                dom.cameraCanvas.width = vw;
                dom.cameraCanvas.height = vh;
                dom.landmarkCanvas.width = vw;
                dom.landmarkCanvas.height = vh;
                state.cameraReady = true;
                resolve();
            };
        });
    } catch (err) {
        if (state.facingMode === 'environment') {
            state.facingMode = 'user';
            return startCamera();
        }
        throw err;
    }
}

export function stopCamera() {
    if (dom.video.srcObject) {
        dom.video.srcObject.getTracks().forEach((t) => t.stop());
        dom.video.srcObject = null;
    }
}

export async function switchCamera(startDetectionLoop, updateLoadingStatus, hideLoading) {
    if (!state.cameraReady) return;

    updateLoadingStatus('Switching camera...');
    dom.loadingScreen.classList.remove('hidden', 'fade-out');
    stopCamera();
    await new Promise((r) => setTimeout(r, 300));

    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    try {
        await startCamera();
    } catch (err) {
        console.error('Camera switch failed:', err);
        state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
        await startCamera();
    }
    startDetectionLoop();
    hideLoading();
}

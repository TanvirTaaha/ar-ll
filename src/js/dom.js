/* ============================================
   AR Hand Letter — DOM Element References
   ============================================ */

export const dom = {
    video: document.getElementById('camera-feed'),
    cameraCanvas: document.getElementById('camera-canvas'),
    threeCanvas: document.getElementById('three-canvas'),
    landmarkCanvas: document.getElementById('landmark-canvas'),
    loadingScreen: document.getElementById('loading-screen'),
    permissionScreen: document.getElementById('permission-screen'),
    loadingStatus: document.getElementById('loading-status'),
    hud: document.getElementById('hud'),
    trackingStatus: document.getElementById('tracking-status'),
    statusText: document.querySelector('.status-text'),
    letterGrid: document.getElementById('letter-grid'),
    grantBtn: document.getElementById('grant-permission-btn'),
    toggleCameraBtn: document.getElementById('toggle-camera-btn'),
    pickerHandle: document.getElementById('picker-handle'),
    letterPicker: document.querySelector('.letter-picker'),
    hudBottom: document.querySelector('.hud-bottom'),
    styleToggle: document.getElementById('style-toggle'),
    categoryTabs: document.createElement('div'),
    cameraLoadingOverlay: document.createElement('div'),
};

// Camera switch overlay
dom.cameraLoadingOverlay.id = 'camera-switch-overlay';
dom.cameraLoadingOverlay.className = 'hidden';
dom.cameraLoadingOverlay.innerHTML = `
    <div class="loader-content">
        <div class="loader-ring">
            <div class="ring-segment"></div>
            <div class="ring-segment"></div>
            <div class="ring-segment"></div>
        </div>
        <p>Switching Camera...</p>
    </div>
`;
document.body.appendChild(dom.cameraLoadingOverlay);

/** @returns {CanvasRenderingContext2D} */
export function getCameraContext() {
    return dom.cameraCanvas.getContext('2d');
}

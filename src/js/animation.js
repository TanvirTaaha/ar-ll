/* ============================================
   AR Hand Letter — 3D Animation Loop
   ============================================
   Content follows hand centroid (palm + fingers).
   Centroid = CENTER of page/paragraph (not corner).
   Translation only, always upright (billboard).
   ============================================ */

import { CONFIG } from './config.js';
import { state } from './state.js';
import {
    getLetterGroup,
    getRenderer,
    getCamera,
    getShadowPlane,
    getScene,
} from './scene.js';

const T = typeof THREE !== 'undefined' ? THREE : window.THREE;

export function startAnimation() {
    const letterGroup = getLetterGroup();
    const renderer = getRenderer();
    const threeCamera = getCamera();
    const shadowPlane = getShadowPlane();
    const scene = getScene();

    function animate() {
        requestAnimationFrame(animate);

        if (letterGroup) {
            const hasHand = state.handDetected && state.handCentroid;

            if (hasHand) {
                letterGroup.visible = true;

                const raw = state.handCentroid;
                const smooth = state.smoothHandCentroid;
                const t = CONFIG.handCentroidSmoothing ?? 0.28;
                smooth.x += (raw.x - smooth.x) * t;
                smooth.y += (raw.y - smooth.y) * t;
                smooth.z += (raw.z - smooth.z) * t;

                const aspect = window.innerWidth / window.innerHeight;
                const fovRad = T.MathUtils.degToRad(CONFIG.fov);
                const halfH = Math.tan(fovRad / 2) * threeCamera.position.z;
                const halfW = halfH * aspect;

                const targetX = (smooth.x - 0.5) * 2 * halfW;
                const targetY = -(smooth.y - 0.5) * 2 * halfH;
                const targetZ = -smooth.z * CONFIG.depthScale;

                const targetPos = new T.Vector3(targetX, targetY, targetZ);
                state.smoothPosition.lerp(targetPos, CONFIG.positionSmoothing);
                letterGroup.position.copy(state.smoothPosition);

                letterGroup.lookAt(threeCamera.position);

                const zoomSmooth = CONFIG.zoomSmoothing ?? 0.12;
                state.smoothZoom += (state.zoomLevel - state.smoothZoom) * zoomSmooth;
                letterGroup.scale.setScalar(state.smoothZoom);

                shadowPlane.position.x = state.smoothPosition.x;
                shadowPlane.position.z = state.smoothPosition.z;
            } else {
                letterGroup.visible = false;
                const zoomSmooth = CONFIG.zoomSmoothing ?? 0.12;
                state.smoothZoom += ((CONFIG.zoomMin ?? 1) - state.smoothZoom) * zoomSmooth;
            }
        }

        renderer.render(scene, threeCamera);
    }

    animate();
}

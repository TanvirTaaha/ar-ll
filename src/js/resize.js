/* ============================================
   AR Hand Letter — Window Resize
   ============================================ */

import { getCamera, getRenderer } from './scene.js';

export function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const threeCamera = getCamera();
    const renderer = getRenderer();
    threeCamera.aspect = w / h;
    threeCamera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

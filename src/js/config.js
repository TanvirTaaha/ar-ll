/* ============================================
   AR Hand Letter — Configuration
   ============================================ */

export const CONFIG = {
    positionSmoothing: 0.22,
    /** Lerp factor for smoothing hand centroid (0–1) before mapping to 3D */
    handCentroidSmoothing: 0.28,
    letterScale: 0.35,
    /** Canvas and text: max line width (px), base font size for text block */
    textBlockMaxWidth: 480,
    textBlockFontSize: 32,
    textBlockLineHeight: 40,
    textBlockPadding: 48,
    handConfidence: 0.7,
    depthScale: 5.0,
    fov: 60,
    /** Zoom from fingertip polygon area: min 1 (fingers together), max 5 (fingers spread) */
    zoomMin: 1,
    zoomMax: 3,
    /** Smoothing for zoom scale (lerp per frame) */
    zoomSmoothing: 0.12,
    /** Frames of area history for adaptive min/max (≈1.5 s at 60fps) */
    areaHistoryFrames: 90,
};

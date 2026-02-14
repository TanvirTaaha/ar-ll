/* ============================================
   AR Hand Letter — Application State
   ============================================ */

// THREE is loaded globally via script tag (three.min.js)
const T = typeof THREE !== 'undefined' ? THREE : window.THREE;

export const state = {
    /** Set by app after loading content.json; first page document by default */
    currentLetter: null,
    contentType: 'page', // 'letter' or 'page'
    currentStyle: 'gold',
    /** Centroid of hand (palm + all visible fingers) in normalized 0–1; null when no hand */
    handCentroid: null,
    handDetected: false,
    /** Smoothed 3D position for rendering (lerped from hand centroid) */
    smoothPosition: new T.Vector3(0, 0, 0),
    /** Smoothed centroid (0–1) for stable placement */
    smoothHandCentroid: { x: 0.5, y: 0.5, z: 0 },
    /** Fingertip polygon area (normalized²); drives zoom */
    fingertipPolygonArea: 0,
    /** Zoom level 1–5 from area (1=pinched, 5=spread) */
    zoomLevel: 1,
    /** Smoothed zoom for rendering */
    smoothZoom: 1,
    facingMode: 'environment',
    cameraReady: false,
    letterMesh: null,
    pickerCollapsed: true,
    /** When false, the bottom pane (content picker) is hidden */
    bottomPaneVisible: false,
};

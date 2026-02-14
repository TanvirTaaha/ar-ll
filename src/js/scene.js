/* ============================================
   AR Hand Letter — Three.js Scene & Content
   ============================================ */

import { CONFIG } from './config.js';
import { state } from './state.js';
import { dom } from './dom.js';

const T = typeof THREE !== 'undefined' ? THREE : window.THREE;

let scene, threeCamera, renderer, letterGroup, shadowPlane;

function getMaterial(style) {
    switch (style) {
        case 'gold':
            return new T.MeshStandardMaterial({
                color: 0xffd700,
                metalness: 0.95,
                roughness: 0.15,
                emissive: 0x332200,
                emissiveIntensity: 0.1,
            });
        case 'chrome':
            return new T.MeshStandardMaterial({
                color: 0xebebeb,
                metalness: 1.0,
                roughness: 0.05,
                emissive: 0x111122,
                emissiveIntensity: 0.05,
            });
        case 'neon':
            return new T.MeshStandardMaterial({
                color: 0xaa55ff,
                metalness: 0.2,
                roughness: 0.3,
                emissive: 0x8833ff,
                emissiveIntensity: 0.8,
            });
        default:
            return getMaterial('gold');
    }
}

/**
 * Wrap text into lines that fit within maxWidth (px). Uses word boundaries.
 */
function wrapText(ctx, text, maxWidth) {
    const words = String(text).trim().split(/\s+/);
    if (words.length === 0) return [];
    const lines = [];
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
        const next = current + ' ' + words[i];
        if (ctx.measureText(next).width <= maxWidth) {
            current = next;
        } else {
            lines.push(current);
            current = words[i];
        }
    }
    if (current) lines.push(current);
    return lines;
}

function createLetterMesh(text, style) {
    const material = getMaterial(style);
    const depth = 0.15;
    const canvasWidth = 512;
    const maxLineWidth = CONFIG.textBlockMaxWidth ?? 480;
    const fontSize = CONFIG.textBlockFontSize ?? 32;
    const lineHeight = CONFIG.textBlockLineHeight ?? 40;
    const padding = CONFIG.textBlockPadding ?? 48;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
    const lines = wrapText(ctx, text || '', maxLineWidth);
    const contentHeight = lines.length * lineHeight;
    const canvasHeight = Math.max(512, contentHeight + padding * 2);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = 'white';
    ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = padding + lineHeight / 2;
    lines.forEach((line, i) => {
        ctx.fillText(line, canvasWidth / 2, startY + i * lineHeight);
    });

    const texture = new T.CanvasTexture(canvas);
    texture.minFilter = T.LinearFilter;
    texture.magFilter = T.LinearFilter;

    const frontMat = new T.MeshStandardMaterial({
        map: texture,
        metalness: style === 'chrome' ? 1.0 : style === 'gold' ? 0.9 : 0.2,
        roughness: style === 'chrome' ? 0.1 : style === 'gold' ? 0.2 : 0.3,
        emissive: style === 'neon' ? new T.Color(0x8833ff) : new T.Color(0x000000),
        emissiveIntensity: style === 'neon' ? 0.5 : 0,
    });
    const backMat = material.clone();

    const scale = CONFIG.letterScale;
    const aspect = canvasWidth / canvasHeight;
    const sizeW = aspect >= 1 ? scale : scale * aspect;
    const sizeH = aspect >= 1 ? scale / aspect : scale;

    const blockGeo = new T.BoxGeometry(sizeW, sizeH, depth);
    const materials = [
        material, material, material, material,
        frontMat,
        backMat,
    ];
    const mesh = new T.Mesh(blockGeo, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    letterGroup.add(mesh);

    if (style === 'neon') {
        const glowGeo = new T.BoxGeometry(sizeW + 0.04, sizeH + 0.04, depth + 0.02);
        const glowMat = new T.MeshBasicMaterial({
            color: 0x8833ff,
            transparent: true,
            opacity: 0.12,
        });
        letterGroup.add(new T.Mesh(glowGeo, glowMat));
    }

    state.letterMesh = mesh;
}

/** Draw text fallback on a canvas (used when no pdfUrl or PDF fails). */
function drawTextFallbackCanvas(item, canvas) {
    const cw = canvas.width;
    const ch = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(0, 0, cw, ch);
    ctx.font = 'bold 32px Inter, Arial, sans-serif';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label || 'Document', cw / 2, 56);
    ctx.font = '24px Inter, Arial, sans-serif';
    ctx.fillStyle = '#333';
    const bodyText = (item.text || '').trim() || 'Sample Text';
    const bodyLines = bodyText.split('\n').flatMap((p) => wrapText(ctx, p, cw - 80));
    let y = 120;
    const lineHeight = 36;
    bodyLines.forEach((line) => {
        ctx.fillText(line, cw / 2, y);
        y += lineHeight;
    });
}

/**
 * Load PDF from pdfUrl, render first page to canvas, apply texture to material.
 * If load/render fails, material is left with existing (fallback) texture.
 */
function loadPdfTexture(pdfUrl, pageMat, meshRef) {
    const pdfjsLib = typeof globalThis !== 'undefined' && globalThis.pdfjsLib ? globalThis.pdfjsLib : (typeof window !== 'undefined' && window.pdfjsLib);
    if (!pdfjsLib) return;
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    pdfjsLib.getDocument(pdfUrl).promise
        .then((pdf) => pdf.getPage(1))
        .then((page) => {
            const scale = 2;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            return page.render({ canvasContext: ctx, viewport }).promise.then(() => canvas);
        })
        .then((canvas) => {
            if (state.letterMesh !== meshRef) return;
            const oldMap = pageMat.map;
            const texture = new T.CanvasTexture(canvas);
            texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            pageMat.map = texture;
            pageMat.needsUpdate = true;
            if (oldMap && oldMap.dispose) oldMap.dispose();
        })
        .catch((err) => {
            console.warn('PDF load failed, using text fallback:', pdfUrl, err);
        });
}

function createPageMesh(item, style) {
    const width = 0.4;
    const height = 0.55;
    const depth = 0.005;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 724;
    drawTextFallbackCanvas(item, canvas);

    const texture = new T.CanvasTexture(canvas);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const pageMat = new T.MeshStandardMaterial({
        map: texture,
        roughness: 0.6,
        metalness: 0.1,
        side: T.DoubleSide,
    });
    const pageGeo = new T.BoxGeometry(width, height, depth);

    const mesh = new T.Mesh(pageGeo, pageMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    letterGroup.add(mesh);
    state.letterMesh = mesh;

    if (item.pdfUrl) {
        loadPdfTexture(item.pdfUrl, pageMat, mesh);
    }
}

export function updateContentMesh() {
    while (letterGroup.children.length > 0) {
        const child = letterGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
        letterGroup.remove(child);
    }

    if (state.contentType === 'page') {
        createPageMesh(state.currentLetter, state.currentStyle);
    } else {
        createLetterMesh(state.currentLetter, state.currentStyle);
    }
}

export function initThree() {
    scene = new T.Scene();
    threeCamera = new T.PerspectiveCamera(
        CONFIG.fov,
        window.innerWidth / window.innerHeight,
        0.01,
        100
    );
    threeCamera.position.set(0, 0, 2);

    renderer = new T.WebGLRenderer({
        canvas: dom.threeCanvas,
        alpha: true,
        antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    scene.add(new T.AmbientLight(0xffffff, 0.45));

    const keyLight = new T.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(2, 3, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.002;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);

    const fillLight = new T.DirectionalLight(0x8888ff, 0.35);
    fillLight.position.set(-3, 1, 2);
    scene.add(fillLight);

    const rimLight = new T.DirectionalLight(0xff88cc, 0.3);
    rimLight.position.set(0, -1, -3);
    scene.add(rimLight);

    const shadowGeo = new T.PlaneGeometry(4, 4);
    const shadowMat = new T.ShadowMaterial({ opacity: 0.15 });
    shadowPlane = new T.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    letterGroup = new T.Group();
    letterGroup.visible = false;
    scene.add(letterGroup);

    if (state.currentLetter) {
        updateContentMesh();
    }
}

export function getScene() { return scene; }
export function getCamera() { return threeCamera; }
export function getRenderer() { return renderer; }
export function getLetterGroup() { return letterGroup; }
export function getShadowPlane() { return shadowPlane; }

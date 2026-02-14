/* ============================================
   AR Hand Letter — Main Application
   Accurate 3D hand-tracked letter positioning
   ============================================ */

(function () {
    'use strict';

    // ---- Configuration ----
    const CONFIG = {
        positionSmoothing: 0.22,
        rotationSmoothing: 0.18,
        bobAmplitude: 0.012,
        bobSpeed: 1.6,
        wobbleAmount: 0.03,
        letterScale: 0.35,
        floatHeight: 0.08,
        handConfidence: 0.7,
        depthScale: 5.0,
        fov: 60,
    };

    // ---- State ----
    const state = {
        currentLetter: 'A',
        currentStyle: 'gold',
        handDetected: false,
        // Raw palm data from MediaPipe
        palmCenter3D: { x: 0.5, y: 0.5, z: 0 },
        palmNormal: { x: 0, y: 0, z: 1 },
        palmQuaternion: new THREE.Quaternion(),
        // Smoothed values for rendering
        smoothPosition: new THREE.Vector3(0, 0, 0),
        smoothQuaternion: new THREE.Quaternion(),
        // Camera
        facingMode: 'environment',
        cameraReady: false,
        // 3D
        letterMesh: null,
        animationTime: 0,
        // UI
        pickerCollapsed: true,
    };

    // ---- DOM Elements ----
    const dom = {
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
        styleToggle: document.getElementById('style-toggle'),
    };

    const cameraCtx = dom.cameraCanvas.getContext('2d');

    // ---- Three.js Setup ----
    let scene, threeCamera, renderer, letterGroup;
    let shadowPlane;

    function initThree() {
        scene = new THREE.Scene();

        threeCamera = new THREE.PerspectiveCamera(
            CONFIG.fov,
            window.innerWidth / window.innerHeight,
            0.01,
            100
        );
        threeCamera.position.set(0, 0, 2);

        renderer = new THREE.WebGLRenderer({
            canvas: dom.threeCanvas,
            alpha: true,
            antialias: true,
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;

        // Ambient
        scene.add(new THREE.AmbientLight(0xffffff, 0.45));

        // Key light
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(2, 3, 4);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.bias = -0.002;
        keyLight.shadow.radius = 4;
        scene.add(keyLight);

        // Fill light
        const fillLight = new THREE.DirectionalLight(0x8888ff, 0.35);
        fillLight.position.set(-3, 1, 2);
        scene.add(fillLight);

        // Rim light
        const rimLight = new THREE.DirectionalLight(0xff88cc, 0.3);
        rimLight.position.set(0, -1, -3);
        scene.add(rimLight);

        // Shadow plane
        const shadowGeo = new THREE.PlaneGeometry(4, 4);
        const shadowMat = new THREE.ShadowMaterial({ opacity: 0.15 });
        shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -0.5;
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);

        // Letter group
        letterGroup = new THREE.Group();
        letterGroup.visible = false;
        scene.add(letterGroup);

        createLetterMesh(state.currentLetter, state.currentStyle);
    }

    // ---- Material Presets ----
    function getMaterial(style) {
        switch (style) {
            case 'gold':
                return new THREE.MeshStandardMaterial({
                    color: 0xffd700,
                    metalness: 0.95,
                    roughness: 0.15,
                    emissive: 0x332200,
                    emissiveIntensity: 0.1,
                });
            case 'chrome':
                return new THREE.MeshStandardMaterial({
                    color: 0xebebeb,
                    metalness: 1.0,
                    roughness: 0.05,
                    emissive: 0x111122,
                    emissiveIntensity: 0.05,
                });
            case 'neon':
                return new THREE.MeshStandardMaterial({
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

    // ---- 3D Letter Creation ----
    function createLetterMesh(letter, style) {
        // Clear previous
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

        const material = getMaterial(style);
        const depth = 0.15;
        const size = CONFIG.letterScale;

        // Create letter texture on canvas
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Background for non-letter areas (transparent-ish)
        ctx.clearRect(0, 0, 256, 256);

        // Draw letter
        ctx.fillStyle = 'white';
        ctx.font = 'bold 180px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, 128, 136);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Front face material with texture
        const frontMat = new THREE.MeshStandardMaterial({
            map: texture,
            metalness: style === 'chrome' ? 1.0 : style === 'gold' ? 0.9 : 0.2,
            roughness: style === 'chrome' ? 0.1 : style === 'gold' ? 0.2 : 0.3,
            emissive: style === 'neon' ? new THREE.Color(0x8833ff) : new THREE.Color(0x000000),
            emissiveIntensity: style === 'neon' ? 0.5 : 0,
        });
        const backMat = material.clone();

        const blockGeo = new THREE.BoxGeometry(size, size, depth);
        const materials = [
            material,   // +x
            material,   // -x
            material,   // +y
            material,   // -y
            frontMat,   // +z (front)
            backMat,    // -z (back)
        ];

        const mesh = new THREE.Mesh(blockGeo, materials);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        letterGroup.add(mesh);

        // Neon glow
        if (style === 'neon') {
            const glowGeo = new THREE.BoxGeometry(size + 0.04, size + 0.04, depth + 0.02);
            const glowMat = new THREE.MeshBasicMaterial({
                color: 0x8833ff,
                transparent: true,
                opacity: 0.12,
            });
            letterGroup.add(new THREE.Mesh(glowGeo, glowMat));
        }

        state.letterMesh = mesh;
    }

    // ======================================================
    // 3D Hand Orientation from MediaPipe Landmarks
    // ======================================================
    //
    // We build a proper coordinate frame from the palm:
    //  - Origin: centroid of wrist(0), index_mcp(5), pinky_mcp(17)
    //  - X-axis: wrist → pinky_mcp (across the palm)
    //  - Y-axis: wrist → index_mcp (up the hand)
    //  - Z-axis: cross(X, Y) — palm normal (pointing out of palm)
    //
    // This gives us a rotation matrix that exactly matches the
    // hand's 3D orientation, including depth tilt, roll, etc.
    // ======================================================

    function vec3FromLandmark(lm) {
        return new THREE.Vector3(lm.x, lm.y, lm.z || 0);
    }

    function computeHandFrame(landmarks) {
        // Key landmarks for building a coordinate frame
        const wrist = vec3FromLandmark(landmarks[0]);
        const indexMcp = vec3FromLandmark(landmarks[5]);
        const middleMcp = vec3FromLandmark(landmarks[9]);
        const ringMcp = vec3FromLandmark(landmarks[13]);
        const pinkyMcp = vec3FromLandmark(landmarks[17]);

        // Palm center (average of base landmarks)
        const palmCenter = new THREE.Vector3()
            .add(wrist)
            .add(indexMcp)
            .add(middleMcp)
            .add(ringMcp)
            .add(pinkyMcp)
            .multiplyScalar(0.2);

        // Build two edge vectors on the palm plane:
        //   v1: wrist → middle_mcp  (along the hand, "up")
        //   v2: index_mcp → pinky_mcp (across the hand, "right")
        const vUp = new THREE.Vector3().subVectors(middleMcp, wrist).normalize();
        const vRight = new THREE.Vector3().subVectors(pinkyMcp, indexMcp).normalize();

        // Palm normal via cross product (perpendicular to palm)
        const vNormal = new THREE.Vector3().crossVectors(vUp, vRight).normalize();

        // Re-orthogonalize: recompute vRight to be truly perpendicular
        const vRightOrtho = new THREE.Vector3().crossVectors(vNormal, vUp).normalize();

        // Build a rotation matrix from these basis vectors
        // Column layout: [vRightOrtho | vUp | vNormal]
        const rotMatrix = new THREE.Matrix4();
        rotMatrix.makeBasis(vRightOrtho, vUp, vNormal);

        const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

        return { palmCenter, quaternion, vNormal };
    }

    // ---- MediaPipe Hands ----
    let hands;

    function initHandDetection() {
        updateLoadingStatus('Loading hand detection model...');

        hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
            },
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: CONFIG.handConfidence,
            minTrackingConfidence: 0.5,
        });

        hands.onResults(onHandResults);
    }

    function onHandResults(results) {
        // Draw camera frame to canvas
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
                dom.statusText.textContent = 'Hand detected ✓';
            }
        } else {
            if (state.handDetected) {
                state.handDetected = false;
                dom.trackingStatus.classList.remove('tracking');
                dom.statusText.textContent = 'Show your hand';
            }
        }
    }

    function processHandLandmarks(landmarks) {
        // Mirror x for front-facing camera
        const mirrored = state.facingMode === 'user';
        const processedLandmarks = landmarks.map(lm => ({
            x: mirrored ? (1 - lm.x) : lm.x,
            y: lm.y,
            z: lm.z || 0,
        }));

        // Compute full 3D hand frame
        const frame = computeHandFrame(processedLandmarks);

        state.palmCenter3D.x = frame.palmCenter.x;
        state.palmCenter3D.y = frame.palmCenter.y;
        state.palmCenter3D.z = frame.palmCenter.z;
        state.palmQuaternion.copy(frame.quaternion);
    }

    // ---- Camera ----
    async function startCamera() {
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

    function stopCamera() {
        if (dom.video.srcObject) {
            dom.video.srcObject.getTracks().forEach(t => t.stop());
            dom.video.srcObject = null;
        }
    }

    async function switchCamera() {
        stopCamera();
        state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
        await startCamera();
        startDetectionLoop();
    }

    // ---- Detection Loop ----
    let detecting = false;

    function startDetectionLoop() {
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

    // ---- 3D Animation Loop ----
    function animate() {
        requestAnimationFrame(animate);

        const dt = 0.016;
        state.animationTime += dt;

        if (state.handDetected && letterGroup) {
            letterGroup.visible = true;

            // --- Position: map normalized [0,1] to Three.js world coords ---
            const aspect = window.innerWidth / window.innerHeight;
            const fovRad = THREE.MathUtils.degToRad(CONFIG.fov);
            const halfH = Math.tan(fovRad / 2) * threeCamera.position.z;
            const halfW = halfH * aspect;

            // Map landmark x,y (0..1) to world coordinates
            const targetX = (state.palmCenter3D.x - 0.5) * 2 * halfW;
            const targetY = -(state.palmCenter3D.y - 0.5) * 2 * halfH;
            // Z: MediaPipe z is relative depth — scale and offset
            const targetZ = -state.palmCenter3D.z * CONFIG.depthScale;

            const targetPos = new THREE.Vector3(targetX, targetY - CONFIG.floatHeight, targetZ);

            // Smooth position with lerp
            state.smoothPosition.lerp(targetPos, CONFIG.positionSmoothing);

            // Add subtle bob
            const bobY = Math.sin(state.animationTime * CONFIG.bobSpeed) * CONFIG.bobAmplitude;

            letterGroup.position.copy(state.smoothPosition);
            letterGroup.position.y += bobY;

            // --- Rotation: slerp toward hand quaternion ---
            // Add a subtle idle wobble on top
            const wobbleQ = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                    Math.sin(state.animationTime * 0.7) * CONFIG.wobbleAmount,
                    Math.sin(state.animationTime * 0.5) * CONFIG.wobbleAmount,
                    0
                )
            );

            const targetQ = state.palmQuaternion.clone().multiply(wobbleQ);
            state.smoothQuaternion.slerp(targetQ, CONFIG.rotationSmoothing);
            letterGroup.quaternion.copy(state.smoothQuaternion);

            // Shadow follows
            shadowPlane.position.x = state.smoothPosition.x;
            shadowPlane.position.z = state.smoothPosition.z;

            // Subtle scale pulse
            const pulse = 1 + Math.sin(state.animationTime * 2) * 0.008;
            letterGroup.scale.setScalar(pulse);

        } else if (letterGroup) {
            letterGroup.visible = false;
        }

        renderer.render(scene, threeCamera);
    }

    // ---- UI ----
    function buildLetterGrid() {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const digits = '0123456789';
        const symbols = '♥★♦♠♣☺✿';
        const allChars = letters + digits + symbols;

        dom.letterGrid.innerHTML = '';

        for (const char of allChars) {
            const btn = document.createElement('button');
            btn.className = 'letter-cell' + (char === state.currentLetter ? ' active' : '');
            btn.textContent = char;
            btn.setAttribute('data-letter', char);
            btn.addEventListener('click', () => selectLetter(char));
            dom.letterGrid.appendChild(btn);
        }
    }

    function selectLetter(letter) {
        state.currentLetter = letter;
        document.querySelectorAll('.letter-cell').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-letter') === letter);
        });
        createLetterMesh(letter, state.currentStyle);
    }

    function initStyleToggle() {
        dom.styleToggle.querySelectorAll('.style-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.getAttribute('data-style');
                state.currentStyle = style;
                dom.styleToggle.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                createLetterMesh(state.currentLetter, style);
            });
        });
    }

    function initPickerCollapse() {
        dom.letterPicker.classList.add('collapsed');
        dom.pickerHandle.addEventListener('click', () => {
            state.pickerCollapsed = !state.pickerCollapsed;
            dom.letterPicker.classList.toggle('collapsed', state.pickerCollapsed);
        });
    }

    function initCameraToggle() {
        dom.toggleCameraBtn.addEventListener('click', switchCamera);
    }

    // ---- Resize ----
    function onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        threeCamera.aspect = w / h;
        threeCamera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    // ---- Loading ----
    function updateLoadingStatus(text) {
        if (dom.loadingStatus) dom.loadingStatus.textContent = text;
    }

    function hideLoading() {
        dom.loadingScreen.classList.add('fade-out');
        setTimeout(() => dom.loadingScreen.classList.add('hidden'), 600);
    }

    function showHUD() {
        dom.hud.classList.remove('hidden');
    }

    // ---- Init ----
    async function init() {
        updateLoadingStatus('Preparing 3D engine...');
        initThree();

        updateLoadingStatus('Loading hand detection...');
        initHandDetection();

        buildLetterGrid();
        initStyleToggle();
        initPickerCollapse();
        initCameraToggle();
        window.addEventListener('resize', onResize);

        try {
            updateLoadingStatus('Accessing camera...');
            await startCamera();

            updateLoadingStatus('Starting hand detection...');
            startDetectionLoop();

            hideLoading();
            showHUD();
            animate();
        } catch (err) {
            hideLoading();
            dom.permissionScreen.classList.remove('hidden');

            dom.grantBtn.addEventListener('click', async () => {
                try {
                    await startCamera();
                    dom.permissionScreen.classList.add('hidden');
                    startDetectionLoop();
                    showHUD();
                    animate();
                } catch (e) {
                    alert('Camera access is required for this AR experience. Please enable camera permissions in your browser settings.');
                }
            });

            animate();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

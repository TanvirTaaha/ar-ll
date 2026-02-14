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
        contentType: 'letter', // 'letter' or 'page'
        currentStyle: 'gold',
        handDetected: false,
        isPinching: false,
        pinchStart: 0,
        // Raw palm data from MediaPipe
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
        categoryTabs: document.createElement('div'), // Will be added dynamically
        cameraLoadingOverlay: document.createElement('div'),
    };

    // Camera Switch Overlay
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


    const cameraCtx = dom.cameraCanvas.getContext('2d');

    // ---- Three.js Setup ----
    let scene, threeCamera, renderer, letterGroup;
    let shadowPlane;

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

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

        // Initial render logic depending on type
        if (state.currentLetter) {
            updateContentMesh();
        }
    }

    // ---- Content Creation Hub ----
    function updateContentMesh() {
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

        if (state.contentType === 'page') {
            createPageMesh(state.currentLetter, state.currentStyle); // currentLetter holds item object for pages
        } else {
            createLetterMesh(state.currentLetter, state.currentStyle);
        }
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

    function createPageMesh(item, style) {
        // Page dimensions (A4-ish)
        const width = 0.4;
        const height = 0.55;
        const depth = 0.005;

        // Simulate page texture (or PDF if we had one)
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 724;
        const ctx = canvas.getContext('2d');

        // White paper background
        ctx.fillStyle = '#fdfdfd';
        ctx.fillRect(0, 0, 512, 724);

        // Header
        ctx.fillStyle = '#111';
        ctx.font = 'bold 32px Inter, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(item.label || "Document", 40, 60);

        // Body Text
        ctx.font = '24px Inter, Arial, sans-serif';
        ctx.fillStyle = '#444';
        const lines = (item.text || "Sample Text").split('\n');
        let y = 120;
        lines.forEach(line => {
            ctx.fillText(line, 40, y);
            y += 36;
        });

        // Add some "lines" to look like a document
        ctx.fillStyle = '#ddd';
        for (let i = 0; i < 10; i++) {
            ctx.fillRect(40, y + (i * 40), 432, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

        const pageMat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.6,
            metalness: 0.1, // Paper isn't metal
            side: THREE.DoubleSide,
        });

        const pageGeo = new THREE.BoxGeometry(width, height, depth);

        // IMPORTANT: Move geometry so bottom-right corner is at (0,0,0) locally
        // Original center is (0,0,0). 
        // Bottom-Right corner is at (width/2, -height/2, 0).
        // We want (width/2, -height/2, 0) to be at world (0,0,0).
        // So we translate geometry by (-width/2, +height/2, 0) relative to mesh origin?
        // Wait, if bottom-right is anchor, then mesh origin should be at bottom-right.
        // Geometry needs to be offset so that its bottom-right vertex is at (0,0,0).
        // Geometry center is (0,0,0). Bottom-Right is (w/2, -h/2).
        // To make Bottom-Right (0,0,0), we subtract (w/2, -h/2).
        // So translate geometry by (-width/2, height/2, 0).
        pageGeo.translate(-width / 2, height / 2, 0);

        const mesh = new THREE.Mesh(pageGeo, pageMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        letterGroup.add(mesh);

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

        // Detect Pinch (Index tip vs Thumb tip)
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];
        const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y, (indexTip.z || 0) - (thumbTip.z || 0));

        // Threshold for pinch (tunable)
        const pinchThreshold = 0.05; // ~5% of screen
        const wasPinching = state.isPinching;
        state.isPinching = distance < pinchThreshold;

        // Update pinch position (midpoint)
        if (state.isPinching) {
            state.pinchCenter = {
                x: (indexTip.x + thumbTip.x) / 2,
                y: (indexTip.y + thumbTip.y) / 2,
                z: ((indexTip.z || 0) + (thumbTip.z || 0)) / 2
            };
        }
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
        if (state.cameraReady) {
            updateLoadingStatus('Switching camera...');
            dom.loadingScreen.classList.remove('hidden', 'fade-out');

            // Release existing stream tracks immediately to free hardware
            stopCamera();

            // Short delay to allow browser to release camera resource properly
            await new Promise(r => setTimeout(r, 300));

            state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';

            try {
                await startCamera();
            } catch (err) {
                console.error('Camera switch failed:', err);
                // Fallback attempt
                state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
                await startCamera();
            }

            startDetectionLoop();
            hideLoading();
        }
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

            // --- Position Logic ---
            let targetX, targetY, targetZ;
            let targetQ;

            const aspect = window.innerWidth / window.innerHeight;
            const fovRad = THREE.MathUtils.degToRad(CONFIG.fov);
            const halfH = Math.tan(fovRad / 2) * threeCamera.position.z;
            const halfW = halfH * aspect;

            if (state.contentType === 'page') {
                // Page Mode: Only follows pinch
                if (state.isPinching && state.pinchCenter) {
                    // Map pinch center (0..1) to world
                    targetX = (state.pinchCenter.x - 0.5) * 2 * halfW;
                    targetY = -(state.pinchCenter.y - 0.5) * 2 * halfH;
                    targetZ = -state.pinchCenter.z * CONFIG.depthScale;

                    // Rotation: Look at camera (billboard)
                    const dummyObj = new THREE.Object3D();
                    dummyObj.position.set(targetX, targetY, targetZ);
                    dummyObj.lookAt(threeCamera.position);
                    targetQ = dummyObj.quaternion;

                } else {
                    // Not pinching: Fly off screen (Top Right corner)
                    targetX = 2.5; // Offscreen Right
                    targetY = 2.5; // Offscreen Up
                    targetZ = -3;
                    targetQ = new THREE.Quaternion(); // Default orientation
                }
            } else {
                // Letter Mode: Use existing palm tracking
                targetX = (state.palmCenter3D.x - 0.5) * 2 * halfW;
                targetY = -(state.palmCenter3D.y - 0.5) * 2 * halfH;
                targetZ = -state.palmCenter3D.z * CONFIG.depthScale;
                const bobY = Math.sin(state.animationTime * CONFIG.bobSpeed) * CONFIG.bobAmplitude;
                targetY -= CONFIG.floatHeight;
                targetY += bobY;

                // Rotation
                const wobbleQ = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(
                        Math.sin(state.animationTime * 0.7) * CONFIG.wobbleAmount,
                        Math.sin(state.animationTime * 0.5) * CONFIG.wobbleAmount,
                        0
                    )
                );
                targetQ = state.palmQuaternion.clone().multiply(wobbleQ);
            }

            const targetPos = new THREE.Vector3(targetX, targetY, targetZ);

            // Smooth position (faster for pages to feel responsive/snappy)
            state.smoothPosition.lerp(targetPos, state.contentType === 'page' ? 0.2 : CONFIG.positionSmoothing);
            letterGroup.position.copy(state.smoothPosition);

            // Smooth rotation
            state.smoothQuaternion.slerp(targetQ, CONFIG.rotationSmoothing);
            letterGroup.quaternion.copy(state.smoothQuaternion);

            // Shadow
            shadowPlane.position.x = state.smoothPosition.x;
            shadowPlane.position.z = state.smoothPosition.z;

            // Pulse for letters only
            if (state.contentType !== 'page') {
                const pulse = 1 + Math.sin(state.animationTime * 2) * 0.008;
                letterGroup.scale.setScalar(pulse);
            } else {
                letterGroup.scale.setScalar(1);
            }

        } else if (letterGroup) {
            // Check if page needs to finish flying out
            if (state.contentType === 'page' && !state.handDetected) {
                // Fly out if hand lost
                state.smoothPosition.lerp(new THREE.Vector3(2.5, 2.5, -3), 0.1);
                letterGroup.position.copy(state.smoothPosition);
                // Hide if far enough?
                if (state.smoothPosition.x > 2.0) letterGroup.visible = false;
                else letterGroup.visible = true;
            } else {
                letterGroup.visible = false;
            }
        }

        renderer.render(scene, threeCamera);
    }

    // ---- UI ----
    function buildLetterGrid(data) {
        dom.letterGrid.innerHTML = '';
        dom.categoryTabs.innerHTML = '';

        if (!data || !data.categories) return;

        data.categories.forEach((cat, index) => {
            // Create Tab
            const tab = document.createElement('button');
            tab.className = 'category-tab' + (index === 0 ? ' active' : '');
            tab.textContent = cat.name;
            tab.onclick = () => {
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderGridItems(cat.items);
            };
            dom.categoryTabs.appendChild(tab);

            if (index === 0) renderGridItems(cat.items);
        });
    }

    function renderGridItems(items) {
        dom.letterGrid.innerHTML = '';

        // Check if items are objects (Pages) or strings
        const isPage = typeof items !== 'string';
        const list = isPage ? items : items.split('');

        list.forEach(item => {
            const btn = document.createElement('button');
            const label = isPage ? (item.label || item.id) : item;

            btn.className = 'letter-cell' + (label === (isPage ? (state.currentLetter.label || state.currentLetter.id) : state.currentLetter) ? ' active' : '');

            // If page, use label text, else char
            btn.textContent = isPage ? label.substring(0, 2).toUpperCase() : label;
            if (isPage) {
                btn.style.fontSize = '0.8rem';
                btn.title = label;
            }

            btn.addEventListener('click', () => {
                selectContent(item, isPage ? 'page' : 'letter');
            });
            dom.letterGrid.appendChild(btn);
        });
    }

    function selectContent(item, type) {
        state.contentType = type;
        state.currentLetter = item;

        document.querySelectorAll('.letter-cell').forEach(el => el.classList.remove('active'));
        // Re-highlight logic is tricky with object comparison, simplest is just re-render grid or find by text
        // But for MVP just update mesh
        updateContentMesh();
    }

    function initStyleToggle() {
        dom.styleToggle.querySelectorAll('.style-btn').forEach(btn => {
            const style = btn.getAttribute('data-style');
            state.currentStyle = style;
            dom.styleToggle.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateContentMesh();
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
        // --- 1. Secure Context Check ---
        if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            const httpsUrl = location.href.replace(/^http:/, 'https:');
            dom.loadingStatus.innerHTML = `
                Authentication required for camera access.<br>
                <a href="${httpsUrl}" style="color: #a855f7; text-decoration: underline; margin-top: 10px; display: inline-block;">Switch to Secure Mode (HTTPS)</a>
            `;
            dom.loadingScreen.querySelector('.loader-ring').style.display = 'none';
            return;
        }

        // Create category selector container
        dom.categoryTabs.className = 'category-tabs';
        dom.letterPicker.insertBefore(dom.categoryTabs, dom.letterGrid);

        // Define tasks for parallel execution
        const tasks = [
            // 1. Load Data
            (async () => {
                updateLoadingStatus('Loading assets...');
                try {
                    const response = await fetch('./src/data/content.json');
                    const data = await response.json();
                    buildLetterGrid(data);
                } catch (e) {
                    console.error('Failed to load content, fallback to default', e);
                    buildLetterGrid({ categories: [{ id: 'default', name: 'Letters', items: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }] });
                }
            })(),

            // 2. Init Three.js (synchronous but heavy) and Hand Detection
            (async () => {
                updateLoadingStatus('Preparing 3D engine...');
                initThree();
                updateLoadingStatus('Loading AI models...');
                initHandDetection();
            })(),

            // 3. Camera (slowest, starts independent)
            (async () => {
                if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
                updateLoadingStatus('Accessing camera...');
                try {
                    await startCamera();
                } catch (e) {
                    console.warn('Camera failed during parallel init:', e);
                    throw e; // Check later
                }
            })()
        ];

        try {
            await Promise.all(tasks);

            updateLoadingStatus('Starting experience...');
            startDetectionLoop();
            hideLoading();
            showHUD();
            animate();
        } catch (err) {
            console.error('Camera init error:', err);
            hideLoading();

            // Show custom error messages based on error type
            const errorTitle = dom.permissionScreen.querySelector('h2');
            const errorMsg = dom.permissionScreen.querySelector('p');
            const btn = dom.grantBtn;

            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errorTitle.textContent = 'Camera Permission Denied';
                errorMsg.innerHTML = 'Please enable camera access in your browser settings:<br><b>Settings > Site Settings > Camera</b><br>then refresh the page.';
                btn.textContent = 'Try Again';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errorTitle.textContent = 'No Camera Found';
                errorMsg.textContent = 'No camera device was detected on your system.';
                btn.style.display = 'none';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                errorTitle.textContent = 'Camera In Use';
                errorMsg.textContent = 'Your camera may be used by another application. Please close it and try again.';
            }

            dom.permissionScreen.classList.remove('hidden');

            // Allow retry
            btn.onclick = async () => {
                try {
                    updateLoadingStatus('Retrying camera...');
                    dom.permissionScreen.classList.add('hidden');
                    dom.loadingScreen.classList.remove('hidden', 'fade-out');

                    await startCamera();

                    startDetectionLoop();
                    hideLoading();
                    showHUD();
                    animate();
                } catch (retryErr) {
                    console.error('Retry failed:', retryErr);
                    // If retry fails, reload page to reset permission state prompts in some browsers
                    location.reload();
                }
            };

            animate(); // Ensure 3D scene renders even without camera (just empty background)
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

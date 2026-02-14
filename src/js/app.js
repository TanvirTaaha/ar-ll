/* ============================================
   AR Hand Letter — Main Entry
   ============================================ */

'use strict';

import { dom } from './dom.js';
import { state } from './state.js';
import { initThree, updateContentMesh } from './scene.js';

function setDefaultContent(data) {
    if (!data?.categories?.length) return;
    const first = data.categories[0];
    const items = first?.items;
    if (Array.isArray(items) && items.length > 0) {
        state.currentLetter = items[0];
        state.contentType = typeof items[0] === 'object' && items[0].type === 'page' ? 'page' : 'letter';
    } else if (typeof items === 'string' && items.length > 0) {
        state.currentLetter = items[0];
        state.contentType = 'letter';
    }
}
import { initHandDetection, startDetectionLoop } from './handTracking.js';
import { startCamera, stopCamera, switchCamera } from './camera.js';
import { startAnimation } from './animation.js';
import {
    buildContentList,
    updateLoadingStatus,
    hideLoading,
    showHUD,
    initStyleToggle,
    initPickerCollapse,
    initCameraToggle,
} from './ui.js';
import { onResize } from './resize.js';

async function init() {
    if (
        !window.isSecureContext &&
        location.hostname !== 'localhost' &&
        location.hostname !== '127.0.0.1'
    ) {
        const httpsUrl = location.href.replace(/^http:/, 'https:');
        dom.loadingStatus.innerHTML = `
            Authentication required for camera access.<br>
            <a href="${httpsUrl}" style="color: #a855f7; text-decoration: underline; margin-top: 10px; display: inline-block;">Switch to Secure Mode (HTTPS)</a>
        `;
        dom.loadingScreen.querySelector('.loader-ring').style.display = 'none';
        return;
    }

    const doSwitchCamera = () =>
        switchCamera(startDetectionLoop, updateLoadingStatus, hideLoading);

    const tasks = [
        (async () => {
            updateLoadingStatus('Loading assets...');
            try {
                const response = await fetch('./data/content.json');
                if (!response.ok) throw new Error(`Content failed to load: ${response.status}`);
                const data = await response.json();
                setDefaultContent(data);
                buildContentList(data);
            } catch (e) {
                console.error('Failed to load content, fallback to default', e);
                const fallback = {
                    categories: [
                        { id: 'pages', name: 'Pages', items: [{ type: 'page', id: 'happy-birthday', label: 'Happy Birthday', text: 'Happy Birthday to you!' }] },
                    ],
                };
                setDefaultContent(fallback);
                buildContentList(fallback);
            }
        })(),
        (async () => {
            updateLoadingStatus('Preparing 3D engine...');
            initThree();
            updateLoadingStatus('Loading AI models...');
            initHandDetection(updateLoadingStatus);
        })(),
        (async () => {
            if (
                !window.isSecureContext &&
                location.hostname !== 'localhost' &&
                location.hostname !== '127.0.0.1'
            )
                return;
            updateLoadingStatus('Accessing camera...');
            try {
                await startCamera();
            } catch (e) {
                console.warn('Camera failed during parallel init:', e);
                throw e;
            }
        })(),
    ];

    try {
        await Promise.all(tasks);

        initPickerCollapse();
        initStyleToggle();
        initCameraToggle(doSwitchCamera);
        window.addEventListener('resize', onResize);

        updateContentMesh();

        updateLoadingStatus('Starting experience...');
        startDetectionLoop();
        hideLoading();
        showHUD();
        startAnimation();
    } catch (err) {
        console.error('Camera init error:', err);
        hideLoading();

        const errorTitle = dom.permissionScreen.querySelector('h2');
        const errorMsg = dom.permissionScreen.querySelector('p');
        const btn = dom.grantBtn;

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorTitle.textContent = 'Camera Permission Denied';
            errorMsg.innerHTML =
                'Please enable camera access in your browser settings:<br><b>Settings > Site Settings > Camera</b><br>then refresh the page.';
            btn.textContent = 'Try Again';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            errorTitle.textContent = 'No Camera Found';
            errorMsg.textContent = 'No camera device was detected on your system.';
            btn.style.display = 'none';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            errorTitle.textContent = 'Camera In Use';
            errorMsg.textContent =
                'Your camera may be used by another application. Please close it and try again.';
        }

        dom.permissionScreen.classList.remove('hidden');

        btn.onclick = async () => {
            try {
                updateLoadingStatus('Retrying camera...');
                dom.permissionScreen.classList.add('hidden');
                dom.loadingScreen.classList.remove('hidden', 'fade-out');
                await startCamera();
                startDetectionLoop();
                hideLoading();
                showHUD();
                startAnimation();
            } catch (retryErr) {
                console.error('Retry failed:', retryErr);
                location.reload();
            }
        };

        startAnimation();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

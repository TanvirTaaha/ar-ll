/* ============================================
   AR Hand Letter — UI (content list, picker, loading)
   ============================================ */

import { state } from './state.js';
import { dom } from './dom.js';
import { updateContentMesh } from './scene.js';

export function updateLoadingStatus(text) {
    if (dom.loadingStatus) dom.loadingStatus.textContent = text;
}

export function hideLoading() {
    dom.loadingScreen.classList.add('fade-out');
    setTimeout(() => dom.loadingScreen.classList.add('hidden'), 600);
}

export function applyBottomPaneVisibility() {
    if (dom.hudBottom) {
        dom.hudBottom.classList.toggle('hidden', !state.bottomPaneVisible);
    }
}

export function showHUD() {
    dom.hud.classList.remove('hidden');
    applyBottomPaneVisibility();
}

/**
 * Build content list from content.json: categories and items as a list
 * (replaces letter keyboard).
 */
export function buildContentList(data) {
    const container = dom.letterGrid;
    container.innerHTML = '';
    container.className = 'content-list';

    if (!data || !data.categories) return;

    data.categories.forEach((cat) => {
        const section = document.createElement('div');
        section.className = 'content-category';

        const heading = document.createElement('div');
        heading.className = 'content-category-name';
        heading.textContent = cat.name;
        section.appendChild(heading);

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'content-items';

        const isPageCategory = Array.isArray(cat.items) && cat.items.length > 0 && typeof cat.items[0] === 'object';
        const list = isPageCategory ? cat.items : (typeof cat.items === 'string' ? cat.items.split('') : cat.items);

        list.forEach((item) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'content-item';

            const label = isPageCategory ? (item.label || item.id || '') : String(item);
            const isActive = isPageCategory
                ? (state.currentLetter && (state.currentLetter.label || state.currentLetter.id) === (item.label || item.id))
                : state.currentLetter === item;

            if (isActive) row.classList.add('active');

            row.textContent = isPageCategory ? label : item;
            if (isPageCategory && item.text) {
                row.title = item.text.slice(0, 80) + (item.text.length > 80 ? '…' : '');
            }

            row.addEventListener('click', () => {
                selectContent(item, isPageCategory ? 'page' : 'letter');
                container.querySelectorAll('.content-item').forEach((el) => el.classList.remove('active'));
                row.classList.add('active');
            });

            itemsContainer.appendChild(row);
        });

        section.appendChild(itemsContainer);
        container.appendChild(section);
    });
}

export function selectContent(item, type) {
    state.contentType = type;
    state.currentLetter = item;
    updateContentMesh();
}

export function initStyleToggle() {
    dom.styleToggle.querySelectorAll('.style-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const style = btn.getAttribute('data-style');
            state.currentStyle = style;
            dom.styleToggle.querySelectorAll('.style-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            updateContentMesh();
        });
    });
}

export function initPickerCollapse() {
    dom.letterPicker.classList.add('collapsed');
    dom.pickerHandle.addEventListener('click', () => {
        state.pickerCollapsed = !state.pickerCollapsed;
        dom.letterPicker.classList.toggle('collapsed', state.pickerCollapsed);
    });
}

export function initCameraToggle(switchCamera) {
    dom.toggleCameraBtn.addEventListener('click', () => switchCamera());
}

/**
 * Tour Editor — Master Wizard for Virtual Tours
 * Features:
 * - Step 1: Floor plans management
 * - Step 2: Points on plan (transition + info) with drag & drop
 * - Step 3: Panoramas upload for transition points
 * - Step 4: Markers inside panoramas (azimuth + pitch + label)
 */

// ============ API Configuration ============
const API = {
    plans: '/api/evac_plans/',
    points: '/api/map_points/',
    panoramas: '/api/panoramas/',
    markers: '/api/panorama_markers/',
    infoPoints: '/api/panorama_info_points/'
};

const LS_KEY = 'tour_editor_state_v2';

// ============ DOM Elements ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
    statusBar: $('#statusBar'),
    statusText: $('.status-text'),
    statusIcon: $('.status-icon'),
    stepHint: $('#stepHint'),
    hintText: $('#hintText'),
    stepper: $('#stepper'),

    // Plans
    planSearch: $('#planSearch'),
    planList: $('#planList'),
    refreshPlansBtn: $('#refreshPlansBtn'),
    createPlanBtn: $('#createPlanBtn'),
    planFloor: $('#planFloor'),
    planTitle: $('#planTitle'),
    // FIX: в шаблоне <input type="file"> теперь имеет уникальный id, иначе JS путал его с <img id="planImage">
    planImageFile: $('#planImageFile'),

    // Canvas
    planCanvas: $('#planCanvas'),
    canvasPlaceholder: $('#canvasPlaceholder'),
    planWrapper: $('#planWrapper'),
    // <img id="planImage"> — реальное изображение плана
    planImg: $('#planImage'),
    // FIX: оверлей точек привязан к размерам изображения
    planInner: $('#planInner'),
    pointsLayer: $('#pointsLayer'),

    // Panorama Canvas
    panoramaCanvas: $('#panoramaCanvas'),
    panoramaViewer: $('#panoramaViewer'),
    panoramaPlaceholder: $('#panoramaPlaceholder'),
    panoramaWrapper: $('#panoramaWrapper'),
    // FIX: общий контейнер для <img> + оверлей маркеров, чтобы маркеры скроллились вместе с панорамой
    panoramaInner: $('#panoramaInner'),
    panoramaImage: $('#panoramaImage'),
    markersLayer: $('#markersLayer'),

    // Sections
    plansSection: $('#plansSection'),
    pointsSection: $('#pointsSection'),
    panoramasSection: $('#panoramasSection'),
    transitionsSection: $('#transitionsSection'),

    // Points
    pointsList: $('#pointsList'),
    addPointPanel: $('#addPointPanel'),
    newPointType: $('#newPointType'),

    // Panoramas
    panoramasList: $('#panoramasList'),
    addPanoramaMarkerPanel: $('#addPanoramaMarkerPanel'),
    panoramaAddType: $('#panoramaAddType'),

    // Transitions
    markersList: $('#markersList'),
    addTransitionPanel: $('#addTransitionPanel'),
    targetPointSelect: $('#targetPointSelect'),

    // Inspectors
    planInspector: $('#planInspector'),
    pointInspector: $('#pointInspector'),
    panoramaInspector: $('#panoramaInspector'),
    markerInspector: $('#markerInspector'),

    // Plan Inspector
    editPlanTitle: $('#editPlanTitle'),
    editPlanFloor: $('#editPlanFloor'),
    savePlanBtn: $('#savePlanBtn'),
    deletePlanBtn: $('#deletePlanBtn'),

    // Point Inspector
    editPointName: $('#editPointName'),
    editPointType: $('#editPointType'),
    editPointX: $('#editPointX'),
    editPointY: $('#editPointY'),
    editInfoText: $('#editInfoText'),
    infoTextField: $('#infoTextField'),
    savePointBtn: $('#savePointBtn'),
    deletePointBtn: $('#deletePointBtn'),

    // Panorama Inspector
    panoramaPreview: $('#panoramaPreview'),
    panoramaUpload: $('#panoramaUpload'),
    uploadPreview: $('#uploadPreview'),
    previewImage: $('#previewImage'),
    uploadPanoramaBtn: $('#uploadPanoramaBtn'),
    deletePanoramaBtn: $('#deletePanoramaBtn'),

    // Marker Inspector
    editMarkerLabel: $('#editMarkerLabel'),
    editMarkerTarget: $('#editMarkerTarget'),
    editMarkerAzimuth: $('#editMarkerAzimuth'),
    editMarkerPitch: $('#editMarkerPitch'),
    saveMarkerBtn: $('#saveMarkerBtn'),
    deleteMarkerBtn: $('#deleteMarkerBtn'),

    // Modal
    markerModal: $('#markerModal'),
    modalTargetPointSelect: $('#modalTargetPointSelect'),
    newMarkerLabel: $('#newMarkerLabel'),
    modalAzimuth: $('#modalAzimuth'),
    modalPitch: $('#modalPitch'),
    cancelMarkerBtn: $('#cancelMarkerBtn'),
    confirmMarkerBtn: $('#confirmMarkerBtn'),

    // Tooltip
    infoTooltip: $('#infoTooltip'),

    // Context menu (panorama markers / info points)
    panoContextMenu: $('#panoContextMenu')
};

// ============ State ============
let state = {
    step: 1,
    mode: 'view', // view | add
    plans: [],
    selectedPlanId: null,
    selectedPointId: null,
    selectedMarkerId: null,
    selectedInfoPointId: null,
    loading: false,
    pendingMarker: null // { panoramaId, azimuth, pitch }
};

let panoContextTarget = null; // { kind: 'marker'|'info', id: number }

// ============ Step Hints ============
const STEP_HINTS = {
    1: 'Выберите существующий план из списка или создайте новый, указав этаж, название и загрузив изображение.',
    2: 'Добавляйте переходные точки на план кликом (🚪) — они ведут в панорамы. Информационные точки размещаются внутри панорамы. Точки на плане можно перетаскивать.',
    3: 'Загрузите эквиректангулярную 360° панораму для каждой переходной точки. Панораму можно заменить или удалить. Также здесь можно расставлять метки переходов на панораме.',
    4: 'Создавайте переходы внутри панорамы кликом. Укажите целевую точку и подпись перехода.'
};

// ============ Helpers ============
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

const MARKER_MARGIN_PX = 30;

// FIX: feature-detection для кроссбраузерности (fallback-ветки ниже опираются на это)
const SUPPORTS_POINTER = typeof window !== 'undefined' && 'PointerEvent' in window;

// FIX: placeholder для отсутствующих/битых картинок (план/панорама/превью)
const IMG_PLACEHOLDER = (() => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#161b22"/>
      <stop offset="1" stop-color="#0d1117"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" rx="18" fill="url(#g)"/>
  <rect x="26" y="26" width="748" height="398" rx="14" fill="none" stroke="#30363d" stroke-width="4" stroke-dasharray="10 10"/>
  <g fill="#8b949e" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="24" font-weight="600" text-anchor="middle">
    <text x="400" y="220">Изображение не найдено</text>
    <text x="400" y="255" font-size="16" font-weight="500">Проверьте путь / загрузку файла</text>
  </g>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
})();

// FIX: нормализация URL из DRF (иногда приходит без ведущего '/')
function normalizeImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    const withLeadingSlash = url.startsWith('/') ? url : `/${url}`;
    // encodeURI безопаснее для кириллицы/пробелов в путях (не трогает '/', ':', '?', '=' и т.д.)
    return encodeURI(withLeadingSlash);
}

// FIX: единая безопасная установка src + fallback при ошибке загрузки
function setSafeImage(imgEl, url, { placeholder = IMG_PLACEHOLDER, onOk } = {}) {
    if (!imgEl) return;
    const normalized = normalizeImageUrl(url);
    const ok = () => onOk && onOk();
    imgEl.onerror = () => {
        // Важно: предотвращаем бесконечный цикл onerror
        imgEl.onerror = null;
        imgEl.src = placeholder;
        console.warn('[tour_editor] image failed to load:', url);
    };
    imgEl.onload = () => ok();
    imgEl.src = normalized || placeholder;

    // FIX: если src не меняется (или картинка уже в кеше), onload может не сработать.
    // В этом случае гарантируем вызов onOk, когда изображение уже загружено.
    if (imgEl.complete && imgEl.naturalWidth) {
        // microtask/next tick, чтобы DOM успел применить стили перед расчетами размеров
        Promise.resolve().then(ok);
    }
}

// FIX: простая “проверка” кроссбраузерности/мобильных ограничений (не блокирует работу, но помогает диагностике)
function runCompatibilityChecks() {
    const issues = [];
    if (!('fetch' in window)) issues.push('fetch() не поддерживается');
    if (!SUPPORTS_POINTER) issues.push('Pointer Events не поддерживаются (fallback на mouse/click)');
    if (!('localStorage' in window)) issues.push('localStorage недоступен (состояние шага не сохранится)');
    if (issues.length) {
        console.warn('[tour_editor] compatibility issues:', issues);
    }
}

function getCsrfToken() {
    const cookie = document.cookie.split('; ').find(c => c.startsWith('csrftoken='));
    return cookie ? cookie.split('=')[1] : '';
}

function setStatus(type, text) {
    const icons = { ready: '✓', loading: '⟳', error: '✕', success: '✓' };
    DOM.statusBar.className = `status-bar status-${type}`;
    DOM.statusText.textContent = text;
    DOM.statusIcon.textContent = icons[type] || '•';
}

function flashStatus(type, text, ms = 2200) {
    setStatus(type, text);
    window.clearTimeout(flashStatus._t);
    flashStatus._t = window.setTimeout(() => {
        if (!state.loading) setStatus('ready', 'Готово');
    }, ms);
}

function setLoading(isLoading, msg = 'Загрузка...') {
    state.loading = isLoading;
    setStatus(isLoading ? 'loading' : 'ready', isLoading ? msg : 'Готово');

    // Disable buttons during loading
    [DOM.createPlanBtn, DOM.savePlanBtn, DOM.deletePlanBtn,
     DOM.savePointBtn, DOM.deletePointBtn, DOM.uploadPanoramaBtn,
     DOM.deletePanoramaBtn, DOM.saveMarkerBtn, DOM.deleteMarkerBtn]
        .forEach(btn => btn && (btn.disabled = isLoading));
}

function saveState() {
    const toSave = {
        step: state.step,
        selectedPlanId: state.selectedPlanId,
        selectedPointId: state.selectedPointId,
        selectedMarkerId: state.selectedMarkerId,
        selectedInfoPointId: state.selectedInfoPointId
    };
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.warn('Failed to save state:', e);
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            state.step = parsed.step || 1;
            state.selectedPlanId = parsed.selectedPlanId || null;
            state.selectedPointId = parsed.selectedPointId || null;
            state.selectedMarkerId = parsed.selectedMarkerId || null;
            state.selectedInfoPointId = parsed.selectedInfoPointId || null;
        }
    } catch (e) {
        console.warn('Failed to load state:', e);
    }
}

function getActivePlan() {
    return state.plans.find(p => p.id === state.selectedPlanId) || null;
}

function getSelectedPoint() {
    const plan = getActivePlan();
    if (!plan) return null;
    return (plan.points || []).find(p => p.id === state.selectedPointId) || null;
}

function getSelectedMarker() {
    const point = getSelectedPoint();
    if (!point?.panorama) return null;
    return (point.panorama.markers || []).find(m => m.id === state.selectedMarkerId) || null;
}

function getSelectedInfoPoint() {
    const point = getSelectedPoint();
    if (!point?.panorama) return null;
    return (point.panorama.info_points || []).find(ip => ip.id === state.selectedInfoPointId) || null;
}

function hidePanoContextMenu() {
    const menu = DOM.panoContextMenu;
    if (!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
    panoContextTarget = null;
}

function showPanoContextMenu(clientX, clientY, target) {
    const menu = DOM.panoContextMenu;
    if (!menu) return;
    panoContextTarget = target;

    // measure after unhide
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');

    const pad = 8;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const x = clamp(clientX, pad, Math.max(pad, vw - rect.width - pad));
    const y = clamp(clientY, pad, Math.max(pad, vh - rect.height - pad));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

// ============ API Layer ============
async function fetchJson(url, options = {}) {
    const headers = options.headers || {};
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    headers['X-CSRFToken'] = getCsrfToken();

    const res = await fetch(url, { ...options, headers });

    if (res.status === 204) return null; // No content (DELETE)

    if (!res.ok) {
        const text = await res.text();
        let msg = 'Ошибка запроса';
        try {
            const json = JSON.parse(text);
            msg = json.detail || JSON.stringify(json);
        } catch {
            msg = text || `HTTP ${res.status}`;
        }
        throw new Error(msg);
    }

    return res.json();
}

// Plans
async function loadPlans() {
    setLoading(true, 'Загрузка планов...');
    try {
        state.plans = await fetchJson(API.plans);
        if (state.selectedPlanId && !state.plans.find(p => p.id === state.selectedPlanId)) {
            state.selectedPlanId = null;
            state.selectedPointId = null;
        }
        render();
        setStatus('success', 'Планы загружены');
    } catch (e) {
        setStatus('error', e.message);
        console.error(e);
    } finally {
        setLoading(false);
    }
}

async function loadPlanDetail(planId) {
    setLoading(true, 'Загрузка плана...');
    try {
        const plan = await fetchJson(`${API.plans}${planId}/`);
        state.plans = state.plans.map(p => p.id === planId ? plan : p);
        render();
    } catch (e) {
        setStatus('error', e.message);
        console.error(e);
    } finally {
        setLoading(false);
    }
}

async function createPlan() {
    const floor = parseInt(DOM.planFloor.value, 10);
    const title = DOM.planTitle.value.trim();
    const file = DOM.planImageFile.files[0];

    if (!title) return alert('Введите название плана');
    if (isNaN(floor)) return alert('Введите номер этажа');
    if (!file) return alert('Выберите изображение плана');

    setLoading(true, 'Создание плана...');
    try {
        const form = new FormData();
        form.append('title', title);
        form.append('floor', floor);
        form.append('image', file);

        const plan = await fetchJson(API.plans, { method: 'POST', body: form });

        DOM.planTitle.value = '';
        DOM.planFloor.value = '1';
        DOM.planImageFile.value = '';

        await loadPlans();
        state.selectedPlanId = plan.id;
        state.step = 2;
        saveState();
        await loadPlanDetail(plan.id);
        setStatus('success', 'План создан');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function updatePlan() {
    const plan = getActivePlan();
    if (!plan) return;

    const title = DOM.editPlanTitle.value.trim();
    const floor = parseInt(DOM.editPlanFloor.value, 10);

    if (!title) return alert('Введите название');
    if (isNaN(floor)) return alert('Введите номер этажа');

    setLoading(true, 'Сохранение...');
    try {
        await fetchJson(`${API.plans}${plan.id}/`, {
            method: 'PATCH',
            body: JSON.stringify({ title, floor })
        });
        await loadPlanDetail(plan.id);
        setStatus('success', 'План сохранён');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function deletePlan() {
    const plan = getActivePlan();
    if (!plan) return;
    if (!confirm(`Удалить план "${plan.title}" и все связанные данные?`)) return;

    setLoading(true, 'Удаление...');
    try {
        await fetchJson(`${API.plans}${plan.id}/`, { method: 'DELETE' });
        state.selectedPlanId = null;
        state.selectedPointId = null;
        await loadPlans();
        setStatus('success', 'План удалён');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

// Points
async function createPoint(x, y) {
    const plan = getActivePlan();
    if (!plan) return;

    const type = DOM.newPointType.value;
    const name = `${type === 'info' ? 'Инфо' : 'Точка'} ${(plan.points?.length || 0) + 1}`;

    setLoading(true, 'Создание точки...');
    try {
        const point = await fetchJson(API.points, {
            method: 'POST',
            body: JSON.stringify({
                plan: plan.id,
                name,
                type,
                x: clamp(x, 0, 100),
                y: clamp(y, 0, 100),
                info_text: ''
            })
        });

        await loadPlanDetail(plan.id);
        state.selectedPointId = point.id;
        saveState();
        setStatus('success', 'Точка создана');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function updatePoint(data = {}) {
    const point = getSelectedPoint();
    if (!point) return;

    const updates = {
        name: data.name ?? DOM.editPointName.value.trim(),
        info_text: data.info_text ?? DOM.editInfoText.value
    };

    if (data.x !== undefined) updates.x = clamp(data.x, 0, 100);
    if (data.y !== undefined) updates.y = clamp(data.y, 0, 100);

    setLoading(true, 'Сохранение...');
    try {
        await fetchJson(`${API.points}${point.id}/`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
        await loadPlanDetail(getActivePlan().id);
        setStatus('success', 'Точка сохранена');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function deletePoint() {
    const point = getSelectedPoint();
    if (!point) return;
    if (!confirm(`Удалить точку "${point.name}"?`)) return;

    setLoading(true, 'Удаление...');
    try {
        await fetchJson(`${API.points}${point.id}/`, { method: 'DELETE' });
        state.selectedPointId = null;
        await loadPlanDetail(getActivePlan().id);
        setStatus('success', 'Точка удалена');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

// Panoramas
async function uploadPanorama() {
    const point = getSelectedPoint();
    if (!point) return alert('Выберите точку');
    if (point.type !== 'transition') return alert('Панорамы можно загружать только для переходных точек');

    const file = DOM.panoramaUpload.files[0];
    if (!file) return alert('Выберите файл панорамы');

    setLoading(true, 'Загрузка панорамы...');
    try {
        const form = new FormData();
        form.append('point', point.id);
        form.append('image', file);

        await fetchJson(API.panoramas, { method: 'POST', body: form });

        DOM.panoramaUpload.value = '';
        DOM.uploadPreview.classList.add('hidden');

        await loadPlanDetail(getActivePlan().id);
        setStatus('success', 'Панорама загружена');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function deletePanorama() {
    const point = getSelectedPoint();
    if (!point?.panorama) return;
    if (!confirm('Удалить панораму?')) return;

    setLoading(true, 'Удаление...');
    try {
        await fetchJson(`${API.panoramas}${point.panorama.id}/`, { method: 'DELETE' });
        await loadPlanDetail(getActivePlan().id);
        setStatus('success', 'Панорама удалена');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

// Markers
async function createMarker(panoramaId, targetPointId, azimuth, pitch, label) {
    setLoading(true, 'Создание маркера...');
    try {
        const marker = await fetchJson(API.markers, {
            method: 'POST',
            body: JSON.stringify({
                panorama: panoramaId,
                target_point: targetPointId,
                azimuth: +azimuth.toFixed(2),
                pitch: +pitch.toFixed(2),
                label: label || ''
            })
        });

        await loadPlanDetail(getActivePlan().id);
        state.selectedMarkerId = marker.id;
        setStatus('success', 'Переход создан');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

// Panorama Info Points
async function createPanoramaInfoPoint(panoramaId, azimuth, pitch, { title = '', text = '' } = {}) {
    setLoading(true, 'Создание инфо-точки...');
    try {
        const payload = {
            panorama: panoramaId,
            azimuth: +azimuth.toFixed(2),
            pitch: +pitch.toFixed(2),
            title: (title || '').trim(),
            text: (text || '').trim()
        };
        if (!payload.text) throw new Error('Введите текст инфо-точки');

        const infoPoint = await fetchJson(API.infoPoints, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        await loadPlanDetail(getActivePlan().id);
        state.selectedMarkerId = null;
        // reuse selectedMarkerId only for transition markers; info points are not editable in inspector yet
        setStatus('success', 'Инфо-точка создана');
        return infoPoint;
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
        return null;
    } finally {
        setLoading(false);
    }
}

async function updatePanoramaInfoPointPosition(infoPointId, azimuth, pitch) {
    setLoading(true, 'Сохранение...');
    try {
        await fetchJson(`${API.infoPoints}${infoPointId}/`, {
            method: 'PATCH',
            body: JSON.stringify({ azimuth, pitch })
        });
        await loadPlanDetail(getActivePlan().id);
        setStatus('success', 'Инфо-точка перемещена');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function updateMarker() {
    const marker = getSelectedMarker();
    if (!marker) return;

    setLoading(true, 'Сохранение...');
    try {
        await fetchJson(`${API.markers}${marker.id}/`, {
            method: 'PATCH',
            body: JSON.stringify({
                label: DOM.editMarkerLabel.value,
                target_point: parseInt(DOM.editMarkerTarget.value, 10),
                azimuth: parseFloat(DOM.editMarkerAzimuth.value),
                pitch: parseFloat(DOM.editMarkerPitch.value)
            })
        });
        await loadPlanDetail(getActivePlan().id);
        setStatus('success', 'Маркер сохранён');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function deleteMarker() {
    const marker = getSelectedMarker();
    if (!marker) return;
    await deleteMarkerById(marker.id, { confirmText: 'Удалить переход?' });
}

async function deleteMarkerById(markerId, { confirmText = null } = {}) {
    if (!markerId) return;
    if (confirmText && !confirm(confirmText)) return;

    setLoading(true, 'Удаление...');
    try {
        await fetchJson(`${API.markers}${markerId}/`, { method: 'DELETE' });
        if (state.selectedMarkerId === markerId) state.selectedMarkerId = null;
        await loadPlanDetail(getActivePlan().id);
        setStatus('success', 'Переход удалён');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function deletePanoramaInfoPointById(infoPointId, { confirmText = null } = {}) {
    if (!infoPointId) return;
    if (confirmText && !confirm(confirmText)) return;

    setLoading(true, 'Удаление...');
    try {
        await fetchJson(`${API.infoPoints}${infoPointId}/`, { method: 'DELETE' });
        if (state.selectedInfoPointId === infoPointId) state.selectedInfoPointId = null;
        await loadPlanDetail(getActivePlan().id);
        setStatus('success', 'Инфо-точка удалена');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

function populateTransitionTargets(selectEl, { includeEmpty = true, emptyLabel = 'Выберите точку...' } = {}) {
    if (!selectEl) return;
    const plan = getActivePlan();
    const transitionWithPano = (plan?.points || []).filter(p => p.type === 'transition' && p.panorama);
    selectEl.innerHTML = '';
    if (includeEmpty) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = emptyLabel;
        selectEl.appendChild(opt);
    }
    transitionWithPano.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (id: ${p.id})`;
        selectEl.appendChild(opt);
    });
}

// ============ Rendering ============
function render() {
    renderStepper();
    renderHint();
    renderSidebar();
    renderWorkspace();
    renderInspector();
    saveState();
}

function renderStepper() {
    $$('.step-btn').forEach(btn => {
        const step = parseInt(btn.dataset.step, 10);
        btn.classList.toggle('active', step === state.step);
        btn.classList.toggle('completed', step < state.step);
    });
}

function renderHint() {
    DOM.hintText.textContent = STEP_HINTS[state.step] || '';
}

function renderSidebar() {
    // Show/hide sections based on step
    DOM.plansSection.classList.toggle('hidden', state.step !== 1);
    DOM.pointsSection.classList.toggle('hidden', state.step !== 2);
    DOM.panoramasSection.classList.toggle('hidden', state.step !== 3);
    DOM.transitionsSection.classList.toggle('hidden', state.step !== 4);

    if (state.step === 1) renderPlansList();
    if (state.step === 2) renderPointsList();
    if (state.step === 3) renderPanoramasList();
    if (state.step === 4) renderMarkersList();
}

function renderPlansList() {
    const search = DOM.planSearch.value.toLowerCase();
    const filtered = state.plans.filter(p =>
        p.title.toLowerCase().includes(search) ||
        String(p.floor).includes(search)
    );

    DOM.planList.innerHTML = '';

    if (!filtered.length) {
        DOM.planList.innerHTML = '<div class="hint">Планы не найдены</div>';
        return;
    }

    filtered.forEach(plan => {
        const item = document.createElement('div');
        item.className = `list-item${plan.id === state.selectedPlanId ? ' active' : ''}`;
        item.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">${plan.title}</div>
                <div class="list-item-meta">Этаж ${plan.floor} · ${plan.points_count || 0} точек</div>
            </div>
        `;
        item.addEventListener('click', async () => {
            state.selectedPlanId = plan.id;
            state.selectedPointId = null;
            saveState();
            await loadPlanDetail(plan.id);
        });
        DOM.planList.appendChild(item);
    });
}

function renderPointsList() {
    const plan = getActivePlan();
    const points = plan?.points || [];

    DOM.pointsList.innerHTML = '';

    if (!points.length) {
        DOM.pointsList.innerHTML = '<div class="hint">Точки не добавлены</div>';
        return;
    }

    points.forEach(point => {
        const item = document.createElement('div');
        item.className = `list-item${point.id === state.selectedPointId ? ' active' : ''}`;

        const typeIcon = point.type === 'info' ? 'ℹ️' : '🚪';
        const badge = point.type === 'info'
            ? '<span class="list-item-badge badge-info">info</span>'
            : (point.panorama
                ? '<span class="list-item-badge badge-panorama">360°</span>'
                : '<span class="list-item-badge badge-transition">transition</span>');

        item.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">${typeIcon} ${point.name}</div>
                <div class="list-item-meta">x: ${point.x.toFixed(1)}%, y: ${point.y.toFixed(1)}%</div>
            </div>
            ${badge}
        `;
        item.addEventListener('click', () => {
            state.selectedPointId = point.id;
            state.selectedMarkerId = null;
            saveState();
            render();
        });
        DOM.pointsList.appendChild(item);
    });
}

function renderPanoramasList() {
    const plan = getActivePlan();
    const transitionPoints = (plan?.points || []).filter(p => p.type === 'transition');

    DOM.panoramasList.innerHTML = '';

    if (!transitionPoints.length) {
        DOM.panoramasList.innerHTML = '<div class="hint">Нет переходных точек</div>';
        return;
    }

    transitionPoints.forEach(point => {
        const item = document.createElement('div');
        item.className = `list-item${point.id === state.selectedPointId ? ' active' : ''}`;

        const hasPano = !!point.panorama;
        const badge = hasPano
            ? '<span class="list-item-badge badge-panorama">✓ 360°</span>'
            : '<span class="list-item-badge badge-transition">⚠ нет</span>';

        item.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">${point.name}</div>
                <div class="list-item-meta">${hasPano ? 'Панорама загружена' : 'Панорама не загружена'}</div>
            </div>
            ${badge}
        `;
        item.addEventListener('click', () => {
            state.selectedPointId = point.id;
            saveState();
            render();
        });
        DOM.panoramasList.appendChild(item);
    });
}

function renderMarkersList() {
    const point = getSelectedPoint();
    const markers = point?.panorama?.markers || [];

    DOM.markersList.innerHTML = '';

    // Update target select
    populateTransitionTargets(DOM.targetPointSelect);

    if (!point?.panorama) {
        DOM.markersList.innerHTML = '<div class="hint">Выберите точку с панорамой</div>';
        return;
    }

    if (!markers.length) {
        DOM.markersList.innerHTML = '<div class="hint">Переходы не добавлены</div>';
        return;
    }

    markers.forEach(marker => {
        const item = document.createElement('div');
        item.className = `list-item${marker.id === state.selectedMarkerId ? ' active' : ''}`;
        item.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">→ ${marker.target_point_name || marker.target_point}</div>
                <div class="list-item-meta">${marker.label || '(без подписи)'} · az: ${marker.azimuth}° · p: ${marker.pitch}°</div>
            </div>
        `;
        item.addEventListener('click', () => {
            state.selectedMarkerId = marker.id;
            render();
        });
        DOM.markersList.appendChild(item);
    });
}

function renderWorkspace() {
    // Show/hide canvases based on step
    const selectedPoint = getSelectedPoint();
    const showPanorama = (state.step === 3 || state.step === 4) && selectedPoint && selectedPoint.type === 'transition';
    DOM.planCanvas.classList.toggle('hidden', showPanorama);
    DOM.panoramaCanvas.classList.toggle('hidden', !showPanorama);

    if (showPanorama) {
        renderPanoramaViewer();
    } else {
        renderPlanCanvas();
    }
}

function centerPanoramaInView() {
    // Центрируем изображение по горизонтали внутри скролл-контейнера,
    // чтобы пользователь сразу видел “центр” панорамы.
    if (!DOM.panoramaWrapper || !DOM.panoramaInner) return;
    const maxScroll = DOM.panoramaWrapper.scrollWidth - DOM.panoramaWrapper.clientWidth;
    if (maxScroll <= 0) return;
    DOM.panoramaWrapper.scrollLeft = maxScroll / 2;
}

function renderPlanCanvas() {
    const plan = getActivePlan();

    if (!plan) {
        DOM.canvasPlaceholder.classList.remove('hidden');
        DOM.planWrapper.classList.add('hidden');
        return;
    }

    DOM.canvasPlaceholder.classList.add('hidden');
    DOM.planWrapper.classList.remove('hidden');
    // FIX: безопасная загрузка изображения плана + placeholder при ошибке/битом пути
    setSafeImage(DOM.planImg, plan.image);

    renderPointsOnPlan();
}

function renderPointsOnPlan() {
    DOM.pointsLayer.innerHTML = '';

    const plan = getActivePlan();
    if (!plan) return;

    (plan.points || []).forEach(point => {
        const el = document.createElement('div');
        el.className = `map-point${point.id === state.selectedPointId ? ' selected' : ''}`;
        el.dataset.pointId = point.id;
        el.style.left = `${point.x}%`;
        el.style.top = `${point.y}%`;

        const isInfo = point.type === 'info';
        const hasPano = !!point.panorama;

        let markerClass = isInfo ? 'info' : 'transition';
        if (!isInfo && hasPano) markerClass += ' has-panorama';

        el.innerHTML = `
            <div class="point-marker ${markerClass}">
                ${isInfo ? 'ℹ' : (hasPano ? '◎' : '•')}
            </div>
            <div class="point-label">${point.name}</div>
            <div class="point-coords">x: ${point.x.toFixed(1)}% y: ${point.y.toFixed(1)}%</div>
        `;

        // Click to select
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            state.selectedPointId = point.id;
            state.selectedMarkerId = null;
            state.selectedInfoPointId = null;
            saveState();
            render();
        });

        // Drag handling
        setupPointDrag(el, point);

        // Info tooltip
        if (isInfo && point.info_text) {
            el.addEventListener('mouseenter', (e) => showInfoTooltip(e, point.info_text));
            el.addEventListener('mouseleave', hideInfoTooltip);
            el.addEventListener('mousemove', moveInfoTooltip);
        }

        DOM.pointsLayer.appendChild(el);
    });
}

function setupPointDrag(el, point) {
    let isDragging = false;
    let startX, startY;

    el.addEventListener('pointerdown', (e) => {
        if (state.mode === 'add') return;
        e.preventDefault();
        isDragging = true;
        el.classList.add('dragging');
        el.setPointerCapture(e.pointerId);

        const rect = DOM.planImg.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
    });

    el.addEventListener('pointermove', (e) => {
        if (!isDragging) return;

        const rect = DOM.planImg.getBoundingClientRect();
        const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
        const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);

        el.style.left = `${x}%`;
        el.style.top = `${y}%`;

        // Update coords display
        const coordsEl = el.querySelector('.point-coords');
        if (coordsEl) {
            coordsEl.textContent = `x: ${x.toFixed(1)}% y: ${y.toFixed(1)}%`;
        }
    });

    el.addEventListener('pointerup', async (e) => {
        if (!isDragging) return;
        isDragging = false;
        el.classList.remove('dragging');
        el.releasePointerCapture(e.pointerId);

        // Calculate final position
        const rect = DOM.planImg.getBoundingClientRect();
        const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
        const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);

        // Check if actually moved
        const moved = Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3;

        if (moved) {
            // Save new position
            state.selectedPointId = point.id;
            await updatePoint({ x, y });
        }
    });
}

function renderPanoramaViewer() {
    const point = getSelectedPoint();

    const placeholderTextEl = DOM.panoramaPlaceholder?.querySelector('.placeholder-text');
    if (!point) {
        if (placeholderTextEl) placeholderTextEl.textContent = 'Выберите переходную точку';
        DOM.panoramaPlaceholder.classList.remove('hidden');
        DOM.panoramaWrapper.classList.add('hidden');
        return;
    }

    if (!point.panorama) {
        if (placeholderTextEl) {
            placeholderTextEl.textContent = state.step === 3
                ? 'Панорама не загружена — загрузите её справа'
                : 'У точки нет панорамы — загрузите её на шаге “Панорамы”';
        }
        DOM.panoramaPlaceholder.classList.remove('hidden');
        DOM.panoramaWrapper.classList.add('hidden');
        return;
    }

    DOM.panoramaPlaceholder.classList.add('hidden');
    DOM.panoramaWrapper.classList.remove('hidden');
    // FIX: безопасная загрузка панорамы + placeholder при ошибке/битом пути
    setSafeImage(DOM.panoramaImage, point.panorama.image, {
        onOk: () => {
            centerPanoramaInView();
            renderMarkersOnPanorama();
            renderInfoPointsOnPanorama();
        }
    });

    // NOTE: рендер маркеров вызовется из onOk выше, когда изображение точно загрузится
    // Дополнительно: если изображение уже было загружено ранее (кеш/тот же src),
    // сразу попробуем отрисовать маркеры на следующем кадре.
    requestAnimationFrame(() => {
        if (DOM.panoramaImage?.complete && DOM.panoramaImage?.naturalWidth) {
            centerPanoramaInView();
            renderMarkersOnPanorama();
            renderInfoPointsOnPanorama();
        }
    });
}

function renderMarkersOnPanorama() {
    DOM.markersLayer.innerHTML = '';

    const point = getSelectedPoint();
    if (!point?.panorama) return;

    const markers = point.panorama.markers || [];
    // FIX: позиционируем маркеры в координатах ОТОБРАЖАЕМОГО изображения, а не naturalWidth.
    // Это критично для кроссбраузерности и корректной математики при масштабировании.
    const rect = DOM.panoramaImage.getBoundingClientRect();
    const imgWidth = rect.width;
    const imgHeight = rect.height;

    markers.forEach(marker => {
        const el = document.createElement('div');
        el.className = `pano-marker${marker.id === state.selectedMarkerId ? ' selected' : ''}`;
        el.dataset.markerId = marker.id;

        // Calculate position from azimuth/pitch
        const xPx = (marker.azimuth / 360) * imgWidth;
        const yFrac = 0.5 - (marker.pitch / 180);
        const yPx = clamp(yFrac * imgHeight, MARKER_MARGIN_PX, imgHeight - MARKER_MARGIN_PX);

        el.style.left = `${xPx}px`;
        el.style.top = `${yPx}px`;

        el.innerHTML = `
            <div class="marker-icon">→</div>
            <div class="marker-label">${marker.label || marker.target_point_name || 'Переход'}</div>
        `;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el.dataset.dragMoved === '1') {
                // click after drag — ignore
                el.dataset.dragMoved = '0';
                return;
            }
            // Like points-on-plan: click selects marker for editing.
            // If marker is already selected — treat as quick delete (with confirm).
            if (state.selectedMarkerId === marker.id) {
                deleteMarkerById(marker.id, { confirmText: 'Удалить метку перехода?' });
                return;
            }
            state.selectedMarkerId = marker.id;
            state.selectedInfoPointId = null;
            render();
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.selectedMarkerId = marker.id;
            state.selectedInfoPointId = null;
            renderInspector();
            showPanoContextMenu(e.clientX, e.clientY, { kind: 'marker', id: marker.id });
        });

        // Double click in view mode: quick navigation to target panorama (optional convenience)
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (state.mode !== 'view') return;
            const targetPoint = (getActivePlan()?.points || []).find(p => p.id === marker.target_point);
            if (targetPoint?.panorama) {
                state.selectedPointId = targetPoint.id;
                state.selectedMarkerId = null;
                state.selectedInfoPointId = null;
                saveState();
                render();
            }
        });

        setupMarkerDrag(el, marker);
        DOM.markersLayer.appendChild(el);
    });
}

function renderInfoPointsOnPanorama() {
    // render into the same layer; markers layer has pointer-events: none, individual items enable pointer-events
    const point = getSelectedPoint();
    if (!point?.panorama) return;

    const rect = DOM.panoramaImage.getBoundingClientRect();
    const imgWidth = rect.width;
    const imgHeight = rect.height;
    if (!imgWidth || !imgHeight) return;

    (point.panorama.info_points || []).forEach(ip => {
        const el = document.createElement('div');
        el.className = `pano-marker pano-info${ip.id === state.selectedInfoPointId ? ' selected' : ''}`;
        el.dataset.infoPointId = ip.id;

        const xPx = (ip.azimuth / 360) * imgWidth;
        const yFrac = 0.5 - (ip.pitch / 180);
        const yPx = clamp(yFrac * imgHeight, MARKER_MARGIN_PX, imgHeight - MARKER_MARGIN_PX);

        el.style.left = `${xPx}px`;
        el.style.top = `${yPx}px`;

        const label = (ip.title || '').trim();
        el.innerHTML = `
            <div class="marker-icon">ℹ</div>
            ${label ? `<div class="marker-label">${label}</div>` : ''}
        `;

        // Tooltip with full text
        if (ip.text) {
            el.addEventListener('mouseenter', (e) => showInfoTooltip(e, ip.text));
            el.addEventListener('mouseleave', hideInfoTooltip);
            el.addEventListener('mousemove', moveInfoTooltip);
        }

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el.dataset.dragMoved === '1') {
                el.dataset.dragMoved = '0';
                return;
            }
            // If already selected — quick delete (with confirm).
            if (state.selectedInfoPointId === ip.id) {
                deletePanoramaInfoPointById(ip.id, { confirmText: 'Удалить инфо-точку?' });
                return;
            }
            state.selectedInfoPointId = ip.id;
            state.selectedMarkerId = null;
            render();
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.selectedInfoPointId = ip.id;
            state.selectedMarkerId = null;
            showPanoContextMenu(e.clientX, e.clientY, { kind: 'info', id: ip.id });
        });

        // Drag (same clamp rules as transitions)
        setupInfoPointDrag(el, ip);

        DOM.markersLayer.appendChild(el);
    });
}

function setupInfoPointDrag(el, infoPoint) {
    if (!el || !infoPoint) return;
    if (SUPPORTS_POINTER) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        el.addEventListener('pointerdown', (e) => {
            if (state.mode === 'add') return;
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            el.classList.add('dragging');
            el.setPointerCapture?.(e.pointerId);
            state.selectedInfoPointId = infoPoint.id;
            state.selectedMarkerId = null;
        });

        el.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const pos = clientToAzimuthPitch(e.clientX, e.clientY);
            if (!pos) return;
            el.dataset.dragMoved = '1';
            el.style.left = `${pos.xPx}px`;
            el.style.top = `${pos.yPx}px`;
            e.preventDefault();
        }, { passive: false });

        el.addEventListener('pointerup', async (e) => {
            if (!isDragging) return;
            isDragging = false;
            el.classList.remove('dragging');
            el.releasePointerCapture?.(e.pointerId);
            const moved = Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3;
            if (!moved) return;
            const pos = clientToAzimuthPitch(e.clientX, e.clientY);
            if (!pos) return;
            await updatePanoramaInfoPointPosition(infoPoint.id, pos.azimuth, pos.pitch);
        });
    } else {
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        el.addEventListener('mousedown', (e) => {
            if (state.mode === 'add') return;
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            el.classList.add('dragging');
            state.selectedInfoPointId = infoPoint.id;
            state.selectedMarkerId = null;
        });

        const onMove = (e) => {
            if (!isDragging) return;
            const pos = clientToAzimuthPitch(e.clientX, e.clientY);
            if (!pos) return;
            el.dataset.dragMoved = '1';
            el.style.left = `${pos.xPx}px`;
            el.style.top = `${pos.yPx}px`;
        };

        const onUp = async (e) => {
            if (!isDragging) return;
            isDragging = false;
            el.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const moved = Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3;
            if (!moved) return;
            const pos = clientToAzimuthPitch(e.clientX, e.clientY);
            if (!pos) return;
            await updatePanoramaInfoPointPosition(infoPoint.id, pos.azimuth, pos.pitch);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
}

function clientToAzimuthPitch(clientX, clientY) {
    const rect = DOM.panoramaImage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const xPx = clamp(clientX - rect.left, 0, rect.width);
    const yPx = clamp(clientY - rect.top, MARKER_MARGIN_PX, rect.height - MARKER_MARGIN_PX);
    const xFrac = clamp(xPx / rect.width, 0, 1);
    const yFrac = clamp(yPx / rect.height, 0, 1);
    const azimuth = +(xFrac * 360).toFixed(2);
    const pitch = +((0.5 - yFrac) * 180).toFixed(2);
    return { azimuth, pitch, xPx, yPx };
}

async function updateMarkerPosition(markerId, azimuth, pitch) {
    setLoading(true, 'Сохранение...');
    try {
        await fetchJson(`${API.markers}${markerId}/`, {
            method: 'PATCH',
            body: JSON.stringify({ azimuth, pitch })
        });
        await loadPlanDetail(getActivePlan().id);
        setStatus('success', 'Маркер перемещён');
    } catch (e) {
        setStatus('error', e.message);
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

function setupMarkerDrag(el, marker) {
    // Dragging is only available in "view" mode (similar to plan points)
    if (!el || !marker) return;

    if (SUPPORTS_POINTER) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        el.addEventListener('pointerdown', (e) => {
            if (state.mode === 'add') return;
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            el.classList.add('dragging');
            el.setPointerCapture?.(e.pointerId);
            state.selectedMarkerId = marker.id;
            state.selectedInfoPointId = null;
            // Avoid full re-render here: it would recreate DOM and break ongoing drag
            renderInspector();
        });

        el.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const pos = clientToAzimuthPitch(e.clientX, e.clientY);
            if (!pos) return;
            el.dataset.dragMoved = '1';
            el.style.left = `${pos.xPx}px`;
            el.style.top = `${pos.yPx}px`;
            if (DOM.editMarkerAzimuth) DOM.editMarkerAzimuth.value = pos.azimuth;
            if (DOM.editMarkerPitch) DOM.editMarkerPitch.value = pos.pitch;
            e.preventDefault();
        }, { passive: false });

        el.addEventListener('pointerup', async (e) => {
            if (!isDragging) return;
            isDragging = false;
            el.classList.remove('dragging');
            el.releasePointerCapture?.(e.pointerId);
            const moved = Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3;
            if (!moved) return;
            const pos = clientToAzimuthPitch(e.clientX, e.clientY);
            if (!pos) return;
            await updateMarkerPosition(marker.id, pos.azimuth, pos.pitch);
        });
    } else {
        // Fallback: mouse drag
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        el.addEventListener('mousedown', (e) => {
            if (state.mode === 'add') return;
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            el.classList.add('dragging');
            state.selectedMarkerId = marker.id;
            state.selectedInfoPointId = null;
            renderInspector();
        });

        const onMove = (e) => {
            if (!isDragging) return;
            const pos = clientToAzimuthPitch(e.clientX, e.clientY);
            if (!pos) return;
            el.dataset.dragMoved = '1';
            el.style.left = `${pos.xPx}px`;
            el.style.top = `${pos.yPx}px`;
            if (DOM.editMarkerAzimuth) DOM.editMarkerAzimuth.value = pos.azimuth;
            if (DOM.editMarkerPitch) DOM.editMarkerPitch.value = pos.pitch;
        };

        const onUp = async (e) => {
            if (!isDragging) return;
            isDragging = false;
            el.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const moved = Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3;
            if (!moved) return;
            const pos = clientToAzimuthPitch(e.clientX, e.clientY);
            if (!pos) return;
            await updateMarkerPosition(marker.id, pos.azimuth, pos.pitch);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
}

function renderInspector() {
    const plan = getActivePlan();
    const point = getSelectedPoint();
    const marker = getSelectedMarker();

    // Show/hide inspector sections
    DOM.planInspector.classList.toggle('hidden', !plan || state.step > 1);
    DOM.pointInspector.classList.toggle('hidden', !point || state.step === 1);
    DOM.panoramaInspector.classList.toggle('hidden', !point || point.type !== 'transition' || state.step < 3);
    DOM.markerInspector.classList.toggle('hidden', !marker || (state.step !== 3 && state.step !== 4));

    // Plan inspector
    if (plan && state.step === 1) {
        DOM.editPlanTitle.value = plan.title;
        DOM.editPlanFloor.value = plan.floor;
    }

    // Point inspector
    if (point && state.step > 1) {
        DOM.editPointName.value = point.name;
        DOM.editPointType.value = point.type === 'info' ? 'Информационная' : 'Переходная';
        DOM.editPointX.value = point.x.toFixed(2);
        DOM.editPointY.value = point.y.toFixed(2);
        DOM.editInfoText.value = point.info_text || '';
        DOM.infoTextField.classList.toggle('hidden', point.type !== 'info');
    }

    // Panorama inspector
    if (point?.type === 'transition' && state.step >= 3) {
        if (point.panorama) {
            // FIX: безопасный превью-рендер с placeholder, чтобы “битые” картинки не ломали UI
            DOM.panoramaPreview.innerHTML = '';
            const img = document.createElement('img');
            img.alt = 'Панорама';
            DOM.panoramaPreview.appendChild(img);
            setSafeImage(img, point.panorama.image);
            DOM.deletePanoramaBtn.disabled = false;
        } else {
            DOM.panoramaPreview.innerHTML = '<div class="preview-placeholder">Нет панорамы</div>';
            DOM.deletePanoramaBtn.disabled = true;
        }
    }

    // Marker inspector
    if (marker && (state.step === 3 || state.step === 4)) {
        DOM.editMarkerLabel.value = marker.label || '';
        DOM.editMarkerAzimuth.value = marker.azimuth;
        DOM.editMarkerPitch.value = marker.pitch;

        // Populate target select
        populateTransitionTargets(DOM.editMarkerTarget, { includeEmpty: false });
        // ensure selected
        Array.from(DOM.editMarkerTarget.options).forEach(opt => {
            opt.selected = parseInt(opt.value, 10) === marker.target_point;
        });
    }
}

// ============ Info Tooltip ============
function showInfoTooltip(e, text) {
    DOM.infoTooltip.textContent = text;
    DOM.infoTooltip.classList.remove('hidden');
    moveInfoTooltip(e);
}

function moveInfoTooltip(e) {
    DOM.infoTooltip.style.left = `${e.clientX + 15}px`;
    DOM.infoTooltip.style.top = `${e.clientY + 15}px`;
}

function hideInfoTooltip() {
    DOM.infoTooltip.classList.add('hidden');
}

// ============ Modal ============
function showMarkerModal(panoramaId, azimuth, pitch) {
    state.pendingMarker = { panoramaId, azimuth, pitch };
    DOM.modalAzimuth.textContent = azimuth.toFixed(2);
    DOM.modalPitch.textContent = pitch.toFixed(2);
    DOM.newMarkerLabel.value = '';
    populateTransitionTargets(DOM.modalTargetPointSelect);
    // helpful default: copy from sidebar select if set
    if (DOM.targetPointSelect?.value) {
        DOM.modalTargetPointSelect.value = DOM.targetPointSelect.value;
    }
    DOM.markerModal.classList.remove('hidden');
    DOM.newMarkerLabel.focus();
}

function hideMarkerModal() {
    state.pendingMarker = null;
    DOM.markerModal.classList.add('hidden');
}

async function confirmMarkerCreation() {
    if (!state.pendingMarker) return;

    const targetSource = DOM.modalTargetPointSelect || DOM.targetPointSelect;
    const targetId = parseInt(targetSource?.value, 10);
    if (!targetId) {
        alert('Выберите целевую точку');
        return;
    }

    const { panoramaId, azimuth, pitch } = state.pendingMarker;
    const label = DOM.newMarkerLabel.value.trim();

    hideMarkerModal();
    await createMarker(panoramaId, targetId, azimuth, pitch, label);
}

// ============ Event Handlers ============
function setupEventListeners() {
    // Stepper
    $$('.step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.step = parseInt(btn.dataset.step, 10);
            state.mode = 'view';
            saveState();
            render();
        });
    });

    // Plans
    DOM.planSearch.addEventListener('input', renderPlansList);
    DOM.refreshPlansBtn.addEventListener('click', loadPlans);
    DOM.createPlanBtn.addEventListener('click', createPlan);
    DOM.savePlanBtn.addEventListener('click', updatePlan);
    DOM.deletePlanBtn.addEventListener('click', deletePlan);

    // Points
    DOM.savePointBtn.addEventListener('click', () => updatePoint());
    DOM.deletePointBtn.addEventListener('click', deletePoint);

    // Mode buttons (points)
    DOM.pointsSection.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.mode = btn.dataset.mode;
            DOM.pointsSection.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
            DOM.addPointPanel.classList.toggle('hidden', state.mode !== 'add');
        });
    });

    // Mode buttons (panoramas) — marker placement is available here too
    DOM.panoramasSection.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.mode = btn.dataset.mode;
            DOM.panoramasSection.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
            DOM.addPanoramaMarkerPanel?.classList.toggle('hidden', state.mode !== 'add');
        });
    });

    // Mode buttons (transitions)
    DOM.transitionsSection.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.mode = btn.dataset.mode;
            DOM.transitionsSection.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
            DOM.addTransitionPanel.classList.toggle('hidden', state.mode !== 'add');
        });
    });

    // FIX: добавление точек на план (pointer на современных, click — fallback)
    const handleAddPoint = (e) => {
        if (state.mode !== 'add' || state.step !== 2) return;
        if (e.target.closest('.map-point')) return;

        if (DOM.newPointType?.value === 'info') {
            flashStatus('error', 'Инфо-точки размещаются внутри панорамы (шаг “Панорамы”), а не на плане');
            return;
        }

        const rect = DOM.planImg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
        const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
        createPoint(x, y);
    };

    if (SUPPORTS_POINTER) {
        DOM.planInner.addEventListener('pointerup', (e) => {
            handleAddPoint(e);
            e.preventDefault();
        }, { passive: false });
    } else {
        DOM.planInner.addEventListener('click', handleAddPoint);
    }

    // Panoramas
    DOM.panoramaUpload.addEventListener('change', () => {
        const file = DOM.panoramaUpload.files[0];
        if (file) {
            DOM.previewImage.src = URL.createObjectURL(file);
            DOM.uploadPreview.classList.remove('hidden');
        } else {
            DOM.uploadPreview.classList.add('hidden');
        }
    });
    DOM.uploadPanoramaBtn.addEventListener('click', uploadPanorama);
    DOM.deletePanoramaBtn.addEventListener('click', deletePanorama);

    // FIX: добавление маркера + “перетаскивание” панорамы (pointer на современных, mouse/click — fallback)
    if (SUPPORTS_POINTER) {
        let isPanning = false;
        let panStartX = 0;
        let scrollStart = 0;
        let moved = false;

        DOM.panoramaWrapper.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.pano-marker')) return;
            isPanning = true;
            moved = false;
            panStartX = e.clientX;
            scrollStart = DOM.panoramaWrapper.scrollLeft;
            DOM.panoramaWrapper.style.cursor = 'grabbing';
            DOM.panoramaWrapper.setPointerCapture?.(e.pointerId);
            // предотвращаем прокрутку страницы на touch-устройствах при горизонтальном “перетаскивании”
            e.preventDefault();
        }, { passive: false });

        DOM.panoramaWrapper.addEventListener('pointermove', (e) => {
            if (!isPanning) return;
            const dx = panStartX - e.clientX;
            if (Math.abs(dx) > 3) moved = true;
            DOM.panoramaWrapper.scrollLeft = scrollStart + dx;
            e.preventDefault();
        }, { passive: false });

        DOM.panoramaWrapper.addEventListener('pointerup', (e) => {
            if (!isPanning) return;
            isPanning = false;
            DOM.panoramaWrapper.style.cursor = 'grab';
            DOM.panoramaWrapper.releasePointerCapture?.(e.pointerId);

            // Tap (без сдвига) в режиме add — создаём элемент в панораме
            if (!moved && state.mode === 'add' && (state.step === 3 || state.step === 4) && !e.target.closest('.pano-marker')) {
                const point = getSelectedPoint();
                if (!point) return;
                if (!point.panorama) return alert('Сначала загрузите панораму');

                const rect = DOM.panoramaImage.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const xPx = e.clientX - rect.left;
                const yPx = e.clientY - rect.top;
                if (xPx < 0 || yPx < 0 || xPx > rect.width || yPx > rect.height) {
                    flashStatus('error', 'Элемент можно разместить только внутри изображения панорамы');
                    return;
                }

                const xFrac = clamp(xPx / rect.width, 0, 1);
                const yFrac = clamp(clamp(yPx, MARKER_MARGIN_PX, rect.height - MARKER_MARGIN_PX) / rect.height, 0, 1);
                const azimuth = +(xFrac * 360).toFixed(2);
                const pitch = +((0.5 - yFrac) * 180).toFixed(2);

                const addType = DOM.panoramaAddType?.value || 'transition';
                if (addType === 'info') {
                    const text = window.prompt('Текст инфо-точки:');
                    if (!text) return;
                    const title = window.prompt('Заголовок (необязательно):') || '';
                    createPanoramaInfoPoint(point.panorama.id, azimuth, pitch, { title, text });
                } else {
                    showMarkerModal(point.panorama.id, azimuth, pitch);
                }
            }
        });

        DOM.panoramaWrapper.addEventListener('pointercancel', () => {
            isPanning = false;
            DOM.panoramaWrapper.style.cursor = 'grab';
        });
    } else {
        // Fallback: mouse drag scroll
        let isPanning = false;
        let panStartX = 0;
        let scrollStart = 0;

        DOM.panoramaWrapper.addEventListener('mousedown', (e) => {
            if (e.target.closest('.pano-marker')) return;
            isPanning = true;
            panStartX = e.clientX;
            scrollStart = DOM.panoramaWrapper.scrollLeft;
            DOM.panoramaWrapper.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            const dx = panStartX - e.clientX;
            DOM.panoramaWrapper.scrollLeft = scrollStart + dx;
        });

        document.addEventListener('mouseup', () => {
            isPanning = false;
            DOM.panoramaWrapper.style.cursor = 'grab';
        });

        // Fallback: click-to-add element
        DOM.panoramaWrapper.addEventListener('click', (e) => {
            if (state.mode !== 'add' || (state.step !== 3 && state.step !== 4)) return;
            if (e.target.closest('.pano-marker')) return;

            const point = getSelectedPoint();
            if (!point) return;
            if (!point.panorama) return alert('Сначала загрузите панораму');

            const rect = DOM.panoramaImage.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const xPx = e.clientX - rect.left;
            const yPx = e.clientY - rect.top;
            if (xPx < 0 || yPx < 0 || xPx > rect.width || yPx > rect.height) {
                flashStatus('error', 'Элемент можно разместить только внутри изображения панорамы');
                return;
            }

            const xFrac = clamp(xPx / rect.width, 0, 1);
            const yFrac = clamp(clamp(yPx, MARKER_MARGIN_PX, rect.height - MARKER_MARGIN_PX) / rect.height, 0, 1);
            const azimuth = +(xFrac * 360).toFixed(2);
            const pitch = +((0.5 - yFrac) * 180).toFixed(2);
            const addType = DOM.panoramaAddType?.value || 'transition';
            if (addType === 'info') {
                const text = window.prompt('Текст инфо-точки:');
                if (!text) return;
                const title = window.prompt('Заголовок (необязательно):') || '';
                createPanoramaInfoPoint(point.panorama.id, azimuth, pitch, { title, text });
            } else {
                showMarkerModal(point.panorama.id, azimuth, pitch);
            }
        });
    }

    // Markers
    DOM.saveMarkerBtn.addEventListener('click', updateMarker);
    DOM.deleteMarkerBtn.addEventListener('click', deleteMarker);

    // Modal
    DOM.cancelMarkerBtn.addEventListener('click', hideMarkerModal);
    DOM.confirmMarkerBtn.addEventListener('click', confirmMarkerCreation);
    DOM.markerModal.querySelector('.modal-backdrop').addEventListener('click', hideMarkerModal);

    // Enter key in modal
    DOM.newMarkerLabel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmMarkerCreation();
    });

    // Panorama context menu
    if (DOM.panoContextMenu) {
        DOM.panoContextMenu.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const target = panoContextTarget;
            hidePanoContextMenu();

            if (action === 'delete' && target) {
                if (target.kind === 'marker') {
                    await deleteMarkerById(target.id, { confirmText: 'Удалить метку?' });
                } else if (target.kind === 'info') {
                    await deletePanoramaInfoPointById(target.id, { confirmText: 'Удалить инфо-точку?' });
                }
            }
        });
    }

    // Hide context menu on outside click / escape / resize
    document.addEventListener('click', () => hidePanoContextMenu());
    window.addEventListener('resize', () => hidePanoContextMenu());
    window.addEventListener('scroll', () => hidePanoContextMenu(), true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hidePanoContextMenu();
    });
}

// ============ Init ============
async function init() {
    runCompatibilityChecks(); // FIX: диагностическая проверка кроссбраузерности/мобильных ограничений
    loadState();
    setupEventListeners();
    render();
    await loadPlans();

    if (state.selectedPlanId) {
        try {
            await loadPlanDetail(state.selectedPlanId);
        } catch (e) {
            console.error('Failed to load selected plan:', e);
        }
    }

    setStatus('ready', 'Готово');
}

// Start
init();

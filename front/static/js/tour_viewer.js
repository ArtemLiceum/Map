(function () {
  const PLAN_ID = window.TOUR_PLAN_ID;
  const IS_AUTH = !!window.IS_AUTH;
  const IS_STAFF = !!window.IS_STAFF;
  if (!PLAN_ID) return;

  const panoramaEl = document.getElementById('tvPanoramaImage');
  const markersLayer = document.getElementById('tvNavMarkers');
  const fadeEl = document.getElementById('tvFade');
  const loaderEl = document.getElementById('tvLoader');
  const minimapEl = document.getElementById('tvMinimap');
  const minimapImgEl = document.getElementById('tvMinimapImage');
  const minimapPointsEl = document.getElementById('tvMinimapPoints');
  const minimapToggleEl = document.getElementById('tvMinimapToggle');
  const minimapZoomOutEl = document.getElementById('tvMinimapZoomOut');
  const minimapZoomInEl = document.getElementById('tvMinimapZoomIn');
  const panoramaContainer = document.getElementById('tvPanorama');
  const infoOverlay = document.getElementById('tvInfoOverlay');
  const infoOverlayTitle = document.getElementById('tvInfoTitle');
  const infoOverlayText = document.getElementById('tvInfoText');
  const infoOverlayClose = document.getElementById('tvInfoClose');
  const tourSelect = document.getElementById('tvTourSelect');
  const tourProgressWrap = document.getElementById('tvTourProgress');
  const tourProgressTitle = document.getElementById('tvTourProgressTitle');
  const tourProgressText = document.getElementById('tvTourProgressText');
  const tourProgressBarFill = document.getElementById('tvTourProgressBarFill');

  const DRAG_THRESHOLD = 5; // px — minimal movement to consider it a drag
  const MINIMAP_MAX_DEFAULT = 440;
  const MINIMAP_MAX_MOBILE = 360;
  const MINIMAP_ZOOM_LEVELS = [1, 1.5, 2];

  const state = {
    plan: null,
    points: [],
    activePointId: null,
    panoWidth: 0,
    panoHeight: 0,
    tileWidth: 0,
    panoUrl: '',
    offsetPx: 0,
    velocity: 0,
    isDragging: false,
    dragStartX: 0,      // pointer position at drag start
    dragStartY: 0,
    hasMoved: false,    // true if pointer moved beyond threshold
    lastX: 0,
    lastT: 0,
    rafPending: false,
    inertiaHandle: null,
    markers: [],
    viewportW: window.innerWidth,
    tours: [],
    selectedTourId: null,
    minimapCollapsed: false,
    minimapZoom: 1
  };

  function setLoader(text, visible = true) {
    if (!loaderEl) return;
    loaderEl.textContent = text;
    loaderEl.classList.toggle('visible', visible);
  }

  function toggleFade(on) {
    fadeEl && fadeEl.classList.toggle('active', !!on);
  }

  async function fetchPlan(planId, tourId = null) {
    setLoader('Загрузка тура...', true);
    const url = tourId
      ? `/api/evac_plans/${planId}/?tour=${tourId}`
      : `/api/evac_plans/${planId}/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Не удалось загрузить тур');
    const plan = await res.json();
    state.plan = plan;
    state.points = Array.isArray(plan.points) ? plan.points : [];
    state.activePointId = pickInitialPointId(state.points);
    renderMinimap();
    if (state.activePointId) {
      await loadScene(state.activePointId);
    } else {
      setLoader('Нет точек с панорамами', true);
    }
    setLoader('', false);
  }

  async function loadTours() {
    if (!IS_AUTH || !tourSelect) return;
    try {
      const res = await fetch(`/api/tours/?plan=${PLAN_ID}`);
      if (!res.ok) throw new Error('Не удалось загрузить туры');
      const list = await res.json();
      state.tours = Array.isArray(list) ? list : [];
      if (!state.selectedTourId && state.tours.length) {
        const firstActive = state.tours.find(t => t.is_active) || state.tours[0];
        state.selectedTourId = firstActive?.id ?? null;
      }
      renderTourSelect();
    } catch (err) {
      console.warn(err);
      state.tours = [];
      renderTourSelect();
    }
  }

  function renderTourSelect() {
    if (!tourSelect) return;
    tourSelect.innerHTML = '';
    if (!state.tours.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Туры не найдены';
      opt.value = '';
      tourSelect.appendChild(opt);
      tourSelect.disabled = true;
      return;
    }
    tourSelect.disabled = false;
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'Без тура';
    tourSelect.appendChild(emptyOpt);
    state.tours.forEach(t => {
      const opt = document.createElement('option');
      opt.value = String(t.id);
      const percent = Number.isFinite(Number(t.progress_percent)) ? Number(t.progress_percent) : 0;
      opt.textContent = `${t.title} — ${percent}%${t.is_active ? '' : ' (неактивен)'}`;
      tourSelect.appendChild(opt);
    });
    tourSelect.value = state.selectedTourId ? String(state.selectedTourId) : '';
    renderTourProgress();
  }

  function getSelectedTour() {
    if (!state.selectedTourId) return null;
    return state.tours.find(t => t.id === state.selectedTourId) || null;
  }

  function renderTourProgress() {
    if (!tourProgressWrap || !tourProgressText || !tourProgressBarFill || !tourProgressTitle) return;
    const selectedTour = getSelectedTour();
    if (!selectedTour) {
      tourProgressWrap.classList.add('hidden');
      return;
    }
    const viewed = Number(selectedTour.progress_viewed || 0);
    const total = Number(selectedTour.progress_total || 0);
    const percent = Number.isFinite(Number(selectedTour.progress_percent)) ? Number(selectedTour.progress_percent) : 0;
    tourProgressTitle.textContent = selectedTour.title || 'Тур';
    tourProgressText.textContent = `Прогресс: ${percent}% (${viewed}/${total})`;
    tourProgressBarFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    tourProgressWrap.classList.remove('hidden');
  }

  async function markInfoMarkerViewed(markerId) {
    if (!IS_AUTH || !state.selectedTourId) return;
    try {
      const res = await fetch(`/api/tours/${state.selectedTourId}/mark-viewed/`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken') || ''
        },
        body: JSON.stringify({ marker_id: markerId })
      });
      if (!res.ok) return;
      const data = await res.json();
      const selectedTour = getSelectedTour();
      if (!selectedTour) return;
      selectedTour.progress_viewed = Number(data.viewed || 0);
      selectedTour.progress_total = Number(data.total || 0);
      selectedTour.progress_percent = Number(data.percent || 0);
      renderTourSelect();
      renderTourProgress();
    } catch (err) {
      console.warn(err);
    }
  }

  function getCookie(name) {
    const value = `; ${document.cookie || ''}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  function pickInitialPointId(points) {
    const withPano = points.find(p => p.panorama && p.panorama.image);
    return withPano ? withPano.id : (points[0]?.id ?? null);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function loadScene(pointId) {
    const point = state.points.find(p => p.id === pointId);
    if (!point) return;
    const pano = point.panorama;
    if (!pano || !pano.image) {
      setLoader('Для точки нет панорамы', true);
      return;
    }
    toggleFade(true);
    setLoader('Загрузка панорамы...', true);
    const img = await loadImage(pano.image);

    state.activePointId = pointId;
    state.panoWidth = img.naturalWidth || img.width;
    state.panoHeight = img.naturalHeight || img.height;
    recalcScaledTile();
    state.panoUrl = pano.image;
    state.offsetPx = 0;
    state.velocity = 0;

    panoramaEl.style.backgroundImage = `url(${pano.image})`;
    scheduleRender();

    buildNavMarkers(pano.markers || []);

    highlightMinimap(pointId);
    setTimeout(() => toggleFade(false), 50);
    setLoader('', false);
  }

  function buildNavMarkers(markers) {
    markersLayer.innerHTML = '';
    const effectiveMarkers = state.selectedTourId
      ? markers
      : markers.filter(m => m.type !== 'info');

    state.markers = effectiveMarkers.map(m => {
      const el = document.createElement('button');
      const isInfo = m.type === 'info';
      el.className = 'tv-nav-marker' + (isInfo ? ' is-info' : '');
      el.type = 'button';

      const label = isInfo
        ? (m.label || 'Информация')
        : (m.target_point_name || 'Переход');
      // Показываем подсказку только для переходов, чтобы инфо-точки не раскрывали текст на hover
      if (!isInfo) {
        el.title = label;
      }
      el.setAttribute('aria-label', label);
      el.dataset.markerId = String(m.id);

      // Click handled separately to avoid drag interference
      el.dataset.targetPoint = String(m.target_point);
      markersLayer.appendChild(el);
      return { data: m, el };
    });
    scheduleRender();
  }

  function recalcScaledTile() {
    const h = panoramaContainer.clientHeight || window.innerHeight || 1;
    if (!state.panoWidth || !state.panoHeight) {
      state.tileWidth = h;
      return;
    }
    const scale = h / state.panoHeight;
    state.tileWidth = state.panoWidth * scale;
  }

  function azimuthToPx(azimuth) {
    if (!state.tileWidth) return 0;
    return (azimuth % 360) * state.tileWidth / 360;
  }

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function updateMarkersPosition(offsetMod) {
    const w = state.tileWidth || 1;
    const view = state.viewportW || window.innerWidth;
    const containerH = panoramaContainer.clientHeight || window.innerHeight;
    const padding = 60;

    state.markers.forEach(({ data, el }) => {
      const base = azimuthToPx(data.azimuth || 0);
      const candidates = [
        base - offsetMod - w,
        base - offsetMod,
        base - offsetMod + w
      ];
      let chosen = candidates.find(px => px >= -padding && px <= view + padding);
      if (chosen === undefined) {
        chosen = ((base - offsetMod) % w + w) % w;
      }
      el.style.left = `${chosen}px`;
      const pitch = Number.isFinite(data.pitch) ? data.pitch : 0;
      const topPx = (clamp(pitch, -90, 90) + 90) / 180 * containerH;
      el.style.top = `${topPx}px`;
    });
  }

  function scheduleRender() {
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(() => {
      state.rafPending = false;
      applyRender();
    });
  }

  function applyRender() {
    const w = state.tileWidth || 1;
    const offsetMod = ((state.offsetPx % w) + w) % w;
    panoramaEl.style.backgroundPosition = `${-offsetMod}px 50%`;
    updateMarkersPosition(offsetMod);
  }

  function onPointerDown(e) {
    // Ignore if clicking on a nav marker — let click event handle it
    if (e.target.closest('.tv-nav-marker')) return;

    state.isDragging = true;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.hasMoved = false;
    state.lastX = e.clientX;
    state.lastT = performance.now();
    state.velocity = 0;
    stopInertia();
    panoramaContainer.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!state.isDragging) return;

    const dx = e.clientX - state.lastX;
    const totalDx = Math.abs(e.clientX - state.dragStartX);
    const totalDy = Math.abs(e.clientY - state.dragStartY);

    // Only start actual panning if moved beyond threshold
    if (!state.hasMoved && totalDx < DRAG_THRESHOLD && totalDy < DRAG_THRESHOLD) {
      return;
    }
    state.hasMoved = true;

    const now = performance.now();
    state.offsetPx = state.offsetPx - dx;
    const dt = now - state.lastT || 1;
    state.velocity = -(dx / dt) * 16; // px per frame approximation
    state.lastX = e.clientX;
    state.lastT = now;
    scheduleRender();
  }

  function onPointerUp(e) {
    if (!state.isDragging) return;
    state.isDragging = false;
    try { panoramaContainer.releasePointerCapture(e.pointerId); } catch (_) {}

    // Only start inertia if user actually dragged
    if (state.hasMoved) {
      startInertia();
    }
    state.hasMoved = false;
  }

  function startInertia() {
    stopInertia();
    let v = state.velocity;
    const friction = 0.92;
    function step() {
      if (Math.abs(v) < 0.15) {
        stopInertia();
        return;
      }
      state.offsetPx = state.offsetPx + v;
      v *= friction;
      scheduleRender();
      state.inertiaHandle = requestAnimationFrame(step);
    }
    state.inertiaHandle = requestAnimationFrame(step);
  }

  function stopInertia() {
    if (state.inertiaHandle) {
      cancelAnimationFrame(state.inertiaHandle);
      state.inertiaHandle = null;
    }
  }

  function switchToPoint(pointId) {
    if (pointId === state.activePointId) return;
    loadScene(pointId).catch(err => {
      console.error(err);
      setLoader(err.message || 'Ошибка загрузки', true);
      toggleFade(false);
    });
  }

  function getMinimapMaxSize() {
    return window.innerWidth <= 600 ? MINIMAP_MAX_MOBILE : MINIMAP_MAX_DEFAULT;
  }

  /** Fit natural image size into a max square (and viewport), preserving aspect ratio. */
  function fitMinimapBox(nw, nh) {
    const cap = getMinimapMaxSize() * state.minimapZoom;
    const margin = 32;
    const maxW = Math.min(cap, Math.max(60, window.innerWidth - margin));
    const maxH = Math.min(cap, Math.max(60, window.innerHeight - margin));
    if (!nw || !nh) return { w: maxW, h: maxH };
    const scale = Math.min(maxW / nw, maxH / nh);
    return { w: nw * scale, h: nh * scale };
  }

  function applyMinimapDimensions() {
    if (!minimapEl) return;
    if (state.minimapCollapsed) {
      updateMinimapZoomButtons();
      return;
    }
    const nw = minimapImgEl.naturalWidth;
    const nh = minimapImgEl.naturalHeight;
    if (!nw || !nh) {
      updateMinimapZoomButtons();
      return;
    }
    const { w } = fitMinimapBox(nw, nh);
    minimapEl.style.aspectRatio = `${nw} / ${nh}`;
    minimapEl.style.width = `${w}px`;
    minimapEl.style.height = 'auto';
    updateMinimapZoomButtons();
  }

  function updateMinimapZoomButtons() {
    if (!minimapZoomInEl || !minimapZoomOutEl) return;
    const idx = MINIMAP_ZOOM_LEVELS.indexOf(state.minimapZoom);
    const collapsed = state.minimapCollapsed;
    minimapZoomOutEl.disabled = collapsed || idx <= 0;
    minimapZoomInEl.disabled = collapsed || idx >= MINIMAP_ZOOM_LEVELS.length - 1;
  }

  function nudgeMinimapZoom(delta) {
    if (state.minimapCollapsed) return;
    const idx = MINIMAP_ZOOM_LEVELS.indexOf(state.minimapZoom);
    const next = MINIMAP_ZOOM_LEVELS[idx + delta];
    if (next === undefined) return;
    state.minimapZoom = next;
    applyMinimapDimensions();
  }

  function renderMinimap() {
    if (!state.plan) return;
    state.minimapZoom = 1;
    minimapPointsEl.innerHTML = '';
    state.points.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'tv-minimap-point';
      btn.style.left = `${p.x}%`;
      btn.style.top = `${p.y}%`;
      btn.type = 'button';
      btn.title = p.name || 'Точка';
      btn.dataset.pointId = String(p.id);
      btn.addEventListener('click', () => switchToPoint(p.id));
      minimapPointsEl.appendChild(btn);
    });
    highlightMinimap(state.activePointId);

    const onMinimapImgReady = () => {
      applyMinimapDimensions();
    };
    minimapImgEl.onload = onMinimapImgReady;
    minimapImgEl.src = state.plan.image;
    if (minimapImgEl.complete && minimapImgEl.naturalWidth) {
      onMinimapImgReady();
    }
  }

  function highlightMinimap(activeId) {
    const nodes = minimapPointsEl.querySelectorAll('.tv-minimap-point');
    nodes.forEach(node => {
      const pid = Number(node.dataset.pointId);
      node.classList.toggle('active', pid === activeId);
    });
  }

  function onResize() {
    state.viewportW = panoramaContainer.clientWidth || window.innerWidth;
    recalcScaledTile();
    scheduleRender();
    applyMinimapDimensions();
  }

  function initEvents() {
    panoramaContainer.addEventListener('pointerdown', onPointerDown);
    panoramaContainer.addEventListener('pointermove', onPointerMove);
    panoramaContainer.addEventListener('pointerup', onPointerUp);
    panoramaContainer.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', onResize);

    // Delegated click handler for nav markers
    markersLayer.addEventListener('click', (e) => {
      const marker = e.target.closest('.tv-nav-marker');
      if (!marker) return;
      const markerData = state.markers.find(({ data }) => String(data.id) === marker.dataset.markerId)?.data;
      if (markerData?.type === 'info') {
        markInfoMarkerViewed(markerData.id);
        showInfoOverlay(markerData);
        return;
      }
      const targetId = Number(marker.dataset.targetPoint);
      if (targetId) switchToPoint(targetId);
    });

    minimapToggleEl.addEventListener('click', () => {
      state.minimapCollapsed = !state.minimapCollapsed;
      minimapEl.classList.toggle('tv-minimap--collapsed', state.minimapCollapsed);
      minimapToggleEl.setAttribute('aria-expanded', state.minimapCollapsed ? 'false' : 'true');
      minimapToggleEl.setAttribute(
        'aria-label',
        state.minimapCollapsed ? 'Развернуть мини-карту' : 'Свернуть мини-карту'
      );
      minimapToggleEl.textContent = state.minimapCollapsed ? '▣' : '−';
      if (state.minimapCollapsed) {
        minimapEl.style.width = '';
        minimapEl.style.height = '';
        minimapEl.style.aspectRatio = '';
      } else {
        applyMinimapDimensions();
      }
      updateMinimapZoomButtons();
    });

    minimapZoomOutEl?.addEventListener('click', () => nudgeMinimapZoom(-1));
    minimapZoomInEl?.addEventListener('click', () => nudgeMinimapZoom(1));

    infoOverlayClose?.addEventListener('click', hideInfoOverlay);
    infoOverlay?.addEventListener('click', (ev) => {
      if (ev.target === infoOverlay) hideInfoOverlay();
    });

    tourSelect?.addEventListener('change', () => {
      const val = tourSelect.value;
      state.selectedTourId = val ? Number(val) : null;
      renderTourProgress();
      hideInfoOverlay();
      fetchPlan(PLAN_ID, state.selectedTourId).catch(err => {
        console.error(err);
        setLoader(err.message || 'Ошибка загрузки', true);
      });
    });
  }

  function showInfoOverlay(marker) {
    if (!infoOverlay) return;
    if (infoOverlayTitle) infoOverlayTitle.textContent = marker.label || 'Информация';
    if (infoOverlayText) infoOverlayText.textContent = marker.text || 'Нет описания';
    infoOverlay.classList.add('visible');
  }

  function hideInfoOverlay() {
    infoOverlay?.classList.remove('visible');
  }

  function init() {
    initEvents();
    const load = async () => {
      if (IS_AUTH && tourSelect) {
        await loadTours();
      }
      await fetchPlan(PLAN_ID, state.selectedTourId);
    };
    load().catch(err => {
      console.error(err);
      setLoader(err.message || 'Ошибка загрузки', true);
      toggleFade(false);
    });
  }

  if (typeof window !== 'undefined' && window.__TOUR_VIEWER_TESTS__) {
    window.__tourViewerTest = {
      state,
      loadScene,
    };
  }

  if (!(typeof window !== 'undefined' && window.__TOUR_VIEWER_DISABLE_AUTO_INIT__)) {
    init();
  }
})();

(function () {
  const PLAN_ID = window.TOUR_PLAN_ID;
  if (!PLAN_ID) return;

  const panoramaEl = document.getElementById('tvPanoramaImage');
  const markersLayer = document.getElementById('tvNavMarkers');
  const fadeEl = document.getElementById('tvFade');
  const loaderEl = document.getElementById('tvLoader');
  const minimapEl = document.getElementById('tvMinimap');
  const minimapImgEl = document.getElementById('tvMinimapImage');
  const minimapPointsEl = document.getElementById('tvMinimapPoints');
  const minimapToggleEl = document.getElementById('tvMinimapToggle');
  const panoramaContainer = document.getElementById('tvPanorama');

  const DRAG_THRESHOLD = 5; // px — minimal movement to consider it a drag

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
    viewportW: window.innerWidth
  };

  // FIX: normalize URLs for кириллица/пробелы (и отсутствие ведущего '/')
  function normalizeUrl(url) {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const withLeadingSlash = url.startsWith('/') ? url : `/${url}`;
    return encodeURI(withLeadingSlash);
  }

  function setLoader(text, visible = true) {
    if (!loaderEl) return;
    loaderEl.textContent = text;
    loaderEl.classList.toggle('visible', visible);
  }

  function toggleFade(on) {
    fadeEl && fadeEl.classList.toggle('active', !!on);
  }

  async function fetchPlan(planId) {
    setLoader('Загрузка тура...', true);
    const res = await fetch(`/api/evac_plans/${planId}/`);
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

  function pickInitialPointId(points) {
    const withPano = points.find(p => p.panorama && p.panorama.image);
    return withPano ? withPano.id : (points[0]?.id ?? null);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = normalizeUrl(url);
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

    panoramaEl.style.backgroundImage = `url(${normalizeUrl(pano.image)})`;
    scheduleRender();

    buildNavMarkers(pano.markers || []);

    highlightMinimap(pointId);
    setTimeout(() => toggleFade(false), 50);
    setLoader('', false);
  }

  function buildNavMarkers(markers) {
    markersLayer.innerHTML = '';
    state.markers = markers.map(m => {
      const el = document.createElement('button');
      el.className = 'tv-nav-marker';
      el.type = 'button';
      el.title = m.target_point_name || 'Переход';
      el.setAttribute('aria-label', m.target_point_name || 'Переход');
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

  function updateMarkersPosition(offsetMod) {
    const w = state.tileWidth || 1;
    const view = state.viewportW || window.innerWidth;
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

  function renderMinimap() {
    if (!state.plan) return;
    minimapImgEl.src = state.plan.image;
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
      const targetId = Number(marker.dataset.targetPoint);
      if (targetId) {
        switchToPoint(targetId);
      }
    });

    minimapToggleEl.addEventListener('click', () => {
      const hidden = minimapEl.classList.toggle('hidden');
      minimapToggleEl.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      minimapToggleEl.textContent = hidden ? '⤢' : '⤡';
    });
  }

  function init() {
    initEvents();
    fetchPlan(PLAN_ID).catch(err => {
      console.error(err);
      setLoader(err.message || 'Ошибка загрузки', true);
      toggleFade(false);
    });
  }

  init();
})();

(function () {
  const PLAN_ID = window.TOUR_PLAN_ID;
  const IS_AUTH = !!window.IS_AUTH;
  const IS_STAFF = !!window.IS_STAFF;
  if (!PLAN_ID) return;

  const qs = new URLSearchParams(window.location.search || '');
  const FACILITY_ID_RAW = qs.get('facility');
  const START_POINT_RAW = qs.get('point');
  const ENTRY_AZIMUTH_RAW = qs.get('entry_azimuth');
  const FACILITY_ID = FACILITY_ID_RAW != null ? Number.parseInt(FACILITY_ID_RAW, 10) : NaN;
  const START_POINT_ID = START_POINT_RAW != null ? Number.parseInt(START_POINT_RAW, 10) : NaN;
  const START_ENTRY_AZIMUTH = ENTRY_AZIMUTH_RAW != null ? Number.parseFloat(ENTRY_AZIMUTH_RAW) : NaN;
  const IS_FACILITY_MODE = Number.isFinite(FACILITY_ID);

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
  const tvTourHintBtn = document.getElementById('tvTourHintBtn');
  const minimapRouteSvg = document.getElementById('tvMinimapRoute');
  const tvRouteStart = document.getElementById('tvRouteStart');
  const tvRouteEnd = document.getElementById('tvRouteEnd');
  const tvRouteBuild = document.getElementById('tvRouteBuild');
  const tvRouteClear = document.getElementById('tvRouteClear');
  const tvRouteStatus = document.getElementById('tvRouteStatus');
  const tvRouteDeviation = document.getElementById('tvRouteDeviation');
  const tvRouteDeviationText = document.getElementById('tvRouteDeviationText');
  const tvRouteRecalc = document.getElementById('tvRouteRecalc');
  const tvRouteCancelRoute = document.getElementById('tvRouteCancelRoute');
  const tvRouteRecalcHint = document.getElementById('tvRouteRecalcHint');
  const tvRoutePanel = document.getElementById('tvRoutePanel');
  const tvRoutePanelToggle = document.getElementById('tvRoutePanelToggle');
  const tvRoutePanelClose = document.getElementById('tvRoutePanelClose');
  const tvRouteToast = document.getElementById('tvRouteToast');

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
    minimapZoom: 1,
    facilityId: IS_FACILITY_MODE ? FACILITY_ID : null,
    startPointParam: Number.isFinite(START_POINT_ID) ? START_POINT_ID : null,
    /** @type {null | { id: number, plans: {id:number,title:string,floor:number,image:string}[], points: {id:number,name:string,plan_id:number,plan_title:string,plan_floor:number}[] }} */
    facility: null,
    /** @type {null | { endPointId: number, path: number[], steps: {from_point_id:number,to_point_id:number,marker_id:number}[], pointPlans?: Record<string, number>, deviation: 'none'|'blocked' }} */
    route: null,
    /** @type {null | { fromId: number, markerId: number, toId: number }} */
    pendingRouteNav: null
  };

  let arrivedToastTimer = null;
  let routeToastTimer = null;

  function routeStorageKey() {
    return state.facilityId ? `facilityRoute:${state.facilityId}` : `tourRoute:${PLAN_ID}`;
  }

  function pendingRouteNavStorageKey() {
    return state.facilityId ? `facilityPendingRouteNav:${state.facilityId}` : null;
  }

  function savePendingRouteNavToStorage(pending) {
    const key = pendingRouteNavStorageKey();
    if (!key || !pending) return;
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          fromId: Number(pending.fromId),
          markerId: Number(pending.markerId),
          toId: Number(pending.toId),
          entryAzimuth: (pending.entryAzimuth != null && Number.isFinite(Number(pending.entryAzimuth)))
            ? Number(pending.entryAzimuth) : null
        })
      );
    } catch (_) {
      /* ignore quota */
    }
  }

  function tryRestorePendingRouteNavFromStorage() {
    const key = pendingRouteNavStorageKey();
    if (!key) return null;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      const fromId = Number(saved.fromId);
      const markerId = Number(saved.markerId);
      const toId = Number(saved.toId);
      if (!Number.isFinite(fromId) || !Number.isFinite(markerId) || !Number.isFinite(toId)) {
        sessionStorage.removeItem(key);
        return null;
      }
      const entryAzimuth = (saved.entryAzimuth != null && Number.isFinite(Number(saved.entryAzimuth)))
        ? Number(saved.entryAzimuth) : null;
      return { fromId, markerId, toId, entryAzimuth };
    } catch (_) {
      try {
        sessionStorage.removeItem(key);
      } catch (__) {}
      return null;
    }
  }

  function clearPendingRouteNavStorage() {
    const key = pendingRouteNavStorageKey();
    if (!key) return;
    try {
      sessionStorage.removeItem(key);
    } catch (_) {
      /* ignore */
    }
  }

  function hideRecalcHint() {
    if (!tvRouteRecalcHint) return;
    tvRouteRecalcHint.classList.add('hidden');
    tvRouteRecalcHint.textContent = '';
  }

  function hideDeviationBanner() {
    tvRouteDeviation?.classList.add('hidden');
    hideRecalcHint();
  }

  function setRouteStatus(text) {
    if (tvRouteStatus) tvRouteStatus.textContent = text || '';
  }

  function syncRouteStartSelectFromActive() {
    if (!tvRouteStart || state.activePointId == null) return;
    const v = String(state.activePointId);
    if ([...tvRouteStart.options].some(o => o.value === v)) {
      tvRouteStart.value = v;
    }
  }

  function setRoutePanelVisible(open) {
    if (!tvRoutePanel || !tvRoutePanelToggle) return;
    tvRoutePanel.classList.toggle('hidden', !open);
    tvRoutePanelToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) syncRouteStartSelectFromActive();
  }

  function saveRouteToStorage() {
    const r = state.route;
    if (!r || r.deviation === 'blocked') return;
    try {
      const base = {
        endPointId: r.endPointId,
        path: r.path,
        steps: r.steps
      };
      if (state.facilityId) {
        sessionStorage.setItem(
          routeStorageKey(),
          JSON.stringify({
            ...base,
            facilityId: state.facilityId,
            point_plans: r.pointPlans || {}
          })
        );
      } else {
        sessionStorage.setItem(routeStorageKey(), JSON.stringify(base));
      }
    } catch (_) {
      /* ignore quota */
    }
  }

  function tryRestoreRouteFromStorage() {
    try {
      const raw = sessionStorage.getItem(routeStorageKey());
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved.path || !Array.isArray(saved.path)) {
        sessionStorage.removeItem(routeStorageKey());
        return;
      }

      // In facility mode, path can span multiple plans — do not validate against current plan points.
      if (!state.facilityId) {
        const ids = new Set(state.points.map(p => p.id));
        if (!saved.path.every(id => ids.has(id))) {
          sessionStorage.removeItem(routeStorageKey());
          return;
        }
      } else {
        if (Number(saved.facilityId) !== Number(state.facilityId)) {
          sessionStorage.removeItem(routeStorageKey());
          return;
        }
      }
      state.route = {
        endPointId: Number(saved.endPointId),
        path: saved.path.map(Number).filter(Number.isFinite),
        steps: (saved.steps || []).map(s => ({
          from_point_id: Number(s.from_point_id),
          to_point_id: Number(s.to_point_id),
          marker_id: Number(s.marker_id)
        })),
        pointPlans: state.facilityId ? (saved.point_plans || saved.pointPlans || {}) : undefined,
        deviation: 'none'
      };
    } catch (_) {
      try {
        sessionStorage.removeItem(routeStorageKey());
      } catch (__) {
        /* ignore */
      }
    }
  }

  function clearRoute() {
    state.route = null;
    state.pendingRouteNav = null;
    try {
      sessionStorage.removeItem(routeStorageKey());
    } catch (_) {
      /* ignore */
    }
    updateRoutePolyline();
    applyRouteNavHighlights();
    hideDeviationBanner();
    setRouteStatus('');
    if (state.activePointId != null) highlightMinimap(state.activePointId);
  }

  function updateRoutePolyline() {
    const svg = minimapRouteSvg || document.getElementById('tvMinimapRoute');
    if (!svg) return;
    const r = state.route;
    if (!r || r.deviation === 'blocked' || !r.path?.length) {
      svg.innerHTML = '';
      return;
    }
    const pairs = [];
    const pointPlans = r.pointPlans || null;
    let idsToDraw = r.path;
    if (state.facilityId && pointPlans && state.activePointId != null) {
      const i = idsToDraw.indexOf(state.activePointId);
      if (i === -1) {
        svg.innerHTML = '';
        return;
      }
      const currentPlanId = PLAN_ID;
      const seg = [];
      for (let j = i; j < idsToDraw.length; j++) {
        const pid = idsToDraw[j];
        const planId = pointPlans[String(pid)];
        if (planId == null || Number(planId) !== Number(currentPlanId)) break;
        seg.push(pid);
      }
      idsToDraw = seg;
    }
    for (const id of idsToDraw) {
      const p = state.points.find(x => x.id === id);
      if (p) pairs.push(`${Number(p.x)},${Number(p.y)}`);
    }
    if (pairs.length < 2) {
      svg.innerHTML = '';
      return;
    }
    svg.innerHTML = `<polyline fill="none" points="${pairs.join(' ')}" />`;
  }

  function setRouteDeviation(message) {
    if (!state.route || state.route.deviation === 'blocked') return;
    state.route.deviation = 'blocked';
    updateRoutePolyline();
    applyRouteNavHighlights();
    if (tvRouteDeviationText) {
      tvRouteDeviationText.textContent = message || 'Вы сошли с маршрута.';
    }
    tvRouteDeviation?.classList.remove('hidden');
    hideRecalcHint();
  }

  function populateRouteSelects() {
    if (!tvRouteStart || !tvRouteEnd) return;
    const prevE = tvRouteEnd.value;
    tvRouteStart.innerHTML = '';
    tvRouteEnd.innerHTML = '';
    const list = state.facilityId && state.facility?.points?.length
      ? state.facility.points
      : state.points;
    list.forEach(p => {
      const o1 = document.createElement('option');
      o1.value = String(p.id);
      if (state.facilityId) {
        const floor = p.plan_floor != null ? `этаж ${p.plan_floor}` : 'этаж ?';
        o1.textContent = `${p.name || `Точка ${p.id}`} — ${p.plan_title || 'План'} (${floor})`;
      } else {
        o1.textContent = p.name || `Точка ${p.id}`;
      }
      tvRouteStart.appendChild(o1.cloneNode(true));
      tvRouteEnd.appendChild(o1);
    });
    const ids = new Set(list.map(p => p.id));
    const activeId = state.activePointId;
    if (activeId != null && ids.has(activeId)) {
      tvRouteStart.value = String(activeId);
    } else if (list.length) {
      tvRouteStart.value = String(list[0].id);
    }
    if (prevE && [...tvRouteEnd.options].some(o => o.value === prevE)) {
      tvRouteEnd.value = prevE;
    } else if (list.length > 1) {
      const startNum = Number(tvRouteStart.value);
      const other = list.find(p => p.id !== startNum) || list[0];
      tvRouteEnd.value = String(other.id);
    }
  }

  /**
   * Миникарта: с текущей позиции path[i] разрешён только переход на path[i] (no-op) или path[i+1].
   * Любая другая точка — сход с маршрута (баннер), переход всё равно выполняется.
   */
  function validateMinimapAgainstRoute(targetId) {
    const r = state.route;
    if (!r || r.deviation === 'blocked') return;
    if (targetId === state.activePointId) return;
    const i = r.path.indexOf(state.activePointId);
    if (i === -1) {
      setRouteDeviation('Вы сошли с маршрута.');
      return;
    }
    // In facility mode, minimap clicks within the same plan are allowed only as "next" step too.
    if (i === r.path.length - 1) {
      if (targetId !== state.activePointId) {
        setRouteDeviation('Вы сошли с маршрута.');
      }
      return;
    }
    const next = r.path[i + 1];
    if (targetId === next) return;
    setRouteDeviation('Вы сошли с маршрута.');
  }

  function processPendingRouteNav() {
    const pending = state.pendingRouteNav;
    state.pendingRouteNav = null;
    clearPendingRouteNavStorage();
    if (!pending) return;
    if (!state.route || state.route.deviation === 'blocked') return;
    const r = state.route;
    const i = r.path.indexOf(pending.fromId);
    if (i === -1 || i >= r.path.length - 1) {
      setRouteDeviation('Вы сошли с маршрута.');
      return;
    }
    const step = r.steps[i];
    if (!step || pending.toId !== r.path[i + 1] || pending.markerId !== step.marker_id) {
      setRouteDeviation('Вы сошли с маршрута.');
    }
  }

  function applyRouteNavHighlights() {
    if (!state.markers?.length) return;
    state.markers.forEach(({ data, el }) => {
      el.classList.remove('is-route-next', 'is-route-dim');
      if (data.type === 'info') return;
      const r = state.route;
      if (!r || r.deviation === 'blocked') return;
      const i = r.path.indexOf(state.activePointId);
      if (i === -1 || i >= r.path.length - 1) return;
      const step = r.steps[i];
      if (!step) return;
      if (data.id === step.marker_id && data.target_point === r.path[i + 1]) {
        el.classList.add('is-route-next');
      } else {
        el.classList.add('is-route-dim');
      }
    });
  }

  function checkRouteArrival() {
    const r = state.route;
    if (!r || r.deviation === 'blocked') return;
    if (!r.path.length) return;
    if (state.activePointId === r.endPointId) {
      showArrivedToast();
      clearRoute();
    }
  }

  function showArrivedToast() {
    const el = document.getElementById('tvRouteArrived');
    if (!el) return;
    el.classList.remove('hidden');
    if (arrivedToastTimer) clearTimeout(arrivedToastTimer);
    arrivedToastTimer = setTimeout(() => {
      el.classList.add('hidden');
      arrivedToastTimer = null;
    }, 2200);
  }

  function showRouteToast(message) {
    const el = tvRouteToast || document.getElementById('tvRouteToast');
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('hidden');
    if (routeToastTimer) clearTimeout(routeToastTimer);
    routeToastTimer = setTimeout(() => {
      el.classList.add('hidden');
      routeToastTimer = null;
    }, 2200);
  }

  function applyRouteApiResult(data, endPointIdOverride) {
    if (!data || !data.found) return false;
    const endId =
      endPointIdOverride != null && Number.isFinite(Number(endPointIdOverride))
        ? Number(endPointIdOverride)
        : data.end_point_id != null
          ? Number(data.end_point_id)
          : Number(data.path[data.path.length - 1]);
    state.route = {
      endPointId: endId,
      path: data.path,
      steps: data.steps || [],
      pointPlans: state.facilityId ? (data.point_plans || {}) : undefined,
      deviation: 'none'
    };
    saveRouteToStorage();
    hideDeviationBanner();
    updateRoutePolyline();
    highlightMinimap(state.activePointId);
    applyRouteNavHighlights();
    syncRouteStartSelectFromActive();
    return true;
  }

  async function fetchAndApplyRoute(startId, endId) {
    setRouteStatus('');
    hideRecalcHint();
    const url = state.facilityId
      ? `/api/facilities/${state.facilityId}/route/?start_point=${encodeURIComponent(startId)}&end_point=${encodeURIComponent(endId)}`
      : `/api/evac_plans/${PLAN_ID}/route/?start_point=${encodeURIComponent(startId)}&end_point=${encodeURIComponent(endId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      let detail = 'Ошибка запроса маршрута.';
      try {
        const err = await res.json();
        if (err.detail) detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
      } catch (_) {
        /* ignore */
      }
      setRouteStatus(detail);
      setRoutePanelVisible(true);
      return false;
    }
    const data = await res.json();
    if (!data.found) {
      setRouteStatus('Маршрут не найден для выбранных точек.');
      setRoutePanelVisible(true);
      return false;
    }
    applyRouteApiResult(data, endId);
    setRouteStatus('');
    showRouteToast('Маршрут построен.');
    return true;
  }

  async function fetchTourRouteHint() {
    if (!IS_AUTH || !state.selectedTourId || state.activePointId == null) return;
    try {
      if (tvTourHintBtn) tvTourHintBtn.disabled = true;
      const url = `/api/tours/${state.selectedTourId}/route-hint/?from_point=${encodeURIComponent(state.activePointId)}`;
      const res = await fetch(url, { credentials: 'same-origin' });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = {};
      }
      if (!res.ok) {
        const msg =
          typeof data.detail === 'string' ? data.detail : 'Не удалось получить подсказку.';
        showRouteToast(msg);
        return;
      }
      if (!data.found) {
        showRouteToast(
          typeof data.detail === 'string' ? data.detail : 'Подсказка недоступна.'
        );
        return;
      }
      applyRouteApiResult(data);
      showRouteToast('Маршрут по подсказке построен.');
    } catch (err) {
      console.error(err);
      showRouteToast('Ошибка запроса подсказки.');
    } finally {
      if (tvTourHintBtn) tvTourHintBtn.disabled = false;
    }
  }

  async function recalculateRouteFromHere() {
    if (!state.route) return;
    hideRecalcHint();
    const end = state.route.endPointId;
    const start = state.activePointId;
    const ok = await fetchAndApplyRoute(start, end);
    if (!ok && state.route?.deviation === 'blocked' && tvRouteRecalcHint) {
      tvRouteRecalcHint.textContent =
        'До цели из этой точки маршрут недоступен. Отмените маршрут или перейдите к другой точке.';
      tvRouteRecalcHint.classList.remove('hidden');
    }
  }

  async function onRouteBuildClick() {
    if (!tvRouteStart || !tvRouteEnd) return;
    const s = Number(tvRouteStart.value);
    const e = Number(tvRouteEnd.value);
    if (!Number.isFinite(s) || !Number.isFinite(e)) {
      setRouteStatus('Выберите старт и финиш.');
      setRoutePanelVisible(true);
      return;
    }
    try {
      if (tvRouteBuild) tvRouteBuild.disabled = true;
      await fetchAndApplyRoute(s, e);
    } catch (err) {
      console.error(err);
      setRouteStatus('Не удалось построить маршрут.');
      setRoutePanelVisible(true);
    } finally {
      if (tvRouteBuild) tvRouteBuild.disabled = false;
    }
  }

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
    populateRouteSelects();
    renderMinimap();
    tryRestoreRouteFromStorage();
    updateRoutePolyline();
    highlightMinimap(state.activePointId);
    if (!state.facilityId && plan?.facility_id != null) {
      const fid = Number(plan.facility_id);
      if (Number.isFinite(fid)) {
        showRouteToast('Этот тур относится к объекту. Для межэтажных переходов откройте с ?facility=' + fid);
      }
    }
    if (state.activePointId) {
      // Использовать угол входа из URL (cross-plan reload) если точка совпадает с запрошенной
      const initialEntry =
        Number.isFinite(START_ENTRY_AZIMUTH) &&
        Number.isFinite(START_POINT_ID) &&
        state.activePointId === START_POINT_ID
          ? START_ENTRY_AZIMUTH
          : (state.pendingRouteNav?.entryAzimuth ?? null);
      await loadScene(state.activePointId, initialEntry);
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

  async function resolveTargetPlanIdByPointId(pointId) {
    const id = Number(pointId);
    if (!Number.isFinite(id)) return null;
    try {
      const res = await fetch(`/api/map_points/${encodeURIComponent(id)}/`);
      if (!res.ok) return null;
      const data = await res.json();
      const planId = data?.plan != null ? Number(data.plan) : null;
      return Number.isFinite(planId) ? planId : null;
    } catch (_) {
      return null;
    }
  }

  function pickInitialPointId(points) {
    const requested = state.startPointParam;
    if (requested != null) {
      const exists = points.find(p => Number(p.id) === Number(requested));
      if (exists) return exists.id;
    }
    const configured = state.plan?.start_point;
    if (configured != null) {
      const found = points.find(p => Number(p.id) === Number(configured));
      if (found) return found.id;
    }
    const withPano = points.find(p => p.panorama && p.panorama.image);
    return withPano ? withPano.id : (points[0]?.id ?? null);
  }

  async function loadFacilityContext() {
    if (!state.facilityId) return;
    try {
      const res = await fetch(`/api/facilities/${state.facilityId}/`);
      if (!res.ok) throw new Error('Не удалось загрузить facility');
      const detail = await res.json();
      const plans = Array.isArray(detail?.plans) ? detail.plans : [];
      // Load points for each plan to populate route selects across facility.
      const allPoints = [];
      for (const plan of plans) {
        const pid = Number(plan.id);
        if (!Number.isFinite(pid)) continue;
        try {
          const pr = await fetch(`/api/map_points/?plan=${encodeURIComponent(pid)}`);
          if (!pr.ok) continue;
          const pts = await pr.json();
          if (!Array.isArray(pts)) continue;
          pts.forEach(pt => {
            allPoints.push({
              id: Number(pt.id),
              name: pt.name || `Точка ${pt.id}`,
              plan_id: pid,
              plan_title: plan.title || `План ${pid}`,
              plan_floor: Number.isFinite(Number(plan.floor)) ? Number(plan.floor) : null
            });
          });
        } catch (_) {
          /* ignore per-plan errors */
        }
      }
      state.facility = {
        id: state.facilityId,
        plans,
        points: allPoints.filter(p => Number.isFinite(p.id))
      };
    } catch (err) {
      console.warn(err);
      state.facility = null;
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function loadScene(pointId, entryAzimuth = null) {
    const point = state.points.find(p => p.id === pointId);
    if (!point) {
      state.pendingRouteNav = null;
      return;
    }
    const pano = point.panorama;
    if (!pano || !pano.image) {
      state.pendingRouteNav = null;
      setLoader('Для точки нет панорамы', true);
      return;
    }
    toggleFade(true);
    setLoader('Загрузка панорамы...', true);
    const img = await loadImage(pano.image);

    const prevActiveId = state.activePointId;
    state.activePointId = pointId;
    state.panoWidth = img.naturalWidth || img.width;
    state.panoHeight = img.naturalHeight || img.height;
    recalcScaledTile();
    state.panoUrl = pano.image;

    // Определить угол входа: явный → обратный маркер → 0
    let landingAzimuth = (entryAzimuth != null && Number.isFinite(Number(entryAzimuth)))
      ? Number(entryAzimuth)
      : null;
    if (landingAzimuth == null) {
      landingAzimuth = findReverseAzimuth(pointId, prevActiveId);
    }
    // Если задан угол — центрировать вьюпорт на нём (offsetPx = позиция пикселя - полвьюпорта)
    state.offsetPx = landingAzimuth != null
      ? azimuthToPx(landingAzimuth) - (state.viewportW / 2)
      : 0;
    state.velocity = 0;

    panoramaEl.style.backgroundImage = `url(${pano.image})`;
    scheduleRender();

    buildNavMarkers(pano.markers || []);

    applyRouteNavHighlights();
    processPendingRouteNav();
    // If we restored a facility route but current point is not on it — mark deviation.
    if (state.route && state.route.deviation !== 'blocked') {
      const i = state.route.path.indexOf(state.activePointId);
      if (i === -1) {
        setRouteDeviation('Вы сошли с маршрута.');
      }
    }
    checkRouteArrival();

    highlightMinimap(pointId);
    syncRouteStartSelectFromActive();
    setTimeout(() => toggleFade(false), 50);
    setLoader('', false);
  }

  function buildNavMarkers(markers) {
    markersLayer.innerHTML = '';
    let effectiveMarkers = state.selectedTourId
      ? markers
      : markers.filter(m => m.type !== 'info');

    // V3: Without facility mode, hide cross-plan transitions.
    if (!state.facilityId) {
      effectiveMarkers = effectiveMarkers.filter(m => {
        if (m.type !== 'transition') return true;
        const targetPlanId = m.target_plan_id != null ? Number(m.target_plan_id) : null;
        if (!Number.isFinite(targetPlanId)) return true;
        return Number(targetPlanId) === Number(PLAN_ID);
      });
    }

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

  /**
   * Ищет обратный маркер: в целевой точке toPointId находит переходной маркер,
   * ведущий обратно в fromPointId. Возвращает azimuth обратного маркера + 180°
   * (т.е. направление "спиной к двери" — лицом внутрь комнаты).
   * @param {number} toPointId
   * @param {number|null} fromPointId
   * @returns {number|null}
   */
  function findReverseAzimuth(toPointId, fromPointId) {
    if (fromPointId == null) return null;
    const target = state.points.find(p => p.id === toPointId);
    if (!target?.panorama?.markers?.length) return null;
    const rev = target.panorama.markers.find(
      m => m.type === 'transition' && Number(m.target_point) === fromPointId
    );
    if (!rev) return null;
    return (rev.azimuth + 180) % 360;
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

  function switchToPoint(pointId, entryAzimuth = null) {
    if (pointId === state.activePointId) {
      state.pendingRouteNav = null;
      return;
    }
    loadScene(pointId, entryAzimuth).catch(err => {
      state.pendingRouteNav = null;
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
      btn.addEventListener('click', () => {
        validateMinimapAgainstRoute(p.id);
        switchToPoint(p.id);
      });
      minimapPointsEl.appendChild(btn);
    });

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
    const pathSet =
      state.route && state.route.deviation !== 'blocked' && Array.isArray(state.route.path)
        ? new Set(state.route.path)
        : null;
    nodes.forEach(node => {
      const pid = Number(node.dataset.pointId);
      node.classList.toggle('active', pid === activeId);
      node.classList.toggle('on-route', !!(pathSet && pathSet.has(pid)));
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
      if (targetId) {
        const entryAzimuth =
          markerData?.entry_azimuth != null && Number.isFinite(Number(markerData.entry_azimuth))
            ? Number(markerData.entry_azimuth)
            : null;

        const pending =
          markerData
            ? {
                fromId: state.activePointId,
                markerId: markerData.id,
                toId: targetId,
                entryAzimuth
              }
            : null;

        if (pending) {
          state.pendingRouteNav = pending;
        }

        let targetPlanId =
          markerData && markerData.target_plan_id != null
            ? Number(markerData.target_plan_id)
            : null;

        // V4: In facility mode, cross-plan transition performs full reload with ?facility&point.
        if (state.facilityId) {
          const eaParam = entryAzimuth != null
            ? `&entry_azimuth=${encodeURIComponent(entryAzimuth)}` : '';
          // If serializer did not provide target_plan_id, resolve from point.
          if (!Number.isFinite(targetPlanId)) {
            resolveTargetPlanIdByPointId(targetId).then((resolved) => {
              if (!Number.isFinite(resolved)) {
                showRouteToast('Не удалось определить план целевой точки.');
                return;
              }
              if (Number(resolved) !== Number(PLAN_ID)) {
                if (pending) savePendingRouteNavToStorage(pending);
                window.location.href = `/tour/${encodeURIComponent(resolved)}/?facility=${encodeURIComponent(state.facilityId)}&point=${encodeURIComponent(targetId)}${eaParam}`;
                return;
              }
              switchToPoint(targetId, entryAzimuth);
            });
            return;
          }
          if (Number(targetPlanId) !== Number(PLAN_ID)) {
            if (pending) savePendingRouteNavToStorage(pending);
            window.location.href = `/tour/${encodeURIComponent(targetPlanId)}/?facility=${encodeURIComponent(state.facilityId)}&point=${encodeURIComponent(targetId)}${eaParam}`;
            return;
          }
        } else {
          // Without facility mode, cross-plan transitions are hidden, but if one slips through — block.
          if (Number.isFinite(targetPlanId) && Number(targetPlanId) !== Number(PLAN_ID)) {
            showRouteToast('Межэтажный переход доступен только в режиме объекта (?facility=...).');
            return;
          }
        }

        switchToPoint(targetId, entryAzimuth);
      }
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

    tvRoutePanelToggle?.addEventListener('click', () => {
      if (!tvRoutePanel) return;
      setRoutePanelVisible(tvRoutePanel.classList.contains('hidden'));
    });

    tvRoutePanelClose?.addEventListener('click', () => setRoutePanelVisible(false));

    tvRouteBuild?.addEventListener('click', () => onRouteBuildClick());
    tvRouteClear?.addEventListener('click', () => clearRoute());
    tvRouteRecalc?.addEventListener('click', () => {
      if (tvRouteRecalc) tvRouteRecalc.disabled = true;
      recalculateRouteFromHere().finally(() => {
        if (tvRouteRecalc) tvRouteRecalc.disabled = false;
      });
    });
    tvRouteCancelRoute?.addEventListener('click', () => clearRoute());

    infoOverlayClose?.addEventListener('click', hideInfoOverlay);
    infoOverlay?.addEventListener('click', (ev) => {
      if (ev.target === infoOverlay) hideInfoOverlay();
    });

    tourSelect?.addEventListener('change', () => {
      clearRoute();
      const val = tourSelect.value;
      state.selectedTourId = val ? Number(val) : null;
      renderTourProgress();
      hideInfoOverlay();
      fetchPlan(PLAN_ID, state.selectedTourId).catch(err => {
        console.error(err);
        setLoader(err.message || 'Ошибка загрузки', true);
      });
    });

    tvTourHintBtn?.addEventListener('click', () => fetchTourRouteHint());
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
      // Restore pending cross-plan step before loading plan.
      if (state.facilityId) {
        state.pendingRouteNav = tryRestorePendingRouteNavFromStorage();
        await loadFacilityContext();
      }
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

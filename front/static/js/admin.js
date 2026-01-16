const API = {
  plans: '/api/evac_plans/',
  points: '/api/map_points/',
  panoramas: '/api/panoramas/',
  markers: '/api/panorama_markers/'
};

const LS_KEY = 'evac_editor_ui_prefs_v1';
const statusBar = document.getElementById('statusBar');
const stepper = document.getElementById('stepper');
const planListEl = document.getElementById('planList');
const planSearch = document.getElementById('planSearch');
const refreshPlansBtn = document.getElementById('refreshPlansBtn');
const createPlanBtn = document.getElementById('createPlanBtn');
const planTitleInput = document.getElementById('planTitle');
const planUploadInput = document.getElementById('planUpload');
const activePlanTitle = document.getElementById('activePlanTitle');
const planWrap = document.getElementById('planWrap');
const planImg = document.getElementById('plan');
const panoramaView = document.getElementById('panoramaView');
const planCanvas = document.getElementById('planCanvas');
const panoramaCanvas = document.getElementById('panoramaCanvas');

const toolButtons = Array.from(document.querySelectorAll('.tool-btn'));
const stepButtons = Array.from(stepper.querySelectorAll('button'));

// Inspector elements
const editPlanTitle = document.getElementById('editPlanTitle');
const savePlanTitleBtn = document.getElementById('savePlanTitleBtn');
const deletePlanBtn = document.getElementById('deletePlanBtn');

const pointNameInput = document.getElementById('pointNameInput');
const pointXInput = document.getElementById('pointX');
const pointYInput = document.getElementById('pointY');
const savePointBtn = document.getElementById('savePointBtn');
const deletePointBtn = document.getElementById('deletePointBtn');

const panoramaUpload = document.getElementById('panoramaUpload');
const uploadPanoramaBtn = document.getElementById('uploadPanoramaBtn');
const deletePanoramaBtn = document.getElementById('deletePanoramaBtn');

const targetPointSelect = document.getElementById('targetPointSelect');
const markersList = document.getElementById('markersList');
const verifyResults = document.getElementById('verifyResults');

let state = {
  plans: [],
  selectedPlanId: null,
  selectedPointId: null,
  activeStep: 'plan',
  activeTool: 'view',
  loading: false
};

// --- helpers ---
function setStatus(text) {
  statusBar.textContent = text;
}

function persistPrefs() {
  const prefs = {
    selectedPlanId: state.selectedPlanId,
    activeStep: state.activeStep,
    activeTool: state.activeTool
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch (e) { console.warn(e); }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const prefs = JSON.parse(raw);
      state.selectedPlanId = prefs.selectedPlanId || null;
      state.activeStep = prefs.activeStep || 'plan';
      state.activeTool = prefs.activeTool || 'view';
    }
  } catch (e) {
    console.warn(e);
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Ошибка запроса');
  }
  return await res.json();
}

function getActivePlan() {
  return state.plans.find(p => p.id === state.selectedPlanId) || null;
}

function getSelectedPoint() {
  const plan = getActivePlan();
  if (!plan) return null;
  return (plan.points || []).find(p => p.id === state.selectedPointId) || null;
}

function setLoading(isLoading, msg = '') {
  state.loading = isLoading;
  setStatus(msg || (isLoading ? 'Сохранение...' : 'Готово'));
  [createPlanBtn, savePlanTitleBtn, deletePlanBtn, savePointBtn, deletePointBtn, uploadPanoramaBtn, deletePanoramaBtn]
    .forEach(btn => btn && (btn.disabled = isLoading));
}

function getPlanIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('plan');
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// --- API layer ---
async function loadPlans() {
  const plans = await fetchJson(API.plans);
  state.plans = plans;
  if (state.selectedPlanId && !plans.find(p => p.id === state.selectedPlanId)) {
    state.selectedPlanId = null;
    state.selectedPointId = null;
  }
  render();
}

async function loadPlanDetail(id) {
  const plan = await fetchJson(`${API.plans}${id}/`);
  state.plans = state.plans.map(p => p.id === id ? plan : p);
  render();
}

async function createPlan() {
  const title = planTitleInput.value.trim();
  const file = planUploadInput.files[0];
  if (!title || !file) {
    alert('Введите название и выберите файл плана');
    return;
  }
  setLoading(true, 'Создание плана...');
  try {
    const form = new FormData();
    form.append('title', title);
    form.append('image', file);
    const plan = await fetchJson(API.plans, { method: 'POST', body: form });
    planTitleInput.value = '';
    planUploadInput.value = '';
    await loadPlans();
    state.selectedPlanId = plan.id;
    state.activeStep = 'points';
    persistPrefs();
    await loadPlanDetail(plan.id);
    setStatus('План создан');
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка создания плана');
  } finally {
    setLoading(false);
  }
}

async function updatePlanTitle() {
  const plan = getActivePlan();
  if (!plan) return;
  const title = editPlanTitle.value.trim();
  if (!title) return alert('Введите название');
  setLoading(true, 'Сохранение названия...');
  try {
    const updated = await fetchJson(`${API.plans}${plan.id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    state.plans = state.plans.map(p => p.id === plan.id ? updated : p);
    setStatus('Название сохранено');
    render();
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка сохранения');
  } finally {
    setLoading(false);
  }
}

async function deletePlan() {
  const plan = getActivePlan();
  if (!plan) return;
  if (!confirm('Удалить план и все связанные данные?')) return;
  setLoading(true, 'Удаление плана...');
  try {
    await fetchJson(`${API.plans}${plan.id}/`, { method: 'DELETE' });
    state.selectedPlanId = null;
    state.selectedPointId = null;
    await loadPlans();
    setStatus('План удалён');
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка удаления');
  } finally {
    setLoading(false);
  }
}

async function createPointOnPlan(x, y) {
  const plan = getActivePlan();
  if (!plan) return alert('Выберите план');
  const name = `Точка ${plan.points ? plan.points.length + 1 : 1}`;
  setLoading(true, 'Создание точки...');
  try {
    await fetchJson(API.points, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: plan.id, name, x, y })
    });
    await loadPlanDetail(plan.id);
    const refreshed = getActivePlan();
    state.selectedPointId = refreshed?.points?.slice(-1)[0]?.id || null;
    setStatus('Точка создана');
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка создания точки');
  } finally {
    setLoading(false);
  }
}

async function updatePoint() {
  const point = getSelectedPoint();
  if (!point) return;
  const name = pointNameInput.value.trim() || 'Точка';
  setLoading(true, 'Сохранение точки...');
  try {
    await fetchJson(`${API.points}${point.id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    await loadPlanDetail(getActivePlan().id);
    setStatus('Точка сохранена');
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка сохранения точки');
  } finally {
    setLoading(false);
  }
}

async function deletePoint() {
  const point = getSelectedPoint();
  if (!point) return;
  if (!confirm('Удалить точку и связанные панорамы/маркер?')) return;
  setLoading(true, 'Удаление точки...');
  try {
    await fetchJson(`${API.points}${point.id}/`, { method: 'DELETE' });
    state.selectedPointId = null;
    await loadPlanDetail(getActivePlan().id);
    setStatus('Точка удалена');
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка удаления точки');
  } finally {
    setLoading(false);
  }
}

async function uploadPanorama(pointId) {
  const file = panoramaUpload.files[0];
  if (!file) return alert('Выберите файл панорамы');
  setLoading(true, 'Загрузка панорамы...');
  try {
    const form = new FormData();
    form.append('point', pointId);
    form.append('image', file);
    await fetchJson(API.panoramas, { method: 'POST', body: form });
    panoramaUpload.value = '';
    await loadPlanDetail(getActivePlan().id);
    setStatus('Панорама загружена');
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка загрузки панорамы');
  } finally {
    setLoading(false);
  }
}

async function deletePanorama(panoramaId) {
  if (!panoramaId) return;
  if (!confirm('Удалить панораму?')) return;
  setLoading(true, 'Удаление панорамы...');
  try {
    await fetchJson(`${API.panoramas}${panoramaId}/`, { method: 'DELETE' });
    await loadPlanDetail(getActivePlan().id);
    setStatus('Панорама удалена');
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка удаления панорамы');
  } finally {
    setLoading(false);
  }
}

async function createMarker(panoramaId, targetPointId, azimuth, pitch = 0) {
  setLoading(true, 'Создание маркера...');
  try {
    await fetchJson(API.markers, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panorama: panoramaId, target_point: targetPointId, azimuth, pitch })
    });
    await loadPlanDetail(getActivePlan().id);
    setStatus('Маркер создан');
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка создания маркера');
  } finally {
    setLoading(false);
  }
}

async function deleteMarker(markerId) {
  if (!confirm('Удалить переход?')) return;
  setLoading(true, 'Удаление маркера...');
  try {
    await fetchJson(`${API.markers}${markerId}/`, { method: 'DELETE' });
    await loadPlanDetail(getActivePlan().id);
    setStatus('Маркер удалён');
  } catch (e) {
    alert(e.message);
    setStatus('Ошибка удаления маркера');
  } finally {
    setLoading(false);
  }
}

// --- rendering ---
function renderStepper() {
  stepButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.step === state.activeStep);
  });
}

function renderPlansList() {
  const term = planSearch.value.trim().toLowerCase();
  const items = state.plans.filter(p => p.title.toLowerCase().includes(term));
  planListEl.innerHTML = '';
  if (!items.length) {
    planListEl.innerHTML = '<div class="small">Нет планов</div>';
    return;
  }
  items.forEach(p => {
    const div = document.createElement('div');
    div.className = 'item' + (p.id === state.selectedPlanId ? ' active' : '');
    div.innerHTML = `<div><div><strong>${p.title}</strong></div><div class="meta">#${p.id}</div></div>`;
    div.addEventListener('click', async () => {
      state.selectedPlanId = p.id;
      state.selectedPointId = null;
      persistPrefs();
      await loadPlanDetail(p.id);
    });
    planListEl.appendChild(div);
  });
}

function renderMarkersOnPlan(plan) {
  planWrap.querySelectorAll('.marker').forEach(m => m.remove());
  if (!plan || !plan.image) return;
  (plan.points || []).forEach(pt => {
    const el = document.createElement('div');
    el.className = 'marker';
    el.style.left = `${pt.x}%`;
    el.style.top = `${pt.y}%`;
    el.title = pt.name;
    el.textContent = pt.panorama ? '◎' : '•';
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      state.selectedPointId = pt.id;
      persistPrefs();
      render();
    });
    planWrap.appendChild(el);
  });
}

function renderPanorama(point) {
  panoramaView.innerHTML = '';
  if (!point?.panorama) return;
  const img = document.createElement('img');
  img.src = point.panorama.image;
  panoramaView.appendChild(img);

  function drawMarkers() {
    panoramaView.querySelectorAll('.pmarker').forEach(m => m.remove());
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    (point.panorama.markers || []).forEach(m => {
      const el = document.createElement('div');
      el.className = 'marker pmarker';
      const x = (m.azimuth % 360) / 360 * w;
      const y = h / 2;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.title = `→ ${m.target_point_name || m.target_point}`;
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        state.selectedPointId = m.target_point;
        render();
      });
      panoramaView.appendChild(el);
    });
  }

  img.onload = drawMarkers;

  img.addEventListener('click', async ev => {
    if (state.activeStep !== 'transitions' || state.activeTool !== 'add-transition') return;
    const targetId = parseInt(targetPointSelect.value, 10);
    if (!targetId) return alert('Выберите целевую точку');
    const w = img.offsetWidth;
    const xfrac = ev.offsetX / w;
    const azimuth = +(xfrac * 360).toFixed(2);
    await createMarker(point.panorama.id, targetId, azimuth, 0);
  });
}

function renderWorkspace() {
  const plan = getActivePlan();
  activePlanTitle.textContent = plan ? plan.title : 'не выбран';
  planImg.src = plan?.image || '';
  planImg.style.display = plan?.image ? 'block' : 'none';
  planCanvas.classList.toggle('hidden', !plan || state.activeStep === 'transitions' && getSelectedPoint()?.panorama);
  const showPanorama = (state.activeStep === 'transitions' || state.activeStep === 'panoramas') && getSelectedPoint()?.panorama;
  panoramaCanvas.classList.toggle('hidden', !showPanorama);

  renderMarkersOnPlan(plan);
  if (showPanorama) {
    renderPanorama(getSelectedPoint());
  }
}

function renderInspector() {
  const plan = getActivePlan();
  const point = getSelectedPoint();
  // Plan inspector
  document.getElementById('inspectorPlan').classList.toggle('hidden', !plan);
  if (plan) {
    editPlanTitle.value = plan.title || '';
  }
  // Point inspector
  document.getElementById('inspectorPoint').classList.toggle('hidden', !point);
  if (point) {
    pointNameInput.value = point.name || '';
    pointXInput.value = point.x?.toFixed(2) || '';
    pointYInput.value = point.y?.toFixed(2) || '';
  }
  // Panorama inspector
  const hasPano = !!point?.panorama;
  document.getElementById('inspectorPanorama').classList.toggle('hidden', !point);
  deletePanoramaBtn.disabled = !hasPano;

  // Transitions inspector
  document.getElementById('inspectorTransitions').classList.toggle('hidden', !(hasPano && state.activeStep === 'transitions'));
  targetPointSelect.innerHTML = '';
  const panoCapable = (plan?.points || []).filter(p => p.panorama);
  if (panoCapable.length === 0) {
    targetPointSelect.innerHTML = '<option value="">Нет точек с панорамой</option>';
  } else {
    targetPointSelect.appendChild(new Option('Выберите точку', ''));
    panoCapable.forEach(p => {
      const opt = new Option(`${p.name} (${p.id})`, p.id);
      targetPointSelect.appendChild(opt);
    });
  }
  markersList.innerHTML = '';
  if (hasPano) {
    (point.panorama.markers || []).forEach(m => {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `<div><strong>${m.target_point_name || m.target_point}</strong><div class="meta">Азимут: ${m.azimuth}°</div></div>`;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.addEventListener('click', () => deleteMarker(m.id));
      div.appendChild(del);
      markersList.appendChild(div);
    });
  }

  // Verify
  document.getElementById('inspectorVerify').classList.toggle('hidden', state.activeStep !== 'verify');
  if (state.activeStep === 'verify') {
    renderVerify();
  }
}

function renderVerify() {
  const plan = getActivePlan();
  verifyResults.innerHTML = '';
  if (!plan) {
    verifyResults.innerHTML = '<div class="small">Выберите план</div>';
    return;
  }
  const problems = [];
  if (!plan.points || !plan.points.length) problems.push('У плана нет ни одной точки.');
  (plan.points || []).forEach(p => {
    if (!p.panorama) problems.push(`У точки "${p.name}" нет панорамы.`);
  });
  (plan.points || []).forEach(p => {
    (p.panorama?.markers || []).forEach(m => {
      const exists = plan.points.find(pt => pt.id === m.target_point);
      if (!exists) problems.push(`Маркер из "${p.name}" ведёт в отсутствующую точку (${m.target_point}).`);
    });
  });
  if (!problems.length) {
    verifyResults.innerHTML = '<div class="item">Все проверки пройдены ✅</div>';
    return;
  }
  problems.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'item';
    div.textContent = msg;
    verifyResults.appendChild(div);
  });
}

function renderTools() {
  toolButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tool === state.activeTool));
}

function render() {
  renderStepper();
  renderPlansList();
  renderWorkspace();
  renderInspector();
  renderTools();
  persistPrefs();
}

// --- event bindings ---
planWrap.addEventListener('click', e => {
  if (state.activeStep !== 'points' || state.activeTool !== 'add-point') return;
  const plan = getActivePlan();
  if (!plan || !plan.image) return alert('Выберите план');
  const rect = planImg.getBoundingClientRect();
  const x = +(((e.clientX - rect.left) / rect.width) * 100).toFixed(4);
  const y = +(((e.clientY - rect.top) / rect.height) * 100).toFixed(4);
  createPointOnPlan(x, y);
});

stepButtons.forEach(btn => btn.addEventListener('click', () => {
  state.activeStep = btn.dataset.step;
  render();
}));

toolButtons.forEach(btn => btn.addEventListener('click', () => {
  state.activeTool = btn.dataset.tool;
  render();
}));

planSearch.addEventListener('input', renderPlansList);
refreshPlansBtn.addEventListener('click', () => loadPlans());
createPlanBtn.addEventListener('click', () => createPlan());
savePlanTitleBtn.addEventListener('click', () => updatePlanTitle());
deletePlanBtn.addEventListener('click', () => deletePlan());

savePointBtn.addEventListener('click', () => updatePoint());
deletePointBtn.addEventListener('click', () => deletePoint());

uploadPanoramaBtn.addEventListener('click', () => {
  const point = getSelectedPoint();
  if (!point) return alert('Выберите точку');
  uploadPanorama(point.id);
});
deletePanoramaBtn.addEventListener('click', () => {
  const point = getSelectedPoint();
  if (!point?.panorama) return;
  deletePanorama(point.panorama.id);
});

// --- init ---
(async function init() {
  loadPrefs();
  const queryPlanId = getPlanIdFromQuery();
  if (queryPlanId) {
    state.selectedPlanId = queryPlanId;
    state.selectedPointId = null;
  }
  render();
  await loadPlans();
  if (state.selectedPlanId) {
    try {
      await loadPlanDetail(state.selectedPlanId);
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить выбранный план');
    }
  }
  setStatus('Готово');
})();

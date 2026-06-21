const API = {
  createPlan: '/api/evac_plans/',
  createPoint: '/api/map_points/',
  uploadPanorama: '/api/panoramas/',
  createPanoramaMarker: '/api/panorama_markers/',
  createTour: '/api/tours/'
};

const DRAG_THRESHOLD_PX = 4; // minimal move to treat as drag

const LS_KEY = 'evac_editor_state_v1';
let state = { plan: null, points: [], tours: [] };

const plan = document.getElementById('plan');
const planWrap = document.getElementById('planWrap');
const planTitle = document.getElementById('planTitle');
const planUpload = document.getElementById('planUpload');
const pointModal = document.getElementById('pointModal');
const pointName = document.getElementById('pointName');
const panoramaUpload = document.getElementById('panoramaUpload');
const savePointBtn = document.getElementById('savePointBtn');
const cancelPointBtn = document.getElementById('cancelPointBtn');
const pointsList = document.getElementById('pointsList');
const toursList = document.getElementById('toursList');
const addTourBtn = document.getElementById('addTourBtn');
const panoramaModal = document.getElementById('panoramaModal');
const panoramaView = document.getElementById('panoramaView');
const panoramaTitle = document.getElementById('panoramaTitle');
const closePanoramaBtn = document.getElementById('closePanoramaBtn');
const markerModal = document.getElementById('markerModal');
const markerModalTitle = document.getElementById('markerModalTitle');
const markerType = document.getElementById('markerType');
const markerTransitionFields = document.getElementById('markerTransitionFields');
const markerInfoFields = document.getElementById('markerInfoFields');
const markerLabel = document.getElementById('markerLabel');
const targetPlanSelect = document.getElementById('targetPlanSelect');
const targetSearch = document.getElementById('targetSearch');
const targetPointSelect = document.getElementById('targetPointSelect');
const infoLabel = document.getElementById('infoLabel');
const infoText = document.getElementById('infoText');
const infoTours = document.getElementById('infoTours');
const infoToursHint = document.getElementById('infoToursHint');
const markerSaveBtn = document.getElementById('markerSaveBtn');
const markerDeleteBtn = document.getElementById('markerDeleteBtn');
const markerCancelBtn = document.getElementById('markerCancelBtn');
const entryAzimuthPickerWrap = document.getElementById('entryAzimuthPickerWrap');
const entryAzimuthPicker = document.getElementById('entryAzimuthPicker');
const entryAzimuthPanoImg = document.getElementById('entryAzimuthPanoImg');
const entryAzimuthCursor = document.getElementById('entryAzimuthCursor');
const entryAzimuthValue = document.getElementById('entryAzimuthValue');
const entryAzimuthReset = document.getElementById('entryAzimuthReset');
const entryAzimuthNoPanoHint = document.getElementById('entryAzimuthNoPanoHint');
const entryAzimuthHint = document.getElementById('entryAzimuthHint');
// Legacy refs kept for backward compat (elements hidden via CSS)
const entryAzimuthAuto = document.getElementById('entryAzimuthAuto');
const entryAzimuthInput = document.getElementById('entryAzimuthInput');
const planCropExistingBtn = document.getElementById('planCropExistingBtn');
const panoramaCropBtn = document.getElementById('panoramaCropBtn');
const panoramaReplaceBtn = document.getElementById('panoramaReplaceBtn');
const panoramaReplaceInput = document.getElementById('panoramaReplaceInput');
const cropModal = document.getElementById('cropModal');
const cropImage = document.getElementById('cropImage');
const cropTitle = document.getElementById('cropTitle');
const cropConfirmBtn = document.getElementById('cropConfirmBtn');
const cropCancelBtn = document.getElementById('cropCancelBtn');
const cropPreview = document.getElementById('cropPreview');
const cropAspectInputs = document.querySelectorAll('input[name="cropAspect"]');

// --- Facility UI ---
const facilitySelect = document.getElementById('facilitySelect');
const facilityAssignBtn = document.getElementById('facilityAssignBtn');
const startPointSelect = document.getElementById('startPointSelect');
const startPointAssignBtn = document.getElementById('startPointAssignBtn');
const startPointHint = document.getElementById('startPointHint');
const facilitiesList = document.getElementById('facilitiesList');
const addFacilityBtn = document.getElementById('addFacilityBtn');
const facilityPlansList = document.getElementById('facilityPlansList');

let cropper = null;

let tempPointCoords = null;
let editingPoint = null;
let lastDragAt = 0;
let markerDraft = null;
let facilityState = {
  list: [],
  selectedId: null,
  selectedPlans: [],
};

// --- API helpers ---

function adminEscapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** URL панорамы точки (поддержка imageUrl и image из API/localStorage). */
function pointPanoramaUrl(point) {
  if (!point?.panorama) return null;
  return point.panorama.imageUrl || point.panorama.image || null;
}

function pointHasPanorama(point) {
  return !!pointPanoramaUrl(point);
}

/** Сравнение id сущностей из API/localStorage (число vs строка). */
function sameEntityId(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

function clickEventTargetElement(ev) {
  const t = ev.target;
  return t instanceof Element ? t : t.parentElement;
}

function getCookie(name) {
  const value = `; ${document.cookie || ''}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const csrfSafe = ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);

  if (!csrfSafe) {
    const token = getCookie('csrftoken');
    if (token) headers.set('X-CSRFToken', token);
  }

  return fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers
  });
}

async function uploadPlan(file, title = null, crop = null) {
  const form = new FormData();
  form.append('title', title || file.name);
  form.append('image', file);
  if (crop) form.append('crop', JSON.stringify(crop));
  const res = await apiFetch(API.createPlan, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Ошибка загрузки плана');
  return await res.json();
}

async function createPoint(planId, name, x, y) {
  const res = await apiFetch(API.createPoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: planId, name, x, y })
  });
  if (!res.ok) throw new Error('Ошибка создания точки');
  return await res.json();
}

async function fetchMapPointsForPlan(planId) {
  const res = await apiFetch(`${API.createPoint}?plan=${planId}`);
  if (!res.ok) throw new Error('Не удалось загрузить точки плана');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function updateMapPoint(id, payload) {
  const res = await apiFetch(`${API.createPoint}${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Ошибка обновления точки');
  return await res.json();
}

async function deleteMapPoint(id) {
  const res = await apiFetch(`${API.createPoint}${id}/`, { method: 'DELETE' });
  if (res.status === 403) {
    throw new Error('Нет прав или CSRF-токен отсутствует. Войдите как администратор.');
  }
  if (!res.ok) throw new Error('Ошибка удаления точки');
  return true;
}

async function uploadPanorama(pointId, file, crop = null) {
  const form = new FormData();
  form.append('point', pointId);
  form.append('image', file);
  if (crop) form.append('crop', JSON.stringify(crop));
  const res = await apiFetch(API.uploadPanorama, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Ошибка загрузки панорамы');
  return await res.json();
}

async function createPanoramaMarker(payload) {
  const res = await apiFetch(API.createPanoramaMarker, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Ошибка создания маркера');
  return await res.json();
}

async function updatePanoramaMarker(id, payload) {
  const res = await apiFetch(`${API.createPanoramaMarker}${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Ошибка обновления маркера');
  return await res.json();
}

async function deletePanoramaMarker(id) {
  const res = await apiFetch(`${API.createPanoramaMarker}${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Ошибка удаления маркера');
  return true;
}

async function updatePlanImage(planId, file, crop = null, title = null) {
  const form = new FormData();
  if (title) form.append('title', title);
  form.append('image', file);
  if (crop) form.append('crop', JSON.stringify(crop));
  const res = await apiFetch(`${API.createPlan}${planId}/`, { method: 'PATCH', body: form });
  if (!res.ok) throw new Error('Ошибка обновления плана');
  return await res.json();
}

async function updatePanoramaImage(panoramaId, file, crop = null) {
  const form = new FormData();
  form.append('image', file);
  if (crop) form.append('crop', JSON.stringify(crop));
  const res = await apiFetch(`${API.uploadPanorama}${panoramaId}/`, { method: 'PATCH', body: form });
  if (!res.ok) throw new Error('Ошибка обновления панорамы');
  return await res.json();
}

async function fetchTours(planId) {
  const res = await apiFetch(`${API.createTour}?plan=${planId}`);
  if (res.status === 401) throw new Error('Требуется авторизация для просмотра туров');
  if (!res.ok) throw new Error('Не удалось загрузить туры');
  return await res.json();
}

async function fetchFacilities() {
  const res = await apiFetch('/api/facilities/');
  if (!res.ok) throw new Error('Не удалось загрузить список facilities');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchFacilityDetail(id) {
  const res = await apiFetch(`/api/facilities/${id}/`);
  if (!res.ok) throw new Error('Не удалось загрузить facility');
  return await res.json();
}

async function createFacility(title) {
  const res = await apiFetch('/api/facilities/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (res.status === 403) {
    throw new Error('Нет прав. Войдите как администратор.');
  }
  if (!res.ok) throw new Error('Ошибка создания facility');
  return await res.json();
}

async function updateFacility(id, payload) {
  const res = await apiFetch(`/api/facilities/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.status === 403) {
    throw new Error('Нет прав. Войдите как администратор.');
  }
  if (!res.ok) throw new Error('Ошибка обновления facility');
  return await res.json();
}

async function deleteFacilityRequest(id) {
  const res = await apiFetch(`/api/facilities/${id}/`, { method: 'DELETE' });
  if (res.status === 403) {
    throw new Error('Нет прав. Войдите как администратор.');
  }
  if (!res.ok) throw new Error('Ошибка удаления facility');
  return true;
}

async function patchPlanFacility(planId, facilityIdOrNull) {
  const payload = { facility: facilityIdOrNull };
  const res = await apiFetch(`${API.createPlan}${planId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.status === 403) {
    throw new Error('Нет прав. Войдите как администратор.');
  }
  if (!res.ok) throw new Error('Не удалось обновить объект у плана');
  return await res.json();
}

async function patchPlanStartPoint(planId, pointIdOrNull) {
  const payload = { start_point: pointIdOrNull };
  const res = await apiFetch(`${API.createPlan}${planId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.status === 403) {
    throw new Error('Нет прав. Войдите как администратор.');
  }
  if (!res.ok) {
    let detail = 'Не удалось обновить начальную точку';
    try {
      const err = await res.json();
      if (err?.start_point) detail = Array.isArray(err.start_point) ? err.start_point.join(' ') : String(err.start_point);
      else if (err?.detail) detail = String(err.detail);
    } catch (_) { /* ignore */ }
    throw new Error(detail);
  }
  return await res.json();
}

async function createTour(planId, title, is_active = true) {
  const res = await apiFetch(API.createTour, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: planId, title, is_active })
  });
  if (!res.ok) throw new Error('Ошибка создания тура');
  return await res.json();
}

async function updateTour(id, payload) {
  const res = await apiFetch(`${API.createTour}${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Ошибка обновления тура');
  return await res.json();
}

async function deleteTourRequest(id) {
  const res = await apiFetch(`${API.createTour}${id}/`, { method: 'DELETE' });
  if (res.status === 403) {
    throw new Error('Нет прав или CSRF-токен отсутствует. Войдите как администратор.');
  }
  if (!res.ok) throw new Error('Ошибка удаления тура');
  return true;
}

async function deleteTourAction(tourId) {
  const nid = Number(tourId);
  if (!Number.isFinite(nid)) {
    alert('Некорректный идентификатор тура.');
    return;
  }
  const tour = state.tours.find(t => sameEntityId(t.id, tourId));
  const titleLabel = tour?.title ?? `ID ${nid}`;
  if (!confirm(`Удалить тур «${titleLabel}»?`)) return;
  try {
    await deleteTourRequest(nid);
    state.tours = state.tours.filter(t => !sameEntityId(t.id, tourId));
    saveState();
    renderAll();
  } catch (err) {
    alert(err.message || 'Не удалось удалить тур');
  }
}

window.deleteTour = deleteTourAction;

// --- LocalStorage ---
function loadState() {
  try { const raw = localStorage.getItem(LS_KEY); if(raw) state = JSON.parse(raw); } catch(e){console.warn(e);}
  if (planTitle) planTitle.value = state.plan?.title || '';
  if (state.plan?.id) {
    refreshTours(state.plan.id).catch(err => console.warn(err));
  }
  renderAll();
}

function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e){console.warn(e);}
}

function clearState() {
  state = { plan: null, points: [], tours: [] };
  try { localStorage.removeItem(LS_KEY); } catch (e) { console.warn(e); }
  if (planTitle) planTitle.value = '';
  renderAll();
}

async function refreshTours(planId) {
  if (!planId) { state.tours = []; return; }
  try {
    const list = await fetchTours(planId);
    state.tours = Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn(err);
    state.tours = [];
  }
  renderAll();
}

// --- Cropper helpers ---
function aspectToRatio(aspect) {
  if (aspect === '16:9') return 16 / 9;
  if (aspect === '21:9') return 21 / 9;
  return NaN;
}

function buildCropData(cropperInstance) {
  const data = cropperInstance.getData(true);
  return {
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    rotate: data.rotate || 0,
    scaleX: data.scaleX || 1,
    scaleY: data.scaleY || 1
  };
}

function closeCropper() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  cropModal.style.display = 'none';
}

async function openCropperDialog({ file, title = 'Обрезка', aspect = 'free' }) {
  return new Promise((resolve, reject) => {
    cropTitle.innerText = title;
    cropPreview.innerHTML = '';
    cropAspectInputs.forEach(input => { input.checked = input.value === aspect; });
    const url = URL.createObjectURL(file);
    cropImage.onload = () => {
      if (cropper) cropper.destroy();
      cropper = new Cropper(cropImage, {
        viewMode: 2,
        autoCropArea: 1,
        aspectRatio: aspectToRatio(aspect),
        preview: cropPreview,
      });
    };
    cropImage.src = url;
    cropModal.style.display = 'flex';

    function onAspectChange(ev) {
      if (!cropper) return;
      const ratio = aspectToRatio(ev.target.value);
      cropper.setAspectRatio(ratio);
    }
    cropAspectInputs.forEach(input => input.addEventListener('change', onAspectChange));

    const cleanup = () => {
      cropAspectInputs.forEach(input => input.removeEventListener('change', onAspectChange));
      cropConfirmBtn.onclick = null;
      cropCancelBtn.onclick = null;
    };

    const onConfirm = () => {
      if (!cropper) return;
      const cropData = buildCropData(cropper);
      cleanup();
      closeCropper();
      resolve({ file, crop: cropData });
    };
    const onCancel = () => { cleanup(); closeCropper(); reject(new Error('Обрезка отменена')); };

    cropConfirmBtn.onclick = onConfirm;
    cropCancelBtn.onclick = onCancel;
  });
}

async function fileFromUrl(url, fallbackName = 'image.jpg') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Не удалось загрузить изображение');
  const blob = await res.blob();
  const name = url.split('/').pop() || fallbackName;
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

async function loadPlanFromServer(planId) {
  const res = await fetch(`/api/evac_plans/${planId}/?include_info=1`);
  if (!res.ok) throw new Error('Не удалось загрузить план');
  const data = await res.json();

  state.plan = { id: data.id, title: data.title, imageUrl: data.image, facility_id: data.facility_id ?? null, start_point_id: data.start_point ?? null };
  state.points = (data.points || []).map(pt => ({
    id: pt.id,
    name: pt.name,
    x: pt.x,
    y: pt.y,
    info_text: pt.info_text,
    panorama: pt.panorama ? {
      id: pt.panorama.id,
      imageUrl: pt.panorama.image,
      markers: pt.panorama.markers || []
    } : null
  }));

  if (planTitle) planTitle.value = state.plan.title || '';
  await refreshTours(planId);
  await refreshFacilitiesUI().catch(err => console.warn(err));
  saveState();
  renderAll();
}

async function initFromQuery() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('new') === '1') {
    clearState();
    return true;
  }

  const planParam = params.get('plan');
  const planId = planParam ? parseInt(planParam, 10) : NaN;
  if (!Number.isFinite(planId)) return false;

  try {
    await loadPlanFromServer(planId);
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}

// --- Handlers ---
planUpload.addEventListener('change', async e => {
  const file = e.target.files[0]; if(!file) return;
  const titleFromInput = (planTitle?.value || '').trim();
  const title = titleFromInput || prompt('Введите название плана:', file.name) || file.name;
  const hasExisting = !!state.plan?.id;

  try {
    const { file: croppedFile, crop } = await openCropperDialog({ file, title: 'Обрезка плана', aspect: '16:9' });

    // Если план уже есть — предлагаем заменить картинку в текущем плане
    if (hasExisting && confirm('Заменить изображение текущего плана без пересоздания?')) {
      const updated = await updatePlanImage(state.plan.id, croppedFile, crop, titleFromInput || state.plan.title);
      state.plan = {
        id: updated.id,
        title: updated.title,
        imageUrl: updated.image,
        facility_id: updated.facility_id ?? (state.plan?.facility_id ?? null)
      };
      if (planTitle) planTitle.value = updated.title || '';
      saveState(); renderAll();
      return;
    }

    // Иначе создаём новый план
    const planData = await uploadPlan(croppedFile, title, crop);
    state.plan = { id: planData.id, title: planData.title, imageUrl: planData.image, facility_id: planData.facility_id ?? null };
    state.points = [];
    await refreshTours(state.plan.id);
    if (planTitle) planTitle.value = planData.title || '';
    saveState(); renderAll();
  } catch (err) { if (err.message !== 'Обрезка отменена') alert(err.message); console.error(err); }
});

planCropExistingBtn?.addEventListener('click', async () => {
  if (!state.plan?.id || !state.plan.imageUrl) return alert('План ещё не загружен');
  try {
    const srcFile = await fileFromUrl(state.plan.imageUrl, state.plan.title || 'plan.jpg');
    const { file: croppedFile, crop } = await openCropperDialog({ file: srcFile, title: 'Обрезка текущего плана', aspect: '16:9' });
    const updated = await updatePlanImage(state.plan.id, croppedFile, crop, state.plan.title);
    state.plan = { id: updated.id, title: updated.title, imageUrl: updated.image };
    saveState(); renderAll();
  } catch (err) { console.error(err); if (err.message !== 'Обрезка отменена') alert(err.message); }
});

addTourBtn?.addEventListener('click', async () => {
  if (!state.plan?.id) return alert('Сначала выберите план');
  const title = (prompt('Название тура', '') || '').trim();
  if (!title) return;
  const isActive = confirm('Сделать тур активным?');
  try {
    const created = await createTour(state.plan.id, title, isActive);
    state.tours.push(created);
    renderAll();
  } catch (err) {
    alert(err.message || 'Не удалось создать тур');
  }
});

planWrap.addEventListener('click', e => {
  // Игнорируем клик, который сразу следует за перетаскиванием маркера,
  // чтобы не открывать модалку создания новой точки.
  if (Date.now() - lastDragAt < 350) return;
  if (!state.plan) return alert('Сначала нужно добавить план');
  const rect = plan.getBoundingClientRect();
  tempPointCoords = {
    x: +(((e.clientX - rect.left)/rect.width)*100).toFixed(4),
    y: +(((e.clientY - rect.top)/rect.height)*100).toFixed(4)
  };
  openPointModal();
});

function openPointModal(point = null) {
  editingPoint = point;
  pointName.value = point ? point.name : '';
  panoramaUpload.value = '';
  document.getElementById('pointModalTitle').innerText = point ? 'Редактировать точку' : 'Новая точка';
  pointModal.style.display = 'flex';
}

cancelPointBtn.addEventListener('click', () => { pointModal.style.display = 'none'; tempPointCoords = null; });

savePointBtn.addEventListener('click', async () => {
  const name = pointName.value.trim() || 'Точка';
  if(editingPoint){
    // Persist point changes to server (previously it updated only UI/LocalStorage)
    try {
      const updated = await updateMapPoint(editingPoint.id, {
        name,
        x: editingPoint.x,
        y: editingPoint.y,
        info_text: editingPoint.info_text ?? ''
      });
      editingPoint.name = updated.name;
      editingPoint.x = updated.x;
      editingPoint.y = updated.y;
      editingPoint.info_text = updated.info_text;
    } catch (err) {
      alert(err.message || 'Не удалось сохранить изменения точки');
      return;
    }

    if(panoramaUpload.files.length){
      try {
        const { file: croppedFile, crop } = await openCropperDialog({
          file: panoramaUpload.files[0],
          title: 'Обрезка панорамы',
          aspect: '21:9'
        });
        const panoData = await uploadPanorama(editingPoint.id, croppedFile, crop);
        editingPoint.panorama = { id: panoData.id, imageUrl: panoData.image, markers: [] };
      } catch (err) {
        if (err.message !== 'Обрезка отменена') alert(err.message);
        return;
      }
    }
    saveState(); renderAll(); pointModal.style.display = 'none'; return;
  }
  const planId = state.plan.id; if(!planId) return alert('Сначала нужно добавить план');
  const pointData = await createPoint(planId, name, tempPointCoords.x, tempPointCoords.y);
  const point = { id: pointData.id, name: pointData.name, x: pointData.x, y: pointData.y, panorama: null };
  if(panoramaUpload.files.length){
    try {
      const { file: croppedFile, crop } = await openCropperDialog({
        file: panoramaUpload.files[0],
        title: 'Обрезка панорамы',
        aspect: '21:9'
      });
      const panoData = await uploadPanorama(point.id, croppedFile, crop);
      point.panorama = { id: panoData.id, imageUrl: panoData.image, markers: [] };
    } catch (err) {
      if (err.message !== 'Обрезка отменена') alert(err.message);
      return;
    }
  }
  state.points.push(point); saveState(); renderAll();
  pointModal.style.display = 'none'; tempPointCoords = null;
});

// --- Render ---
function renderAll() {
  plan.src = state.plan?.imageUrl || '';
  plan.style.display = state.plan?.imageUrl ? 'block':'none';
  if (planCropExistingBtn) planCropExistingBtn.style.display = state.plan?.imageUrl ? 'inline-block' : 'none';

  document.querySelectorAll('.marker').forEach(n => n.remove());
  state.points.forEach(pt => {
    const el = document.createElement('div');
    el.className = 'marker';
    el.dataset.id = pt.id;
    el.title = pt.name;
    el.innerText = '📍';
    el.style.left = pt.x+'%';
    el.style.top = pt.y+'%';
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      ev.preventDefault();
      if (el._skipClick) { el._skipClick = false; return; }
      if (el._dragging) return;
      onClickPoint(pt);
    });
    attachPlanMarkerDrag(el, pt);
    planWrap.appendChild(el);
  });

  pointsList.innerHTML = state.points.map(p => `
    <div class="admin-list-row">
      <div class="admin-list-row__meta"><b>${adminEscapeHtml(p.name)}</b> — ${p.x.toFixed(2)}%, ${p.y.toFixed(2)}%</div>
      <div class="admin-list-row__actions">
        <button type="button" data-point-action="edit" data-point-id="${p.id}">✏️</button>
        <button type="button" data-point-action="delete" data-point-id="${p.id}">🗑️</button>
        ${p.panorama ? `<button type="button" data-point-action="panorama" data-point-id="${p.id}">🖼️</button>` : ''}
      </div>
    </div>`).join('') || '<div class="small">Точек пока нет</div>';

  renderTours();
  renderStartPointSelect();
  renderFacilities();
}

function renderStartPointSelect() {
  if (!startPointSelect) return;

  const hasPlan = !!state.plan?.id;
  startPointSelect.disabled = !hasPlan;
  if (startPointAssignBtn) startPointAssignBtn.disabled = !hasPlan;

  startPointSelect.innerHTML = '';
  const autoOpt = document.createElement('option');
  autoOpt.value = '';
  autoOpt.textContent = 'Авто (первая с панорамой)';
  startPointSelect.appendChild(autoOpt);

  if (!hasPlan) {
    if (startPointHint) {
      startPointHint.textContent = 'Сначала загрузите или откройте план.';
    }
    return;
  }

  const points = state.points || [];
  const withPano = points.filter(pointHasPanorama);

  points.forEach(pt => {
    const opt = document.createElement('option');
    opt.value = String(pt.id);
    const hasPano = pointHasPanorama(pt);
    opt.textContent = hasPano
      ? (pt.name || `Точка ${pt.id}`)
      : `${pt.name || `Точка ${pt.id}`} (нет панорамы)`;
    opt.disabled = !hasPano;
    startPointSelect.appendChild(opt);
  });

  const current = state.plan?.start_point_id ?? null;
  if (current != null && withPano.some(p => Number(p.id) === Number(current))) {
    startPointSelect.value = String(current);
  } else {
    startPointSelect.value = '';
  }

  if (startPointHint) {
    if (!points.length) {
      startPointHint.textContent = 'На плане пока нет точек. Добавьте точку с панорамой.';
    } else if (!withPano.length) {
      startPointHint.textContent = 'Нет точек с панорамой — загрузите панораму хотя бы для одной точки.';
    } else {
      startPointHint.textContent = 'Выберите точку в списке и нажмите «Применить».';
    }
  }
}

function renderFacilities() {
  if (!facilitySelect || !facilitiesList || !facilityPlansList) return;

  // Select options
  facilitySelect.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = 'Без объекта';
  facilitySelect.appendChild(noneOpt);
  (facilityState.list || []).forEach(f => {
    const opt = document.createElement('option');
    opt.value = String(f.id);
    opt.textContent = f.title ? `${f.title} (ID: ${f.id})` : `Facility ${f.id}`;
    facilitySelect.appendChild(opt);
  });

  const currentPlanFacilityId = state.plan?.facility_id ?? null;
  facilitySelect.value = currentPlanFacilityId ? String(currentPlanFacilityId) : '';

  // Facilities list with actions
  if (!(facilityState.list || []).length) {
    facilitiesList.innerHTML = '<div class="small">Facilities пока не созданы</div>';
  } else {
    facilitiesList.innerHTML = facilityState.list.map(f => `
      <div class="admin-list-row">
        <div class="admin-list-row__meta">
          <b>${adminEscapeHtml(f.title)}</b> <span class="small">(ID: ${f.id})</span>
        </div>
        <div class="admin-list-row__actions">
          <button type="button" data-facility-action="select" data-facility-id="${f.id}" title="Показать планы">📋</button>
          <button type="button" data-facility-action="rename" data-facility-id="${f.id}" title="Переименовать">✏️</button>
          <button type="button" data-facility-action="delete" data-facility-id="${f.id}" title="Удалить">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  // Plans list in selected facility
  const selectedTitle = facilityState.selectedId
    ? (facilityState.list.find(x => sameEntityId(x.id, facilityState.selectedId))?.title || `ID ${facilityState.selectedId}`)
    : null;

  if (!facilityState.selectedId) {
    facilityPlansList.innerHTML = '<div class="small">Выберите объект в списке, чтобы посмотреть планы</div>';
    return;
  }

  const plans = facilityState.selectedPlans || [];
  if (!plans.length) {
    facilityPlansList.innerHTML = `<div class="small">В объекте «${adminEscapeHtml(selectedTitle)}» планов нет</div>`;
    return;
  }
  facilityPlansList.innerHTML = plans.map(p => `
    <div class="admin-list-row">
      <div class="admin-list-row__meta">
        <b>${adminEscapeHtml(p.title)}</b>
        <span class="small">этаж: ${adminEscapeHtml(p.floor)}</span>
        <span class="small">(ID: ${p.id})</span>
      </div>
    </div>
  `).join('');
}

async function refreshFacilitiesUI() {
  facilityState.list = await fetchFacilities();
  // Keep selected id if it still exists, else reset.
  if (facilityState.selectedId && !facilityState.list.find(f => sameEntityId(f.id, facilityState.selectedId))) {
    facilityState.selectedId = null;
    facilityState.selectedPlans = [];
  }
  renderFacilities();
}

function renderTours() {
  if (!toursList) return;
  if (!state.plan?.id) {
    toursList.innerHTML = '<div class="small">Сначала выберите план</div>';
    return;
  }
  if (!state.tours?.length) {
    toursList.innerHTML = '<div class="small">Туры пока не созданы</div>';
    return;
  }
  toursList.innerHTML = state.tours.map(t => `
    <div class="admin-list-row">
      <div class="admin-list-row__meta"><b>${adminEscapeHtml(t.title)}</b> ${t.is_active ? '🟢' : '⚪️'}</div>
      <div class="admin-list-row__actions">
        <button type="button" data-tour-action="rename" data-tour-id="${t.id}">✏️</button>
        <button type="button" data-tour-action="toggle" data-tour-id="${t.id}">${t.is_active ? 'Деактивировать' : 'Активировать'}</button>
        <button type="button" data-tour-action="delete" data-tour-id="${t.id}" title="Удалить тур">🗑️</button>
      </div>
    </div>
  `).join('');
}

async function renameTour(tourId) {
  const tour = state.tours.find(t => sameEntityId(t.id, tourId));
  if (!tour) {
    alert('Тур не найден в списке. Обновите страницу.');
    return;
  }
  const newTitle = (prompt('Новое название тура', tour.title) || '').trim();
  if (!newTitle || newTitle === tour.title) return;
  try {
    const updated = await updateTour(tourId, { title: newTitle });
    Object.assign(tour, updated);
    renderAll();
  } catch (err) {
    alert(err.message || 'Не удалось переименовать тур');
  }
}

async function toggleTour(tourId) {
  const tour = state.tours.find(t => sameEntityId(t.id, tourId));
  if (!tour) {
    alert('Тур не найден в списке. Обновите страницу.');
    return;
  }
  try {
    const updated = await updateTour(tourId, { is_active: !tour.is_active });
    Object.assign(tour, updated);
    renderAll();
  } catch (err) {
    alert(err.message || 'Не удалось обновить тур');
  }
}

function parseTourIds(input) {
  if (!input) return [];
  return input
    .split(/[,\\s]+/)
    .map(s => parseInt(s, 10))
    .filter(n => Number.isFinite(n));
}

function getSelectedValuesAsInt(selectEl) {
  if (!selectEl) return [];
  return Array.from(selectEl.selectedOptions || [])
    .map(opt => parseInt(opt.value, 10))
    .filter(n => Number.isFinite(n));
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function attachPlanMarkerDrag(el, point) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  const onDown = (ev) => {
    ev.stopPropagation();
    dragging = true;
    moved = false;
    startX = ev.clientX;
    startY = ev.clientY;
    el._dragging = true;
    el.setPointerCapture?.(ev.pointerId);
    el.classList.add('dragging');
  };

  const onMove = (ev) => {
    if (!dragging) return;
    const dx = Math.abs(ev.clientX - startX);
    const dy = Math.abs(ev.clientY - startY);
    if (!moved && dx < DRAG_THRESHOLD_PX && dy < DRAG_THRESHOLD_PX) return;
    moved = true;
    const rect = plan.getBoundingClientRect();
    const xPerc = clamp(((ev.clientX - rect.left) / rect.width) * 100, 0, 100);
    const yPerc = clamp(((ev.clientY - rect.top) / rect.height) * 100, 0, 100);
    el.style.left = `${xPerc}%`;
    el.style.top = `${yPerc}%`;
    el.dataset.tmpX = xPerc;
    el.dataset.tmpY = yPerc;
  };

  const onUp = async (ev) => {
    if (!dragging) return;
    dragging = false;
    el._dragging = false;
    el.classList.remove('dragging');
    el.releasePointerCapture?.(ev.pointerId);
    if (!moved) return;
    el._skipClick = true;
    lastDragAt = Date.now();
    const newX = parseFloat(el.dataset.tmpX ?? point.x);
    const newY = parseFloat(el.dataset.tmpY ?? point.y);
    try {
      const updated = await updateMapPoint(point.id, { x: newX, y: newY, name: point.name });
      point.x = updated.x;
      point.y = updated.y;
      saveState();
      renderAll();
    } catch (err) {
      alert(err.message || 'Не удалось сохранить позицию');
      renderAll();
    }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

window.editPoint = function(id){ const p = state.points.find(x => x.id===id); if(p) openPointModal(p); }
window.deletePoint = async function(id){
  if(!confirm('Удалить точку?')) return;
  try {
    await deleteMapPoint(id);
    state.points = state.points.filter(p => p.id !== id);
    // If the point is currently being edited, close the modal.
    if (editingPoint?.id === id) {
      editingPoint = null;
      tempPointCoords = null;
      pointModal.style.display = 'none';
    }
    saveState();
    renderAll();
  } catch (err) {
    alert(err.message || 'Не удалось удалить точку');
  }
}

// Called from the right-side list button (🖼️). Should behave like clicking the marker on the plan.
window.openPanoramaBtn = function(id) {
  const p = state.points.find(x => x.id === id);
  if (!p) return;
  onClickPoint(p);
}

async function onClickPoint(point){
  if(!point.panorama){
    editingPoint=point; document.getElementById('pointModalTitle').innerText='Добавить панораму для '+point.name;
    pointName.value = point.name;
    panoramaUpload.value = '';
    pointModal.style.display='flex';
    return;
  }
  await openPanorama(point);
}

// --- Panorama ---
async function openPanorama(point){
  panoramaModal.style.display = 'flex';
  panoramaTitle.innerText = 'Панорама — ' + point.name;
  panoramaView.innerHTML = '';
  const img = document.createElement('img');
  img.src = point.panorama.imageUrl;
  img.alt = point.name;
  img.style.cursor = 'crosshair';
  panoramaView.appendChild(img);

  // --- Transition target plan/points context (for marker modal) ---
  const currentPlanId = Number(state.plan?.id);
  const currentFacilityId = state.plan?.facility_id ?? null;
  let markerTargetPlans = [];
  let markerTargetPlanId = Number.isFinite(currentPlanId) ? currentPlanId : null;
  let markerTargetPoints = []; // [{id,name,has_panorama,panorama_image}]
  let currentEntryAzimuth = null; // null = auto, number = explicit angle

  function setTargetPointsSelectLoading() {
    if (!targetPointSelect) return;
    targetPointSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Загрузка точек...';
    targetPointSelect.appendChild(opt);
  }

  async function ensureMarkerTargetPlansLoaded() {
    if (!targetPlanSelect) return;
    if (markerTargetPlans.length) return;

    // If current plan is not in a facility — only current plan is available.
    if (!currentFacilityId || !Number.isFinite(Number(currentFacilityId))) {
      if (Number.isFinite(currentPlanId)) {
        markerTargetPlans = [{
          id: currentPlanId,
          title: state.plan?.title || `План ${currentPlanId}`,
          floor: null,
          image: state.plan?.imageUrl || null
        }];
      } else {
        markerTargetPlans = [];
      }
      return;
    }

    try {
      const detail = await fetchFacilityDetail(currentFacilityId);
      const plans = Array.isArray(detail?.plans) ? detail.plans : [];
      markerTargetPlans = plans.slice().sort((a, b) => {
        const fa = Number(a.floor);
        const fb = Number(b.floor);
        if (Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) return fa - fb;
        return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
      });
    } catch (err) {
      console.warn(err);
      // Fallback: allow only current plan
      markerTargetPlans = Number.isFinite(currentPlanId)
        ? [{ id: currentPlanId, title: state.plan?.title || `План ${currentPlanId}`, floor: null, image: state.plan?.imageUrl || null }]
        : [];
    }
  }

  function renderTargetPlanSelect(selectedPlanId) {
    if (!targetPlanSelect) return;
    targetPlanSelect.innerHTML = '';
    if (!markerTargetPlans.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'План недоступен';
      targetPlanSelect.appendChild(opt);
      targetPlanSelect.disabled = true;
      return;
    }
    targetPlanSelect.disabled = markerTargetPlans.length <= 1;
    markerTargetPlans.forEach(p => {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      const floor = (p.floor === null || typeof p.floor === 'undefined') ? '' : `этаж ${p.floor} — `;
      opt.textContent = `${floor}${p.title || `План ${p.id}`} (ID: ${p.id})`;
      if (sameEntityId(p.id, selectedPlanId)) opt.selected = true;
      targetPlanSelect.appendChild(opt);
    });
  }

  async function loadTargetPointsForPlan(planId) {
    const pid = parseInt(String(planId), 10);
    if (!Number.isFinite(pid)) {
      markerTargetPoints = [];
      markerTargetPlanId = null;
      return;
    }
    markerTargetPlanId = pid;
    setTargetPointsSelectLoading();
    try {
      const pts = await fetchMapPointsForPlan(pid);
      markerTargetPoints = (pts || []).map(pt => ({
        id: pt.id,
        name: pt.name,
        has_panorama: !!pt.panorama,
        panorama_image: pt.panorama?.image || null,
      }));
    } catch (err) {
      console.warn(err);
      markerTargetPoints = [];
    }
  }

  async function setTargetPlan(planId, selectedPointId = null) {
    await ensureMarkerTargetPlansLoaded();
    const effectivePlanId = Number.isFinite(parseInt(String(planId), 10))
      ? parseInt(String(planId), 10)
      : (markerTargetPlans[0]?.id ?? null);

    renderTargetPlanSelect(effectivePlanId);
    await loadTargetPointsForPlan(effectivePlanId);
    populateTargetPointsSelect(selectedPointId);
  }

  if(!point.panorama.markers || !point.panorama.markers.length){
    try{
      const res = await fetch(`/api/panorama_markers/?panorama=${point.panorama.id}`);
      point.panorama.markers = res.ok ? await res.json() : [];
    } catch(e){ console.warn(e); point.panorama.markers=[]; }
  }

  img.onload = () => renderPanMarkers();

  if (panoramaCropBtn) {
    panoramaCropBtn.onclick = async () => {
      try {
        const srcFile = await fileFromUrl(point.panorama.imageUrl, `${point.name}.jpg`);
        const { file: croppedFile, crop } = await openCropperDialog({
          file: srcFile,
          title: 'Обрезка панорамы',
          aspect: '21:9'
        });
        const updated = await updatePanoramaImage(point.panorama.id, croppedFile, crop);
        point.panorama.imageUrl = updated.image;
        point.panorama.markers = null;
        img.src = updated.image;
        try{
          const res = await fetch(`/api/panorama_markers/?panorama=${point.panorama.id}`);
          point.panorama.markers = res.ok ? await res.json() : [];
        } catch(e){ point.panorama.markers = []; }
        renderPanMarkers();
      } catch (err) {
        console.error(err);
        if (err.message !== 'Обрезка отменена') alert(err.message);
      }
    };
  }

  if (panoramaReplaceBtn && panoramaReplaceInput) {
    panoramaReplaceBtn.onclick = () => panoramaReplaceInput.click();
    panoramaReplaceInput.onchange = async ev => {
      const file = ev.target.files[0];
      panoramaReplaceInput.value = '';
      if (!file) return;
      try {
        const { file: croppedFile, crop } = await openCropperDialog({
          file,
          title: 'Новая панорама — обрезка',
          aspect: '21:9'
        });
        const updated = await updatePanoramaImage(point.panorama.id, croppedFile, crop);
        point.panorama.imageUrl = updated.image;
        point.panorama.markers = null;
        img.src = updated.image;
        try{
          const res = await fetch(`/api/panorama_markers/?panorama=${point.panorama.id}`);
          point.panorama.markers = res.ok ? await res.json() : [];
        } catch(e){ point.panorama.markers = []; }
        renderPanMarkers();
      } catch (err) {
        console.error(err);
        if (err.message !== 'Обрезка отменена') alert(err.message);
      }
    };
  }

  function attachPanoramaMarkerDrag(mp, markerData, sourcePoint){
    let dragging = false;
    let moved = false;
    let azimuth = markerData.azimuth || 0;
    let pitch = markerData.pitch || 0;
    let startX = 0;
    let startY = 0;

    const onDown = (ev) => {
      ev.stopPropagation();
      dragging = true;
      moved = false;
      startX = ev.clientX;
      startY = ev.clientY;
      mp._dragging = true;
      mp.setPointerCapture?.(ev.pointerId);
      mp.classList.add('dragging');
    };

    const onMove = (ev) => {
      if (!dragging) return;
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (!moved && dx < DRAG_THRESHOLD_PX && dy < DRAG_THRESHOLD_PX) return;
      moved = true;
      const rect = img.getBoundingClientRect();
      const localX = clamp(ev.clientX - rect.left, 0, rect.width);
      const localY = clamp(ev.clientY - rect.top, 0, rect.height);
      azimuth = +((localX / rect.width) * 360).toFixed(2);
      pitch = +((localY / rect.height) * 180 - 90).toFixed(2);
      const xpx = (azimuth % 360) / 360 * rect.width;
      const ypx = (clamp(pitch, -90, 90) + 90) / 180 * rect.height;
      mp.style.left = `${xpx}px`;
      mp.style.top = `${ypx}px`;
    };

    const onUp = async (ev) => {
      if (!dragging) return;
      dragging = false;
      mp._dragging = false;
      mp.classList.remove('dragging');
      mp.releasePointerCapture?.(ev.pointerId);
      if (!moved) return;
      mp._skipClick = true;
      try {
        const updated = await updatePanoramaMarker(markerData.id, { azimuth, pitch });
        const idx = sourcePoint.panorama.markers.findIndex(m => m.id === markerData.id);
        if (idx >= 0) sourcePoint.panorama.markers[idx] = updated;
        renderPanMarkers();
      } catch (err) {
        alert(err.message || 'Не удалось сохранить позицию метки');
        renderPanMarkers();
      }
    };

    mp.addEventListener('pointerdown', onDown);
    mp.addEventListener('pointermove', onMove);
    mp.addEventListener('pointerup', onUp);
    mp.addEventListener('pointercancel', onUp);
  }

  function renderPanMarkers(){
    panoramaView.querySelectorAll('.pmarker').forEach(n=>n.remove());
    const w = img.offsetWidth; const h = img.offsetHeight;
    (point.panorama.markers||[]).forEach(m=>{
      const mp=document.createElement('div');
      mp.className='marker pmarker';
      if(m.type === 'info') mp.classList.add('info');
      mp.style.width='22px'; mp.style.height='22px';
      mp.style.transform='translate(-50%,-50%)';
      const x = (m.azimuth%360)/360 * w;
      const y = (clamp((m.pitch ?? 0), -90, 90) + 90)/180 * h;
      mp.style.left = x+'px'; mp.style.top = y+'px';
      mp.title = m.type === 'info'
        ? (m.label || 'Информация')
        : ('→ '+(m.target_point_name||m.target_point));
      mp.addEventListener('click', async e => {
        e.stopPropagation();
        if (mp._skipClick) { mp._skipClick = false; return; }
        if (mp._dragging) return;
        await onMarkerClick(m, point);
      });
      attachPanoramaMarkerDrag(mp, m, point);
      panoramaView.appendChild(mp);
    });
  }

  function closeMarkerModal() {
    markerDraft = null;
    markerModal.style.display = 'none';
  }

  function updateMarkerTypeFieldsVisibility() {
    const isTransition = markerType.value === 'transition';
    markerTransitionFields.classList.toggle('hidden', !isTransition);
    markerInfoFields.classList.toggle('hidden', isTransition);
  }

  function populateTargetPointsSelect(selectedId = null) {
    const query = (targetSearch.value || '').trim().toLowerCase();
    const currentSelection = Number.isFinite(selectedId) ? selectedId : parseInt(targetPointSelect.value, 10);
    const points = (markerTargetPoints || []).filter(p => {
      if (!query) return true;
      return (p.name || '').toLowerCase().includes(query);
    });
    targetPointSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = points.length ? 'Выберите точку' : 'Нет подходящих точек';
    targetPointSelect.appendChild(placeholder);

    points.forEach(p => {
      const option = document.createElement('option');
      option.value = String(p.id);
      const warn = p.has_panorama ? '' : ' ⚠️ нет панорамы';
      option.textContent = p.name ? `${p.name}${warn} (ID: ${p.id})` : `Точка ${p.id}${warn}`;
      if (p.id === currentSelection) option.selected = true;
      targetPointSelect.appendChild(option);
    });
    refreshEntryAzimuthPicker();
  }

  function populateInfoToursSelect(selectedTours = []) {
    infoTours.innerHTML = '';
    if (!state.tours.length) {
      infoTours.disabled = true;
      infoToursHint.textContent = 'Туры не созданы. Метка будет доступна без привязки к туру.';
      return;
    }
    infoTours.disabled = false;
    infoToursHint.textContent = '';
    const selectedSet = new Set((selectedTours || []).map(Number).filter(Number.isFinite));
    state.tours.forEach(t => {
      const option = document.createElement('option');
      option.value = String(t.id);
      option.textContent = `${t.title}${t.is_active ? '' : ' (неактивен)'}`;
      option.selected = selectedSet.has(Number(t.id));
      infoTours.appendChild(option);
    });
  }

  function fillMarkerModalForCreate(sourcePoint, azimuth, pitch) {
    markerDraft = {
      mode: 'create',
      sourcePointId: sourcePoint.id,
      panoramaId: sourcePoint.panorama.id,
      markerId: null,
      azimuth,
      pitch
    };
    markerModalTitle.textContent = 'Новая метка';
    markerSaveBtn.textContent = 'Создать';
    markerDeleteBtn.style.display = 'none';

    markerType.value = 'transition';
    markerLabel.value = '';
    targetSearch.value = '';
    resetEntryAzimuth();
    void setTargetPlan(currentPlanId, null);

    infoLabel.value = '';
    infoText.value = '';
    const activeTourIds = (state.tours || []).filter(t => t.is_active).map(t => t.id);
    populateInfoToursSelect(activeTourIds);
    updateMarkerTypeFieldsVisibility();
  }

  function fillMarkerModalForEdit(sourcePoint, marker) {
    markerDraft = {
      mode: 'edit',
      sourcePointId: sourcePoint.id,
      panoramaId: sourcePoint.panorama.id,
      markerId: marker.id,
      azimuth: marker.azimuth,
      pitch: marker.pitch
    };
    markerModalTitle.textContent = 'Редактирование метки';
    markerSaveBtn.textContent = 'Сохранить';
    markerDeleteBtn.style.display = 'inline-block';

    markerType.value = marker.type || 'transition';
    markerLabel.value = marker.label || '';
    targetSearch.value = '';
    const planForTarget = marker.target_plan_id || currentPlanId;
    void setTargetPlan(planForTarget, marker.target_point || null);

    // Угол входа
    const hasEntry = marker.entry_azimuth != null && Number.isFinite(Number(marker.entry_azimuth));
    if (hasEntry) setEntryAzimuth(Number(marker.entry_azimuth));
    else resetEntryAzimuth();

    infoLabel.value = marker.label || '';
    infoText.value = marker.text || '';
    populateInfoToursSelect(marker.tours || []);
    updateMarkerTypeFieldsVisibility();
  }

  function collectMarkerPayload() {
    const type = markerType.value;
    if (!['transition', 'info'].includes(type)) {
      throw new Error('Некорректный тип метки');
    }
    if (type === 'transition') {
      const targetId = parseInt(targetPointSelect.value, 10);
      if (!targetId || !markerTargetPoints.find(p => p.id === targetId)) {
        throw new Error('Выберите корректную целевую точку');
      }
      // Client-side guard: selected point must belong to selected target plan.
      const selectedPlanId = parseInt(String(targetPlanSelect?.value || ''), 10);
      if (Number.isFinite(selectedPlanId) && Number.isFinite(markerTargetPlanId) && selectedPlanId !== markerTargetPlanId) {
        throw new Error('Целевая точка не соответствует выбранному плану. Обновите список и выберите заново.');
      }
      return {
        type: 'transition',
        target_point: targetId,
        label: (markerLabel.value || '').trim(),
        text: '',
        tours: [],
        entry_azimuth: currentEntryAzimuth
      };
    }

    return {
      type: 'info',
      target_point: null,
      label: (infoLabel.value || '').trim(),
      text: (infoText.value || '').trim(),
      tours: getSelectedValuesAsInt(infoTours)
    };
  }

  markerType.onchange = () => {
    updateMarkerTypeFieldsVisibility();
  };
  targetSearch.oninput = () => {
    populateTargetPointsSelect();
  };
  targetPlanSelect && (targetPlanSelect.onchange = () => {
    const pid = parseInt(targetPlanSelect.value, 10);
    void setTargetPlan(pid, null);
  });
  markerCancelBtn.onclick = closeMarkerModal;

  /** Установить явный угол входа. */
  function setEntryAzimuth(az) {
    currentEntryAzimuth = az;
    const azNorm = (((Number(az) % 360) + 360) % 360);
    if (entryAzimuthCursor) {
      entryAzimuthCursor.style.left = `${(azNorm / 360) * 100}%`;
      entryAzimuthCursor.classList.remove('hidden');
    }
    if (entryAzimuthValue) entryAzimuthValue.textContent = `${azNorm}°`;
    if (entryAzimuthReset) entryAzimuthReset.style.display = '';
    if (entryAzimuthHint) entryAzimuthHint.textContent = 'Задан явно — будет использован при переходе';
    // Sync legacy hidden input (kept for any remaining reads)
    if (entryAzimuthInput) entryAzimuthInput.value = String(azNorm);
    if (entryAzimuthAuto) entryAzimuthAuto.checked = false;
  }

  /** Сбросить угол входа в режим авто. */
  function resetEntryAzimuth() {
    currentEntryAzimuth = null;
    if (entryAzimuthCursor) entryAzimuthCursor.classList.add('hidden');
    if (entryAzimuthValue) entryAzimuthValue.textContent = 'авто';
    if (entryAzimuthReset) entryAzimuthReset.style.display = 'none';
    if (entryAzimuthHint) entryAzimuthHint.textContent = 'Авто: определяется по обратному маркеру';
    if (entryAzimuthInput) entryAzimuthInput.value = '';
    if (entryAzimuthAuto) entryAzimuthAuto.checked = true;
  }

  /** Обновить мини-панораму пикера при смене целевой точки. */
  function refreshEntryAzimuthPicker() {
    const selectedId = parseInt(targetPointSelect?.value || '', 10);
    const pt = markerTargetPoints.find(p => p.id === selectedId);
    const url = pt?.panorama_image || null;
    if (url) {
      if (entryAzimuthPanoImg) entryAzimuthPanoImg.src = url;
      entryAzimuthPickerWrap?.classList.remove('hidden');
      entryAzimuthNoPanoHint?.classList.add('hidden');
    } else {
      entryAzimuthPickerWrap?.classList.add('hidden');
      if (pt) {
        entryAzimuthNoPanoHint?.classList.remove('hidden');
      } else {
        entryAzimuthNoPanoHint?.classList.add('hidden');
      }
    }
  }

  // Клик по полосе панорамы → установить угол
  entryAzimuthPicker?.addEventListener('click', (e) => {
    const rect = entryAzimuthPicker.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const az = Math.round((x / rect.width) * 360) % 360;
    setEntryAzimuth(az);
  });

  // Кнопка «Сбросить»
  entryAzimuthReset?.addEventListener('click', () => resetEntryAzimuth());

  // Смена целевой точки → обновить пикер
  targetPointSelect?.addEventListener('change', () => refreshEntryAzimuthPicker());

  markerSaveBtn.onclick = async () => {
    if (!markerDraft) return;
    const sourcePoint = state.points.find(p => p.id === markerDraft.sourcePointId);
    if (!sourcePoint?.panorama) return;

    try {
      const payload = collectMarkerPayload();
      if (markerDraft.mode === 'create') {
        const created = await createPanoramaMarker({
          panorama: markerDraft.panoramaId,
          azimuth: markerDraft.azimuth,
          pitch: markerDraft.pitch,
          ...payload
        });
        sourcePoint.panorama.markers.push(created);
      } else {
        const updated = await updatePanoramaMarker(markerDraft.markerId, payload);
        const idx = sourcePoint.panorama.markers.findIndex(m => m.id === markerDraft.markerId);
        if (idx >= 0) sourcePoint.panorama.markers[idx] = updated;
      }
      closeMarkerModal();
      renderPanMarkers();
    } catch (err) {
      alert(err.message || 'Не удалось сохранить метку');
    }
  };

  markerDeleteBtn.onclick = async () => {
    if (!markerDraft || markerDraft.mode !== 'edit') return;
    if (!confirm('Удалить метку?')) return;
    const sourcePoint = state.points.find(p => p.id === markerDraft.sourcePointId);
    if (!sourcePoint?.panorama) return;

    try {
      await deletePanoramaMarker(markerDraft.markerId);
      sourcePoint.panorama.markers = sourcePoint.panorama.markers.filter(m => m.id !== markerDraft.markerId);
      closeMarkerModal();
      renderPanMarkers();
    } catch (err) {
      alert(err.message || 'Не удалось удалить метку');
    }
  };

  img.addEventListener('click', ev => {
    if (markerModal.style.display === 'flex') return;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const xfrac = ev.offsetX / w;
    const yfrac = ev.offsetY / (h || 1);
    const azimuth = +(xfrac * 360).toFixed(2);
    const pitch = +((clamp(yfrac, 0, 1) * 180) - 90).toFixed(2);
    fillMarkerModalForCreate(point, azimuth, pitch);
    markerModal.style.display = 'flex';
  });

  closePanoramaBtn.onclick = () => {
    panoramaModal.style.display = 'none';
    closeMarkerModal();
  };

  async function onMarkerClick(marker, sourcePoint){
    fillMarkerModalForEdit(sourcePoint, marker);
    markerModal.style.display = 'flex';
  }
}

// --- close modals on background press ---
// Note: on Safari/macOS, interacting with native <select> dropdowns can sometimes
// dispatch a "click" on the underlying overlay. Using pointerdown avoids
// accidental closes when choosing options inside a modal.
document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => {
  if (e.target !== m) return;
  if (m === cropModal) {
    closeCropper();
  } else {
    m.style.display = 'none';
  }
}));


function setupSidebarListDelegation() {
  if (!pointsList || !toursList) return;

  pointsList.addEventListener('click', (e) => {
    const btn = clickEventTargetElement(e).closest('button[data-point-action]');
    if (!btn || !pointsList.contains(btn)) return;
    const id = parseInt(btn.dataset.pointId, 10);
    if (!Number.isFinite(id)) return;
    const action = btn.dataset.pointAction;
    if (action === 'edit') window.editPoint(id);
    else if (action === 'delete') window.deletePoint(id);
    else if (action === 'panorama') window.openPanoramaBtn(id);
  });

  toursList.addEventListener('click', (e) => {
    const btn = clickEventTargetElement(e).closest('button[data-tour-action]');
    if (!btn || !toursList.contains(btn)) return;
    const id = parseInt(btn.dataset.tourId, 10);
    if (!Number.isFinite(id)) return;
    const action = btn.dataset.tourAction;
    if (action === 'rename') void renameTour(id);
    else if (action === 'toggle') void toggleTour(id);
    else if (action === 'delete') void deleteTourAction(id);
  });
}

setupSidebarListDelegation();

// Facility handlers
addFacilityBtn?.addEventListener('click', async () => {
  const title = (prompt('Название объекта', '') || '').trim();
  if (!title) return;
  try {
    const created = await createFacility(title);
    facilityState.list.push(created);
    facilityState.list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
    renderFacilities();
  } catch (err) {
    alert(err.message || 'Не удалось создать объект');
  }
});

facilityAssignBtn?.addEventListener('click', async () => {
  if (!state.plan?.id) return alert('Сначала выберите/создайте план');
  const raw = facilitySelect?.value ?? '';
  const facilityId = raw ? parseInt(raw, 10) : null;
  if (raw && !Number.isFinite(facilityId)) return alert('Некорректный объект');
  try {
    const updated = await patchPlanFacility(state.plan.id, facilityId);
    state.plan.facility_id = updated.facility_id ?? null;
    saveState();
    await refreshFacilitiesUI();
    renderAll();
  } catch (err) {
    alert(err.message || 'Не удалось назначить объект');
  }
});

startPointAssignBtn?.addEventListener('click', async () => {
  if (!state.plan?.id) return alert('Сначала выберите/создайте план');
  const raw = startPointSelect?.value ?? '';
  const pointId = raw ? parseInt(raw, 10) : null;
  if (raw && !Number.isFinite(pointId)) return alert('Некорректная точка');
  try {
    const updated = await patchPlanStartPoint(state.plan.id, pointId);
    state.plan.start_point_id = updated.start_point ?? null;
    saveState();
    renderStartPointSelect();
  } catch (err) {
    alert(err.message || 'Не удалось назначить начальную точку');
  }
});

facilitiesList?.addEventListener('click', async (e) => {
  const btn = clickEventTargetElement(e)?.closest('button[data-facility-action]');
  if (!btn || !facilitiesList.contains(btn)) return;
  const id = parseInt(btn.dataset.facilityId, 10);
  if (!Number.isFinite(id)) return;
  const action = btn.dataset.facilityAction;

  if (action === 'select') {
    try {
      facilityState.selectedId = id;
      const detail = await fetchFacilityDetail(id);
      facilityState.selectedPlans = Array.isArray(detail.plans) ? detail.plans : [];
      renderFacilities();
    } catch (err) {
      alert(err.message || 'Не удалось загрузить планы объекта');
    }
    return;
  }

  if (action === 'rename') {
    const facility = facilityState.list.find(f => sameEntityId(f.id, id));
    const currentTitle = facility?.title || '';
    const newTitle = (prompt('Новое название объекта', currentTitle) || '').trim();
    if (!newTitle || newTitle === currentTitle) return;
    try {
      const updated = await updateFacility(id, { title: newTitle });
      if (facility) Object.assign(facility, updated);
      if (sameEntityId(facilityState.selectedId, id)) {
        // keep selection; plans remain as-is
      }
      renderFacilities();
    } catch (err) {
      alert(err.message || 'Не удалось переименовать объект');
    }
    return;
  }

  if (action === 'delete') {
    const facility = facilityState.list.find(f => sameEntityId(f.id, id));
    const title = facility?.title || `ID ${id}`;
    if (!confirm(`Удалить объект «${title}»?`)) return;
    try {
      await deleteFacilityRequest(id);
      facilityState.list = facilityState.list.filter(f => !sameEntityId(f.id, id));
      if (sameEntityId(facilityState.selectedId, id)) {
        facilityState.selectedId = null;
        facilityState.selectedPlans = [];
      }
      // If current plan had this facility, refresh it from server to avoid stale UI.
      if (state.plan?.id && sameEntityId(state.plan.facility_id, id)) {
        await loadPlanFromServer(state.plan.id);
        return;
      }
      renderFacilities();
    } catch (err) {
      alert(err.message || 'Не удалось удалить объект');
    }
  }
});

(async function init() {
  const handled = await initFromQuery();
  if (!handled) loadState();
  await refreshFacilitiesUI().catch(err => console.warn(err));
  renderAll();
})();

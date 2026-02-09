const API = {
  createPlan: '/api/evac_plans/',
  createPoint: '/api/map_points/',
  uploadPanorama: '/api/panoramas/',
  createPanoramaMarker: '/api/panorama_markers/'
};

const DRAG_THRESHOLD_PX = 4; // minimal move to treat as drag

const LS_KEY = 'evac_editor_state_v1';
let state = { plan: null, points: [] };

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
const panoramaModal = document.getElementById('panoramaModal');
const panoramaView = document.getElementById('panoramaView');
const panoramaTitle = document.getElementById('panoramaTitle');
const closePanoramaBtn = document.getElementById('closePanoramaBtn');
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

let cropper = null;

let tempPointCoords = null;
let editingPoint = null;
let lastDragAt = 0;

// --- API helpers ---
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

// --- LocalStorage ---
function loadState() {
  try { const raw = localStorage.getItem(LS_KEY); if(raw) state = JSON.parse(raw); } catch(e){console.warn(e);}
  if (planTitle) planTitle.value = state.plan?.title || '';
  renderAll();
}

function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e){console.warn(e);}
}

function clearState() {
  state = { plan: null, points: [] };
  try { localStorage.removeItem(LS_KEY); } catch (e) { console.warn(e); }
  if (planTitle) planTitle.value = '';
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
  const res = await fetch(`/api/evac_plans/${planId}/`);
  if (!res.ok) throw new Error('Не удалось загрузить план');
  const data = await res.json();

  state.plan = { id: data.id, title: data.title, imageUrl: data.image };
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
      state.plan = { id: updated.id, title: updated.title, imageUrl: updated.image };
      if (planTitle) planTitle.value = updated.title || '';
      saveState(); renderAll();
      return;
    }

    // Иначе создаём новый план
    const planData = await uploadPlan(croppedFile, title, crop);
    state.plan = { id: planData.id, title: planData.title, imageUrl: planData.image };
    state.points = [];
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
    editingPoint.name = name;
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
    <div>
      <b>${p.name}</b> — ${p.x.toFixed(2)}%, ${p.y.toFixed(2)}%
      <button onclick="editPoint(${p.id})">✏️</button>
      <button onclick="deletePoint(${p.id})">🗑️</button>
      ${p.panorama ? `<button onclick="openPanoramaBtn(${p.id})">🖼️</button>` : ''}
    </div>`).join('') || '<div class="small">Точек пока нет</div>';
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

  img.addEventListener('click', async ev => {
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const xfrac = ev.offsetX / w;
    const yfrac = ev.offsetY / (h || 1);
    const azimuth = +(xfrac*360).toFixed(2);
    const pitch = +((clamp(yfrac, 0, 1) * 180) - 90).toFixed(2);
    const markerType = (prompt('Тип метки: transition (переход) или info (инфо)', 'transition') || '').trim();
    if(!['transition','info'].includes(markerType)) return alert('Некорректный тип метки');

    let targetId = null;
    let label = '';
    let text = '';

    if(markerType === 'transition'){
      const options = state.points.map(p=>`${p.id}:${p.name}`).join('\n');
      targetId = parseInt(prompt(`Выберите целевую точку (ID:Name)\n${options}`));
      if(!targetId || !state.points.find(p=>p.id===targetId)) return alert('Некорректная точка');
      label = prompt('Подпись перехода (необязательно)', '') || '';
    } else {
      label = prompt('Заголовок информационной точки', '') || '';
      text = prompt('Текст информационной точки', '') || '';
    }

    const newMarker = await createPanoramaMarker({
      panorama: point.panorama.id,
      type: markerType,
      target_point: targetId,
      azimuth,
      pitch,
      label,
      text
    });
    point.panorama.markers.push(newMarker);
    renderPanMarkers();
  });

  closePanoramaBtn.onclick = () => { panoramaModal.style.display='none'; }

  async function onMarkerClick(marker, sourcePoint){
    const action = prompt('Действие: o - перейти, e - редактировать, d - удалить', marker.type === 'transition' ? 'o' : 'e');
    if(!action) return;
    if(action.toLowerCase() === 'd'){
      if(!confirm('Удалить метку?')) return;
      try{
        await deletePanoramaMarker(marker.id);
        sourcePoint.panorama.markers = sourcePoint.panorama.markers.filter(m => m.id !== marker.id);
        renderPanMarkers();
      }catch(err){
        alert(err.message);
      }
      return;
    }
    if(action.toLowerCase() === 'o'){
      if(marker.type !== 'transition'){
        alert(marker.text || marker.label || 'Информационная метка');
        return;
      }
      const target = state.points.find(p => p.id===marker.target_point);
      if(target) openPanorama(target); else alert('Целевая точка не найдена');
      return;
    }
    if(action.toLowerCase() === 'e'){
      await editMarker(marker, sourcePoint);
    }
  }

  async function editMarker(marker, sourcePoint){
    const newType = (prompt('Тип метки (transition/info)', marker.type) || '').trim();
    if(!['transition','info'].includes(newType)) return alert('Некорректный тип');

    let payload = { type: newType };

    if(newType === 'transition'){
      const options = state.points.map(p=>`${p.id}:${p.name}`).join('\n');
      const targetId = parseInt(prompt(`Выберите целевую точку (ID:Name)\n${options}`, marker.target_point || ''));
      if(!targetId || !state.points.find(p=>p.id===targetId)) return alert('Некорректная точка');
      const label = prompt('Подпись перехода', marker.label || '') || '';
      payload = { ...payload, target_point: targetId, label, text: '' };
    } else {
      const label = prompt('Заголовок инфо-точки', marker.label || '') || '';
      const text = prompt('Текст инфо-точки', marker.text || '') || '';
      payload = { ...payload, target_point: null, label, text };
    }

    try{
      const updated = await updatePanoramaMarker(marker.id, payload);
      const idx = sourcePoint.panorama.markers.findIndex(m => m.id === marker.id);
      if(idx>=0) sourcePoint.panorama.markers[idx] = updated;
      renderPanMarkers();
    }catch(err){
      alert(err.message);
    }
  }
}

// --- close modals on background click ---
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => {
  if(e.target===m){
    if (m === cropModal) {
      closeCropper();
    } else {
      m.style.display='none';
    }
  }
}));

(async function init() {
  const handled = await initFromQuery();
  if (!handled) loadState();
})();

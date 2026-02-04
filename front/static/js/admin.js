const API = {
  createPlan: '/api/evac_plans/',
  createPoint: '/api/map_points/',
  uploadPanorama: '/api/panoramas/',
  createPanoramaMarker: '/api/panorama_markers/'
};

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

let tempPointCoords = null;
let editingPoint = null;

// --- API helpers ---
async function uploadPlan(file, title = null) {
  const form = new FormData();
  form.append('title', title || file.name);
  form.append('image', file);
  const res = await fetch(API.createPlan, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Ошибка загрузки плана');
  return await res.json();
}

async function createPoint(planId, name, x, y) {
  const res = await fetch(API.createPoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: planId, name, x, y })
  });
  if (!res.ok) throw new Error('Ошибка создания точки');
  return await res.json();
}

async function uploadPanorama(pointId, file) {
  const form = new FormData();
  form.append('point', pointId);
  form.append('image', file);
  const res = await fetch(API.uploadPanorama, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Ошибка загрузки панорамы');
  return await res.json();
}

async function createPanoramaMarker(panoramaId, targetPointId, azimuth, pitch) {
  const res = await fetch(API.createPanoramaMarker, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ panorama: panoramaId, target_point: targetPointId, azimuth, pitch })
  });
  if (!res.ok) throw new Error('Ошибка создания маркера');
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
    type: pt.type,
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
  try {
    const planData = await uploadPlan(file, title);
    state.plan = { id: planData.id, title: planData.title, imageUrl: planData.image };
    state.points = [];
    if (planTitle) planTitle.value = planData.title || '';
    saveState(); renderAll();
  } catch (err) { alert(err.message); console.error(err); }
});

planWrap.addEventListener('click', e => {
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
      const panoData = await uploadPanorama(editingPoint.id, panoramaUpload.files[0]);
      editingPoint.panorama = { id: panoData.id, imageUrl: panoData.image, markers: [] };
    }
    saveState(); renderAll(); pointModal.style.display = 'none'; return;
  }
  const planId = state.plan.id; if(!planId) return alert('Сначала нужно добавить план');
  const pointData = await createPoint(planId, name, tempPointCoords.x, tempPointCoords.y);
  const point = { id: pointData.id, name: pointData.name, x: pointData.x, y: pointData.y, panorama: null };
  if(panoramaUpload.files.length){
    const panoData = await uploadPanorama(point.id, panoramaUpload.files[0]);
    point.panorama = { id: panoData.id, imageUrl: panoData.image, markers: [] };
  }
  state.points.push(point); saveState(); renderAll();
  pointModal.style.display = 'none'; tempPointCoords = null;
});

// --- Render ---
function renderAll() {
  plan.src = state.plan?.imageUrl || '';
  plan.style.display = state.plan?.imageUrl ? 'block':'none';

  document.querySelectorAll('.marker').forEach(n => n.remove());
  state.points.forEach(pt => {
    const el = document.createElement('div');
    el.className = 'marker';
    el.dataset.id = pt.id;
    el.title = pt.name;
    el.innerText = '📍';
    el.style.left = pt.x+'%';
    el.style.top = pt.y+'%';
    el.addEventListener('click', ev => { ev.stopPropagation(); onClickPoint(pt); });
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

window.editPoint = function(id){ const p = state.points.find(x => x.id===id); if(p) openPointModal(p); }
window.deletePoint = function(id){ if(!confirm('Удалить точку?')) return; state.points=state.points.filter(p=>p.id!==id); saveState(); renderAll(); }

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

  function renderPanMarkers(){
    panoramaView.querySelectorAll('.pmarker').forEach(n=>n.remove());
    const w = img.offsetWidth; const h = img.offsetHeight;
    (point.panorama.markers||[]).forEach(m=>{
      const mp=document.createElement('div');
      mp.className='marker pmarker';
      mp.style.width='22px'; mp.style.height='22px';
      mp.style.transform='translate(-50%,-50%)';
      const x = (m.azimuth%360)/360 * w;
      const y = h/2;
      mp.style.left = x+'px'; mp.style.top = y+'px';
      mp.title = '→ '+(m.target_point_name||m.target_point);
      mp.addEventListener('click', e => { e.stopPropagation();
        const target = state.points.find(p => p.id===m.target_point);
        if(target) openPanorama(target); else alert('Целевая точка не найдена');
      });
      panoramaView.appendChild(mp);
    });
  }

  img.addEventListener('click', async ev => {
    const w = img.offsetWidth;
    const xfrac = ev.offsetX / w;
    const azimuth = +(xfrac*360).toFixed(2);
    const pitch = 0;
    const options = state.points.map(p=>`${p.id}:${p.name}`).join('\n');
    const targetId = parseInt(prompt(`Выберите целевую точку (ID:Name)\n${options}`));
    if(!targetId || !state.points.find(p=>p.id===targetId)) return alert('Некорректная точка');
    const newMarker = await createPanoramaMarker(point.panorama.id,targetId,azimuth,pitch);
    point.panorama.markers.push(newMarker);
    renderPanMarkers();
  });

  closePanoramaBtn.onclick = () => { panoramaModal.style.display='none'; }
}

// --- close modals on background click ---
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if(e.target===m) m.style.display='none'; }));

(async function init() {
  const handled = await initFromQuery();
  if (!handled) loadState();
})();

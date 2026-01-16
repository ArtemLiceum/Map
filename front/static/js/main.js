const TOURS_API = '/api/evac_plans/';
const toursContainer = document.getElementById('toursContainer');
const toursStatus = document.getElementById('toursStatus');

function setStatus(text, isError = false) {
  if (!toursStatus) return;
  toursStatus.textContent = text;
  toursStatus.classList.toggle('text-danger', isError);
}

function renderEmpty(message) {
  if (!toursContainer) return;
  toursContainer.innerHTML = '';
  const placeholder = document.createElement('div');
  placeholder.className = 'col-12 text-muted small';
  placeholder.textContent = message;
  toursContainer.appendChild(placeholder);
}

function normalizeTours(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function renderTours(tours) {
  if (!toursContainer) return;
  toursContainer.innerHTML = '';

  tours.forEach(tour => {
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-md-4 col-lg-3';

    const card = document.createElement('div');
    card.className = 'card h-100 shadow-sm tour-card';
    card.setAttribute('role', 'button');

    if (tour.image) {
      const img = document.createElement('img');
      img.src = tour.image;
      img.alt = tour.title || 'Тур';
      img.className = 'card-img-top';
      img.style.height = '180px';
      img.style.objectFit = 'cover';
      card.appendChild(img);
    } else {
      const stub = document.createElement('div');
      stub.className = 'card-img-top bg-light d-flex align-items-center justify-content-center text-muted';
      stub.style.height = '180px';
      stub.textContent = 'Нет изображения';
      card.appendChild(stub);
    }

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h6');
    title.className = 'card-title mb-1';
    title.textContent = tour.title || 'Без названия';
    body.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'card-text text-muted small mb-0';
    meta.textContent = `ID: ${tour.id ?? '—'}`;
    body.appendChild(meta);

    card.appendChild(body);
    card.addEventListener('click', () => {
      if (tour.id == null) return;
      window.location.href = `/tour/${tour.id}/`;
    });

    col.appendChild(card);
    toursContainer.appendChild(col);
  });
}

async function loadTours() {
  setStatus('Загрузка...');
  try {
    const res = await fetch(TOURS_API);
    if (!res.ok) throw new Error('Не удалось загрузить туры');
    const data = await res.json();
    const tours = normalizeTours(data);
    if (!tours.length) {
      renderEmpty('Туры пока не добавлены.');
      setStatus('Нет туров');
      return;
    }
    renderTours(tours);
    setStatus(`Найдено туров: ${tours.length}`);
  } catch (error) {
    console.error(error);
    renderEmpty('Не удалось загрузить туры. Попробуйте обновить страницу.');
    setStatus(error.message || 'Ошибка загрузки', true);
  }
}

if (toursContainer) {
  loadTours();
}

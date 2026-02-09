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
    headers,
  });
}

const API = {
  users: '/api/users/',
};

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');
const usersTableBody = document.querySelector('#usersTable tbody');
const stateMessage = document.getElementById('stateMessage');

function setStateMessage(text, show = true) {
  stateMessage.textContent = text;
  stateMessage.style.display = show ? 'block' : 'none';
}

async function loadUsers(query = '') {
  usersTableBody.innerHTML = '';
  setStateMessage('Загрузка...', true);
  try {
    const url = query ? `${API.users}?search=${encodeURIComponent(query)}` : API.users;
    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Ошибка загрузки пользователей');
    const data = await res.json();
    renderUsers(data);
  } catch (err) {
    console.error(err);
    setStateMessage('Не удалось загрузить пользователей.');
  }
}

function renderUsers(users) {
  setStateMessage('', false);
  if (!users.length) {
    setStateMessage('Пользователи не найдены.', true);
    return;
  }

  users.forEach((user) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${user.username}</td>
      <td>${user.email || ''}</td>
      <td>${[user.last_name, user.first_name].filter(Boolean).join(' ')}</td>
      <td>${user.is_active ? '<span class="status-pill green">Да</span>' : '<span class="status-pill gray">Нет</span>'}</td>
      <td>${user.is_staff ? '<span class="status-pill orange">Да</span>' : '<span class="status-pill gray">Нет</span>'}</td>
      <td>${user.is_superuser ? '<span class="status-pill orange">Да</span>' : '<span class="status-pill gray">Нет</span>'}</td>
    `;
    tr.addEventListener('click', () => {
      window.location.href = `/admin/users/${user.id}/`;
    });
    usersTableBody.appendChild(tr);
  });
}

searchBtn.addEventListener('click', () => {
  loadUsers(searchInput.value.trim());
});

resetBtn.addEventListener('click', () => {
  searchInput.value = '';
  loadUsers();
});

searchInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') {
    loadUsers(searchInput.value.trim());
  }
});

// Initial load
loadUsers();

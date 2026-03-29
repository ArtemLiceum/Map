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
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers,
  });
}

const API = {
  users: '/api/users/',
  groups: '/api/groups/',
  permissions: '/api/permissions/',
};

const usernameEl = document.getElementById('username');
const emailEl = document.getElementById('email');
const firstNameEl = document.getElementById('firstName');
const lastNameEl = document.getElementById('lastName');
const isActiveEl = document.getElementById('isActive');
const isStaffEl = document.getElementById('isStaff');
const isSuperuserEl = document.getElementById('isSuperuser');
const dateJoinedEl = document.getElementById('dateJoined');
const lastLoginEl = document.getElementById('lastLogin');
const groupsSelect = document.getElementById('groupsSelect');
const permissionsSelect = document.getElementById('permissionsSelect');
const permSearchInput = document.getElementById('permSearch');
const saveUserBtn = document.getElementById('saveUserBtn');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const newPasswordEl = document.getElementById('newPassword');
const newPasswordConfirmEl = document.getElementById('newPasswordConfirm');
const globalErrorEl = document.getElementById('globalError');
const passwordErrorEl = document.getElementById('passwordError');
const tourProgressState = document.getElementById('tourProgressState');
const tourProgressTable = document.getElementById('tourProgressTable');
const tourProgressTableBody = document.querySelector('#tourProgressTable tbody');

let permissionsCache = [];

function showError(el, message) {
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function populateUser(user) {
  usernameEl.value = user.username || '';
  emailEl.value = user.email || '';
  firstNameEl.value = user.first_name || '';
  lastNameEl.value = user.last_name || '';
  isActiveEl.checked = !!user.is_active;
  isStaffEl.checked = !!user.is_staff;
  isSuperuserEl.checked = !!user.is_superuser;
  dateJoinedEl.value = formatDate(user.date_joined);
  lastLoginEl.value = formatDate(user.last_login);

  setSelected(groupsSelect, user.groups || []);
  setSelected(permissionsSelect, user.user_permissions || []);
}

function setSelected(selectEl, ids) {
  const set = new Set(ids);
  [...selectEl.options].forEach((opt) => {
    opt.selected = set.has(Number(opt.value));
  });
}

async function loadUser() {
  const res = await apiFetch(`${API.users}${window.USER_ID}/`);
  if (!res.ok) throw new Error('Не удалось загрузить пользователя');
  return res.json();
}

async function loadGroups() {
  const res = await apiFetch(API.groups);
  if (!res.ok) throw new Error('Не удалось загрузить группы');
  return res.json();
}

async function loadPermissions(search = '') {
  const url = search ? `${API.permissions}?search=${encodeURIComponent(search)}` : API.permissions;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Не удалось загрузить права');
  return res.json();
}

async function loadTourProgress() {
  const res = await apiFetch(`${API.users}${window.USER_ID}/tour-progress/`);
  if (!res.ok) throw new Error('Не удалось загрузить прогресс туров');
  return res.json();
}

function renderGroups(groups) {
  groupsSelect.innerHTML = '';
  groups.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    groupsSelect.appendChild(opt);
  });
}

function renderPermissions(perms) {
  permissionsSelect.innerHTML = '';
  perms.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const label = p.app_label ? `${p.app_label} | ${p.codename}` : p.codename;
    opt.textContent = `${label} — ${p.name}`;
    permissionsSelect.appendChild(opt);
  });
}

async function bootstrap() {
  try {
    const [user, groups, perms, tourProgress] = await Promise.all([
      loadUser(),
      loadGroups(),
      loadPermissions(),
      loadTourProgress(),
    ]);
    permissionsCache = perms;
    renderGroups(groups);
    renderPermissions(permissionsCache);
    populateUser(user);
    renderTourProgress(tourProgress);
  } catch (err) {
    console.error(err);
    showError(globalErrorEl, err.message || 'Ошибка загрузки данных');
  }
}

function renderTourProgress(rows) {
  if (!tourProgressState || !tourProgressTable || !tourProgressTableBody) return;
  const data = Array.isArray(rows) ? rows : [];
  tourProgressTableBody.innerHTML = '';
  if (!data.length) {
    tourProgressState.textContent = 'Данных о прогрессе пока нет.';
    tourProgressTable.style.display = 'none';
    return;
  }
  tourProgressState.textContent = '';
  tourProgressTable.style.display = 'table';
  data.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.plan_title || ''}</td>
      <td>${item.tour_title || ''}</td>
      <td>${Number(item.viewed || 0)}/${Number(item.total || 0)}</td>
      <td>${Number(item.percent || 0)}%</td>
      <td>${formatDate(item.last_viewed_at) || '—'}</td>
    `;
    tourProgressTableBody.appendChild(tr);
  });
}

function collectSelected(selectEl) {
  return [...selectEl.selectedOptions].map((o) => Number(o.value));
}

async function saveUser() {
  saveUserBtn.disabled = true;
  showError(globalErrorEl, '');
  try {
    const payload = {
      username: usernameEl.value.trim(),
      email: emailEl.value.trim(),
      first_name: firstNameEl.value.trim(),
      last_name: lastNameEl.value.trim(),
      is_active: isActiveEl.checked,
      is_staff: isStaffEl.checked,
      is_superuser: isSuperuserEl.checked,
      groups: collectSelected(groupsSelect),
      user_permissions: collectSelected(permissionsSelect),
    };

    const res = await apiFetch(`${API.users}${window.USER_ID}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw formatApiErrors(error);
    }
  } catch (err) {
    showError(globalErrorEl, err.message || 'Ошибка сохранения');
    return;
  } finally {
    saveUserBtn.disabled = false;
  }
  showError(globalErrorEl, '');
  alert('Сохранено');
}

function formatApiErrors(errorBody) {
  if (typeof errorBody === 'string') return new Error(errorBody);
  if (Array.isArray(errorBody)) return new Error(errorBody.join(', '));
  const messages = [];
  for (const key in errorBody) {
    const val = errorBody[key];
    if (Array.isArray(val)) {
      messages.push(`${key}: ${val.join(', ')}`);
    } else if (typeof val === 'string') {
      messages.push(`${key}: ${val}`);
    }
  }
  return new Error(messages.join(' | ') || 'Ошибка');
}

async function changePassword() {
  changePasswordBtn.disabled = true;
  showError(passwordErrorEl, '');
  try {
    const payload = {
      new_password: newPasswordEl.value,
      new_password_confirm: newPasswordConfirmEl.value,
    };
    const res = await apiFetch(`${API.users}${window.USER_ID}/set-password/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw formatApiErrors(error);
    }
    newPasswordEl.value = '';
    newPasswordConfirmEl.value = '';
    alert('Пароль обновлён');
  } catch (err) {
    showError(passwordErrorEl, err.message || 'Ошибка смены пароля');
  } finally {
    changePasswordBtn.disabled = false;
  }
}

saveUserBtn.addEventListener('click', saveUser);
changePasswordBtn.addEventListener('click', changePassword);

permSearchInput.addEventListener('keyup', async (e) => {
  if (e.key === 'Enter') {
    try {
      const perms = await loadPermissions(permSearchInput.value.trim());
      permissionsCache = perms;
      renderPermissions(permissionsCache);
      // Keep previous selections where possible
    } catch (err) {
      showError(globalErrorEl, err.message || 'Ошибка поиска прав');
    }
  }
});

// Initial load
bootstrap();

# Руководство по разработке - Map Virtual Tours

## Обзор архитектуры

Проект Map построен на микросервисной архитектуре с разделением на backend (Django REST API) и frontend (Vanilla JavaScript). Это обеспечивает:

- **Независимость** - backend и frontend могут развиваться отдельно
- **Масштабируемость** - API может использоваться разными клиентами
- **Тестируемость** - backend можно тестировать через API
- **Производительность** - статические файлы обслуживаются отдельно

## Backend Architecture

### Django Settings

Проект использует модульную конфигурацию настроек:

```python
# map_core/settings.py
from .config import (
    UPDATE_LAST_LOGIN,
    ROTATE_REFRESH_TOKENS,
    BLACKLIST_AFTER_ROTATION,
    ACCESS_TOKEN_LIFETIME,
    REFRESH_TOKEN_LIFETIME,
    SIGNING_KEY,
    DB_ENGINE,
    DB_HOST,
    DB_NAME,
    DB_PASSWORD,
    DB_PORT,
    DB_USER,
    DEBUG,
)
```

**Рекомендации:**
- Все чувствительные данные хранить в переменных окружения
- Использовать разные настройки для development/production
- Валидировать переменные окружения при запуске

### Модели данных

```python
# map_api/models.py

class EvacPlan(models.Model):
    """План эвакуации (карта здания)"""
    title = models.CharField(max_length=200)
    image = models.ImageField(upload_to='evac_plans/')
    created_at = models.DateTimeField(auto_now_add=True)

class MapPoint(models.Model):
    """Точка на плане эвакуации, переходящая в панораму"""
    plan = models.ForeignKey(EvacPlan, related_name='points', on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    x = models.FloatField(help_text="Координата X в процентах (0–100)")
    y = models.FloatField(help_text="Координата Y в процентах (0–100)")

class Panorama(models.Model):
    """Панорамное изображение, связанное с точкой"""
    point = models.OneToOneField(MapPoint, related_name='panorama', on_delete=models.CASCADE)
    image = models.ImageField(upload_to='panoramas/')

class PanoramaMarker(models.Model):
    """Метка в панораме для перехода к следующей точке"""
    panorama = models.ForeignKey(Panorama, related_name='markers', on_delete=models.CASCADE)
    target_point = models.ForeignKey(MapPoint, on_delete=models.CASCADE)
    azimuth = models.FloatField(help_text="Угол (в градусах) направления на маркер")
    pitch = models.FloatField(help_text="Угол (в градусах) по вертикали")
```

**Архитектурные решения:**
- **OneToOneField** для Panorama-Point гарантирует одну панораму на точку
- **ForeignKey** для PanoramaMarker позволяет множественные переходы
- **FloatField** для координат обеспечивает точность до сотых долей процента
- **related_name** упрощает доступ к связанным объектам

### API Design

```python
# map_api/views.py
from rest_framework import viewsets
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker
from .serializers import (
    EvacPlanSerializer, MapPointSerializer,
    PanoramaSerializer, PanoramaMarkerSerializer
)

class EvacPlanViewSet(viewsets.ModelViewSet):
    queryset = EvacPlan.objects.all()
    serializer_class = EvacPlanSerializer

class MapPointViewSet(viewsets.ModelViewSet):
    queryset = MapPoint.objects.select_related('plan').all()
    serializer_class = MapPointSerializer

class PanoramaViewSet(viewsets.ModelViewSet):
    queryset = Panorama.objects.select_related('point').all()
    serializer_class = PanoramaSerializer

class PanoramaMarkerViewSet(viewsets.ModelViewSet):
    queryset = PanoramaMarker.objects.select_related('panorama', 'target_point').all()
    serializer_class = PanoramaMarkerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        panorama_id = self.request.query_params.get('panorama')
        if panorama_id:
            qs = qs.filter(panorama_id=panorama_id)
        return qs
```

**Рекомендации:**
- Использовать `select_related` для оптимизации запросов
- Фильтровать queryset по параметрам запроса
- Документировать API через docstrings

### Сериализаторы

```python
# map_api/serializers.py
from rest_framework import serializers
from .models import EvacPlan, MapPoint, Panorama, PanoramaMarker

class PanoramaMarkerSerializer(serializers.ModelSerializer):
    target_point_name = serializers.CharField(source='target_point.name', read_only=True)

    class Meta:
        model = PanoramaMarker
        fields = ['id', 'panorama', 'target_point', 'target_point_name', 'azimuth', 'pitch']

class PanoramaSerializer(serializers.ModelSerializer):
    markers = PanoramaMarkerSerializer(many=True, read_only=True)

    class Meta:
        model = Panorama
        fields = ['id', 'point', 'image', 'markers']

class MapPointSerializer(serializers.ModelSerializer):
    panorama = PanoramaSerializer(read_only=True)

    class Meta:
        model = MapPoint
        fields = ['id', 'plan', 'name', 'x', 'y', 'panorama']

class EvacPlanSerializer(serializers.ModelSerializer):
    points = MapPointSerializer(many=True, read_only=True)

    class Meta:
        model = EvacPlan
        fields = ['id', 'title', 'image', 'points', 'created_at']
```

**Архитектурные решения:**
- **Nested serializers** для автоматического включения связанных данных
- **Read-only поля** для вычисляемых значений (target_point_name)
- **Many=True** для списков связанных объектов

## Frontend Architecture

### State Management

```javascript
// front/static/js/admin.js
let state = {
  plans: [],              // Все планы из API
  selectedPlanId: null,   // Выбранный план
  selectedPointId: null,  // Выбранная точка
  activeStep: 'plan',     // Текущий шаг мастера
  activeTool: 'view',     // Активный инструмент
  loading: false          // Флаг загрузки
};

// Источник истины - API, localStorage только для UI-состояния
function persistPrefs() {
  const prefs = {
    selectedPlanId: state.selectedPlanId,
    activeStep: state.activeStep,
    activeTool: state.activeTool
  };
  localStorage.setItem(LS_KEY, JSON.stringify(prefs));
}
```

**Принципы:**
- **Single source of truth** - данные всегда из API
- **Optimistic updates** - UI обновляется сразу, rollback при ошибке
- **Loading states** - пользователь видит статус операций

### API Layer

```javascript
// Универсальный fetch helper
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Ошибка запроса');
  }
  return await res.json();
}

// CRUD операции
async function loadPlans() {
  const plans = await fetchJson(API.plans);
  state.plans = plans;
  render();
}

async function createPlan() {
  const form = new FormData();
  form.append('title', planTitleInput.value);
  form.append('image', planUploadInput.files[0]);

  const plan = await fetchJson(API.plans, { method: 'POST', body: form });
  await loadPlans(); // Refetch для консистентности
  state.selectedPlanId = plan.id;
}
```

### UI Components

#### Мастер (Wizard)

```html
<!-- Шаги мастера -->
<nav class="stepper">
  <button data-step="plan">1. План</button>
  <button data-step="points">2. Точки</button>
  <button data-step="panoramas">3. Панорамы</button>
  <button data-step="transitions">4. Переходы</button>
  <button data-step="verify">5. Проверка</button>
</nav>

<!-- Layout с областями -->
<div class="layout">
  <aside class="sidebar"><!-- Список планов + создание --></aside>
  <main class="workspace"><!-- Canvas + toolbar --></main>
  <aside class="inspector"><!-- Свойства объектов --></aside>
</div>
```

#### Toolbar и инструменты

```html
<div class="toolbar">
  <div class="tools-group">
    <span class="label">Режим</span>
    <button data-tool="view" class="tool-btn active">Просмотр</button>
    <button data-tool="add-point" class="tool-btn">Добавить точку</button>
    <button data-tool="add-transition" class="tool-btn">Добавить переход</button>
  </div>
</div>
```

#### Инспектор свойств

```html
<aside class="inspector">
  <!-- План -->
  <div id="inspectorPlan">
    <input id="editPlanTitle" placeholder="Название плана">
    <button id="savePlanTitleBtn">Сохранить</button>
    <button id="deletePlanBtn">Удалить план</button>
  </div>

  <!-- Точка -->
  <div id="inspectorPoint">
    <input id="pointNameInput" placeholder="Название точки">
    <input id="pointX" type="number" step="0.01" disabled>
    <input id="pointY" type="number" step="0.01" disabled>
    <button id="savePointBtn">Сохранить</button>
    <button id="deletePointBtn">Удалить</button>
  </div>

  <!-- Панорама -->
  <div id="inspectorPanorama">
    <input id="panoramaUpload" type="file">
    <button id="uploadPanoramaBtn">Загрузить</button>
    <button id="deletePanoramaBtn">Удалить</button>
  </div>

  <!-- Переходы -->
  <div id="inspectorTransitions">
    <select id="targetPointSelect">
      <option value="">Выберите точку</option>
    </select>
    <div id="markersList"><!-- Список маркеров --></div>
  </div>
</aside>
```

## Рабочие процессы разработки

### Добавление новой сущности

1. **Модель** → `map_api/models.py`
2. **Миграция** → `python manage.py makemigrations`
3. **Сериализатор** → `map_api/serializers.py`
4. **ViewSet** → `map_api/views.py`
5. **URL** → `map_api/urls.py`
6. **Frontend API** → `front/static/js/admin.js`
7. **UI компоненты** → HTML + CSS + JS

### Добавление нового поля

1. **Модель** → добавить поле
2. **Миграция** → создать и применить
3. **Сериализатор** → добавить поле в `fields`
4. **Frontend** → обновить формы и обработку

### Изменение бизнес-логики

1. **Backend** → обновить views/serializers
2. **Frontend** → обновить API calls и UI
3. **Тесты** → обновить тестовые данные

## Тестирование

### Backend тесты

```python
# map_api/tests.py
from django.test import TestCase
from rest_framework.test import APITestCase
from .models import EvacPlan

class EvacPlanTestCase(APITestCase):
    def setUp(self):
        self.plan_data = {'title': 'Test Plan'}

    def test_create_plan(self):
        response = self.client.post('/api/evac_plans/', self.plan_data)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(EvacPlan.objects.count(), 1)

    def test_get_plans(self):
        response = self.client.get('/api/evac_plans/')
        self.assertEqual(response.status_code, 200)
```

### Frontend тесты

```javascript
// Простые интеграционные тесты
describe('Plan Creation', () => {
  it('should create plan via API', async () => {
    const form = new FormData();
    form.append('title', 'Test Plan');
    form.append('image', testImage);

    const response = await fetch('/api/evac_plans/', {
      method: 'POST',
      body: form
    });

    expect(response.statusCode).toBe(201);
    const plan = await response.json();
    expect(plan.title).toBe('Test Plan');
  });
});
```

## Деплоймент

### Development

```bash
# Запуск с авто-перезагрузкой
python manage.py runserver

# С отладкой SQL-запросов
python manage.py runserver --settings=map_core.settings_debug
```

### Production

```bash
# Сбор статических файлов
python manage.py collectstatic

# Запуск через Gunicorn
gunicorn map_core.wsgi:application --bind 0.0.0.0:8000

# Через Docker
docker build -t map-app .
docker run -p 8000:8000 map-app
```

### Nginx конфигурация

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /media/ {
        alias /path/to/media/;
        expires 1y;
    }

    location /static/ {
        alias /path/to/staticfiles/;
        expires 1y;
    }
}
```

## Мониторинг и логирование

### Django logging

```python
# settings.py
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': 'django_errors.log',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level': 'ERROR',
            'propagate': True,
        },
    },
}
```

### API мониторинг

- **Django Debug Toolbar** для development
- **Sentry** для production error tracking
- **Health checks** endpoints для monitoring систем

## Безопасность

### Валидация входных данных

```python
# serializers.py
class MapPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = MapPoint
        fields = ['id', 'plan', 'name', 'x', 'y']

    def validate_x(self, value):
        if not (0 <= value <= 100):
            raise serializers.ValidationError("X must be between 0 and 100")
        return value

    def validate_y(self, value):
        if not (0 <= value <= 100):
            raise serializers.ValidationError("Y must be between 0 and 100")
        return value
```

### Защита от CSRF

```python
# settings.py
MIDDLEWARE = [
    'django.middleware.csrf.CsrfViewMiddleware',
    ...
]

# Для API
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
}
```

### Безопасная загрузка файлов

```python
# models.py
def validate_image_file(value):
    if value.size > 10 * 1024 * 1024:  # 10MB
        raise ValidationError("File too large")
    if not value.name.lower().endswith(('.jpg', '.jpeg', '.png')):
        raise ValidationError("Unsupported file type")
    return value

class EvacPlan(models.Model):
    image = models.ImageField(
        upload_to='evac_plans/',
        validators=[validate_image_file]
    )
```

## Производительность

### Оптимизации базы данных

```python
# views.py
class MapPointViewSet(viewsets.ModelViewSet):
    queryset = MapPoint.objects.select_related('plan', 'panorama').prefetch_related('panorama__markers').all()
```

### Кэширование

```python
# settings.py
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/',
    }
}
```

### CDN для статических файлов

```python
# settings.py (production)
AWS_S3_CUSTOM_DOMAIN = 'cdn.yourdomain.com'
STATIC_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/static/'
MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/media/'
```

## Заключение

Архитектура проекта обеспечивает:
- **Масштабируемость** через REST API
- **Поддерживаемость** через модульную структуру
- **Надежность** через валидацию и обработку ошибок
- **Производительность** через оптимизации запросов

Для дальнейшего развития рекомендуется:
- Добавить unit и integration тесты
- Внедрить CI/CD пайплайн
- Настроить мониторинг и логирование
- Рассмотреть использование TypeScript для frontend
- Добавить кэширование и CDN
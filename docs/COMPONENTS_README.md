Компонентная диаграмма проекта Map

Файлы:
- `docs/component_diagram.puml` — диаграмма в формате PlantUML.
- `docs/COMPONENTS_README.md` — этот файл, краткое пояснение и инструкции по рендеру.

## Архитектура проекта

Проект Map представляет собой веб-приложение для создания и просмотра интерактивных виртуальных туров по зданиям университета. Архитектура построена на принципах разделения ответственности между backend и frontend.

### Основные компоненты

#### 1. map_core (Django проект)
- **Назначение**: Центральный проект Django, объединяющий все приложения
- **Ключевые файлы**:
  - `map_core/settings.py` — конфигурация проекта (БД, статические файлы, API, аутентификация)
  - `map_core/urls.py` — корневые маршруты: `/api/` → REST API, `''` → frontend страницы
  - `map_core/config.py` — конфигурация из переменных окружения (JWT, БД)
- **Точки входа**: `manage.py`, `wsgi.py`/`asgi.py`

#### 2. map_api (Django приложение - REST API)
- **Назначение**: Backend API для управления данными виртуальных туров
- **Ключевые файлы**:
  - `map_api/models.py` — модели данных (EvacPlan, MapPoint, Panorama, PanoramaMarker)
  - `map_api/views.py` — ViewSet'ы для CRUD операций
  - `map_api/serializers.py` — сериализаторы для API responses/requests
  - `map_api/urls.py` — маршруты API endpoints
- **Особенности**:
  - Полный REST API с nested relationships
  - JWT аутентификация
  - OpenAPI документация (drf-spectacular)
  - File upload для изображений планов и панорам

#### 3. front (Django приложение - Frontend)
- **Назначение**: Пользовательский интерфейс и клиентская логика
- **Ключевые файлы**:
  - `front/views.py` — Django views для серверных страниц
  - `front/templates/` — HTML шаблоны (main.html, admin.html, evac_plans.html)
  - `front/static/js/admin.js` — клиентская логика редактора туров
  - `front/static/css/style_admin.css` — стили интерфейса
- **Особенности**:
  - Пошаговый мастер создания туров (Wizard UI)
  - Интерактивный canvas для планов и панорам
  - AJAX взаимодействие с REST API
  - State management через JavaScript объекты

#### 4. Внешние сервисы и библиотеки

**Backend зависимости**:
- **Django REST Framework** — API framework
- **SimpleJWT** — JSON Web Token аутентификация
- **drf-spectacular** — OpenAPI 3.0 документация
- **Pillow** — обработка изображений
- **psycopg2** — PostgreSQL драйвер
- **django-filter** — фильтрация API запросов

**Frontend технологии**:
- **Vanilla JavaScript** — клиентская логика
- **Fetch API** — HTTP запросы
- **HTML5 Canvas** — интерактивные элементы
- **CSS3** — адаптивный дизайн

**Инфраструктура**:
- **PostgreSQL** — основная база данных
- **Whitenoise** — обслуживание статических файлов
- **Poetry** — управление зависимостями
- **Docker** — контейнеризация (опционально)

4) Static & Media
   - Статические файлы собираются в `STATIC_ROOT` (используется `whitenoise` в настройках).
   - Медиаконтент (изображения эвак. планов и панорам) лежит в `MEDIA_ROOT` (`media/evac_plans/`, `media/panoramas/`).

5) Внешние библиотеки/сервисы
   - Django REST Framework (DRF) — for API ViewSets.
   - SimpleJWT — authentication for API.
   - drf-spectacular — OpenAPI schema.
   - Whitenoise — serve static files in production.

Как отрисовать диаграмму локально

1) Через онлайн PlantUML: откройте https://www.plantuml.com/plantuml/ и вставьте содержимое `docs/component_diagram.puml`.

2) Локально с PlantUML (jar) и Graphviz установленным:

```bash
# если plantuml.jar скачан в корень проекта
java -jar plantuml.jar -tpng docs/component_diagram.puml -o docs
```

или через Docker:

```bash
docker run --rm -v $(pwd):/workspace plantuml/plantuml -tpng /workspace/docs/component_diagram.puml
```

Примечания и возможные улучшения
- Можно добавить более детальную диаграмму развертывания (WSGI/ASGI, nginx, gunicorn, DB host).
- Для frontend стоит дополнительно изобразить точные JS-модули (например, `front/static/js/main.js`) если нужен детальный обзор взаимодействий.
- Включить admin интерфейс и endpoint документации (drf-spectacular) как отдельные сервисы при необходимости.

Конец файла.

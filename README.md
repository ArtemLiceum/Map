# Map - Система виртуальных туров

## Описание проекта

**Map** - это веб-приложение для создания и просмотра интерактивных виртуальных туров по зданиям и помещениям. Основная цель - предоставить возможность виртуального знакомства с факультетом физики, математики и информатики Курского государственного университета через панорамные изображения и интерактивные планы эвакуации.

### Основные возможности

- **Создание планов эвакуации** - загрузка изображений планов зданий
- **Добавление интерактивных точек** - размещение маркеров на плане с привязкой к панорамам
- **Загрузка панорамных изображений** - 360° фотографии помещений
- **Создание переходов между точками** - навигационные маркеры на панорамах
- **Обрезка изображений** - встроенный кроп для планов и панорам с предпросмотром
- **Просмотр готовых туров** - интерактивная навигация по зданиям

## Архитектура

### Backend (Django + DRF)

- **Django 5.2.4** - веб-фреймворк
- **Django REST Framework 3.16.0** - API для фронтенда
- **PostgreSQL** - база данных
- **JWT аутентификация** - защита API endpoints
- **OpenAPI документация** - автоматическая генерация спецификаций

### Frontend (Vanilla JavaScript)

- **HTML5 Canvas** - интерактивные планы и панорамы
- **Fetch API** - асинхронные запросы к backend
- **CSS3** - адаптивный дизайн
- **LocalStorage** - сохранение состояния интерфейса

### Модели данных

```python
EvacPlan          # План эвакуации (название, этаж, изображение)
├── MapPoint      # Точка на плане (координаты X,Y, название, info_text)
│   └── Panorama  # Панорамное изображение (360° фото)
│       └── PanoramaMarker  # Маркер (transition/info): азимут, label, text, target_point)
```

## Установка и запуск

### Требования

- Python 3.13+
- PostgreSQL
- Poetry (для управления зависимостями)

### Установка

1. **Клонирование репозитория**
   ```bash
   git clone <repository-url>
   cd map
   ```

2. **Установка зависимостей**
   ```bash
   poetry install
   ```

3. **Настройка переменных окружения**

   Создайте файл `.env` в корне проекта (можно взять за основу `.env.example`):
   ```env
   # Database settings
   DB_ENGINE=django.db.backends.postgresql
   DB_NAME=map_db
   DB_USER=your_user
   DB_PASSWORD=your_password
   DB_HOST=your-db-host.example.com
   DB_PORT=5432

   # JWT settings
   SIGNING_KEY=your-secret-key-here
   ACCESS_TOKEN_LIFETIME=1 00:00:00
   REFRESH_TOKEN_LIFETIME=7 00:00:00
   ROTATE_REFRESH_TOKENS=True
   BLACKLIST_AFTER_ROTATION=True
   UPDATE_LAST_LOGIN=True

   # Django settings
   DEBUG=True
   ```

4. **Создание базы данных**
   ```sql
   CREATE DATABASE map_db;
   CREATE USER your_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE map_db TO your_user;
   ```

5. **Миграции базы данных**
   ```bash
   poetry run python manage.py migrate
   ```

6. **Создание суперпользователя**
   ```bash
   poetry run python manage.py createsuperuser
   ```

7. **Запуск сервера**
   ```bash
   poetry run python manage.py runserver
   ```

Приложение будет доступно по адресу: `http://localhost:8000`

### Docker (подключение к существующей БД)

1. Скопируйте пример окружения:

```bash
cp .env.example .env
```

2. Укажите параметры вашей существующей PostgreSQL (DB_HOST/DB_NAME/DB_USER/DB_PASSWORD).

3. Запуск:

```bash
docker compose up --build
```

### Docker (локальная БД в контейнере — опционально)

Если нужно поднять Postgres рядом:

- В `.env` поставьте `DB_HOST=db`
- Запускайте:

```bash
docker compose --profile localdb up --build
```

## Структура проекта

```
map/
├── map_core/                 # Основной Django проект
│   ├── settings.py          # Настройки Django
│   ├── urls.py              # Корневые URL-маршруты
│   ├── config.py            # Конфигурация из переменных окружения
│   └── wsgi.py              # WSGI приложение
├── map_api/                 # REST API приложение
│   ├── models.py            # Модели базы данных
│   ├── views.py             # ViewSets для API
│   ├── serializers.py       # Сериализаторы данных
│   ├── urls.py              # API маршруты
│   ├── utils.py             # Утилиты (обрезка изображений)
│   └── migrations/          # Миграции БД
├── front/                   # Frontend приложение
│   ├── views.py             # Django views для страниц
│   ├── templates/           # HTML шаблоны
│   │   ├── base.html        # Базовый шаблон
│   │   ├── main.html        # Главная страница
│   │   ├── admin.html       # Редактор туров (админ-панель)
│   │   ├── admin_login.html # Страница входа для администраторов
│   │   ├── tour_view.html   # Просмотр тура по плану
│   │   └── evac_plans.html  # Страница планов
│   └── static/              # Статические файлы
│       ├── css/             # Стили
│       ├── js/              # JavaScript логика
│       └── img/             # Изображения
├── media/                   # Загруженные файлы
│   ├── evac_plans/          # Планы эвакуации
│   └── panoramas/           # Панорамные изображения
├── docs/                    # Документация
└── pyproject.toml           # Зависимости Poetry
```

## API Endpoints

### Планы эвакуации
- `GET /api/evac_plans/` - список планов (`?search=`, `?floor=`)
- `POST /api/evac_plans/` - создать план (multipart/form-data: `title`, `floor`, `image`, `crop`)
- `GET /api/evac_plans/{id}/` - детали плана
- `PATCH /api/evac_plans/{id}/` - обновить план
- `DELETE /api/evac_plans/{id}/` - удалить план

### Точки на плане
- `GET /api/map_points/` - список точек (`?plan={id}`)
- `POST /api/map_points/` - создать точку (`plan`, `name`, `x`, `y`, `info_text`)
- `GET /api/map_points/{id}/` - детали точки
- `PATCH /api/map_points/{id}/` - обновить точку
- `DELETE /api/map_points/{id}/` - удалить точку

### Панорамы
- `GET /api/panoramas/` - список панорам
- `POST /api/panoramas/` - загрузить панораму (multipart/form-data: `point`, `image`, `crop`)
- `GET /api/panoramas/{id}/` - детали панорамы
- `PATCH /api/panoramas/{id}/` - обновить панораму
- `DELETE /api/panoramas/{id}/` - удалить панораму

### Маркеры панорам
- `GET /api/panorama_markers/?panorama={id}` - маркеры панорамы
- `POST /api/panorama_markers/` - создать маркер (`type=transition|info`, для `transition` — `target_point` обязателен, для `info` — `label`, `text`)
- `DELETE /api/panorama_markers/{id}/` - удалить маркер

## Использование

### Создание виртуального тура

1. **Перейдите в админ-панель** (`/admin/`)
2. **Создайте план эвакуации**:
   - Введите название плана
   - Загрузите изображение плана здания
3. **Добавьте точки на плане**:
   - Выберите режим "Добавить точку"
   - Кликните на план для размещения точки
   - Укажите название точки
   - Загрузите панорамное изображение (опционально)
4. **Создайте переходы между точками**:
   - Выберите режим "Добавить переход"
   - Кликните на панораму для размещения маркера
   - Выберите целевую точку из списка

### Просмотр готовых туров

- **Главная страница** (`/`) - обзор доступных туров
- **Планы эвакуации** (`/evac_plans/`) - галерея всех планов
- **Тур по плану** (`/tour/<plan_id>/`) - интерактивный просмотр тура выбранного плана
- **Редактор туров** (`/admin/`) - создание и редактирование туров (только для staff)

## Разработка

### Запуск в режиме разработки

```bash
# Активация виртуального окружения
poetry shell

# Запуск сервера с авто-перезагрузкой
python manage.py runserver

# Создание миграций при изменении моделей
python manage.py makemigrations
python manage.py migrate
```

### Тестирование

```bash
# Запуск тестов
python manage.py test

# Генерация отчета о покрытии
coverage run manage.py test
coverage report
```

### API документация

OpenAPI спецификация доступна по адресу: `/api/schema/`

Для просмотра интерактивной документации используйте Swagger UI: `/api/schema/swagger-ui/`

## Развертывание

### Production настройки

1. **Отключите DEBUG** в настройках
2. **Настройте статические файлы**:
   ```bash
   python manage.py collectstatic
   ```
3. **Используйте WSGI сервер** (Gunicorn, uWSGI)
4. **Настройте веб-сервер** (Nginx) для обслуживания медиа-файлов
5. **Настройте HTTPS** для защищенной передачи данных

### Docker (опционально)

```dockerfile
FROM python:3.13-slim

WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry install --no-dev

COPY . .
RUN poetry run python manage.py collectstatic --noinput

CMD ["poetry", "run", "gunicorn", "map_core.wsgi:application", "--bind", "0.0.0.0:8000"]
```

## Лицензия

[Укажите лицензию проекта]

## Авторы

- **Артем Бедин** - разработчик
- **Комарова Анна** - разработчик
- Курский государственный университет, факультет физики, математики и информатики

## Благодарности

- Команде Django за отличный веб-фреймворк
- Сообществу Django REST Framework
- Курскому государственному университету за предоставленные материалы

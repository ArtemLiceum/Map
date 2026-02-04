# API Reference - Map Virtual Tours

## Обзор

Map API предоставляет RESTful интерфейс для управления виртуальными турами. API построен на Django REST Framework и поддерживает полные CRUD операции для всех сущностей.

Базовый URL: `/api/`

## Аутентификация

API использует JWT (JSON Web Tokens) для аутентификации:

```http
POST /api/token/
Content-Type: application/json

{
  "username": "admin",
  "password": "password"
}
```

```http
POST /api/token/refresh/
Content-Type: application/json

{
  "refresh": "refresh_token_here"
}
```

Используйте полученный `access` токен в заголовке `Authorization`:

```
Authorization: Bearer <access_token>
```

## Общие правила API

### HTTP Статусы
- `200 OK` - успешный запрос
- `201 Created` - ресурс создан
- `204 No Content` - ресурс удален
- `400 Bad Request` - ошибка валидации
- `401 Unauthorized` - неавторизован
- `404 Not Found` - ресурс не найден
- `500 Internal Server Error` - серверная ошибка

### Формат данных
- **Запросы**: JSON (кроме загрузки файлов)
- **Ответы**: JSON
- **Файлы**: multipart/form-data

### Пагинация
Для списков применяется пагинация:
```json
{
  "count": 25,
  "next": "http://localhost:8000/api/evac_plans/?page=2",
  "previous": null,
  "results": [...]
}
```

## Endpoints

### 1. Планы эвакуации (EvacPlan)

#### Получить список планов
```http
GET /api/evac_plans/
```

**Параметры запроса:**
- `page` (int) - номер страницы
- `page_size` (int) - размер страницы (по умолчанию 10)

**Пример ответа:**
```json
{
  "count": 2,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "title": "1 этаж, корпус А",
      "image": "/media/evac_plans/plan1.jpg",
      "created_at": "2024-01-15T10:30:00Z",
      "points": [
        {
          "id": 1,
          "name": "Вход",
          "x": 25.5,
          "y": 75.2,
          "panorama": {
            "id": 1,
            "image": "/media/panoramas/pano1.jpg",
            "markers": []
          }
        }
      ]
    }
  ]
}
```

#### Создать план
```http
POST /api/evac_plans/
Content-Type: multipart/form-data
```

**Параметры формы:**
- `title` (string, required) - название плана
- `image` (file, required) - изображение плана (JPG/PNG)

**Пример ответа:**
```json
{
  "id": 3,
  "title": "2 этаж, корпус Б",
  "image": "/media/evac_plans/plan3.jpg",
  "created_at": "2024-01-20T14:15:00Z"
}
```

#### Получить план по ID
```http
GET /api/evac_plans/{id}/
```

#### Обновить план
```http
PATCH /api/evac_plans/{id}/
Content-Type: application/json
```

**Параметры:**
- `title` (string, optional) - новое название

#### Удалить план
```http
DELETE /api/evac_plans/{id}/
```

### 2. Точки на плане (MapPoint)

#### Получить список точек
```http
GET /api/map_points/
```

**Параметры запроса:**
- `plan` (int) - фильтр по ID плана

#### Создать точку
```http
POST /api/map_points/
Content-Type: application/json
```

**Параметры:**
```json
{
  "plan": 1,
  "name": "Лекционная аудитория 101",
  "x": 45.7,
  "y": 30.2
}
```

#### Получить точку по ID
```http
GET /api/map_points/{id}/
```

**Пример ответа:**
```json
{
  "id": 2,
  "plan": 1,
  "name": "Лекционная аудитория 101",
  "x": 45.7,
  "y": 30.2,
  "panorama": {
    "id": 2,
    "image": "/media/panoramas/pano2.jpg",
    "markers": [
      {
        "id": 1,
        "panorama": 2,
        "target_point": 3,
        "target_point_name": "Коридор",
        "azimuth": 180.5,
        "pitch": 0.0
      }
    ]
  }
}
```

#### Обновить точку
```http
PATCH /api/map_points/{id}/
Content-Type: application/json
```

**Параметры:**
- `name` (string, optional) - новое название
- `x` (float, optional) - новая координата X (0-100%)
- `y` (float, optional) - новая координата Y (0-100%)

#### Удалить точку
```http
DELETE /api/map_points/{id}/
```

### 3. Панорамы (Panorama)

#### Получить список панорам
```http
GET /api/panoramas/
```

#### Загрузить панораму
```http
POST /api/panoramas/
Content-Type: multipart/form-data
```

**Параметры формы:**
- `point` (int, required) - ID точки, к которой привязана панорама
- `image` (file, required) - панорамное изображение (JPG/PNG)

**Пример ответа:**
```json
{
  "id": 3,
  "point": 4,
  "image": "/media/panoramas/pano3.jpg"
}
```

#### Получить панораму по ID
```http
GET /api/panoramas/{id}/
```

#### Удалить панораму
```http
DELETE /api/panoramas/{id}/
```

### 4. Маркеры панорам (PanoramaMarker)

#### Получить маркеры панорамы
```http
GET /api/panorama_markers/?panorama={panorama_id}
```

**Пример ответа:**
```json
[
  {
    "id": 1,
    "panorama": 2,
    "target_point": 3,
    "target_point_name": "Коридор",
    "azimuth": 180.5,
    "pitch": 0.0
  },
  {
    "id": 2,
    "panorama": 2,
    "target_point": 5,
    "target_point_name": "Лестница",
    "azimuth": 270.0,
    "pitch": 10.0
  }
]
```

#### Создать маркер
```http
POST /api/panorama_markers/
Content-Type: application/json
```

**Параметры:**
```json
{
  "panorama": 2,
  "target_point": 3,
  "azimuth": 180.5,
  "pitch": 0.0
}
```

**Пояснения к параметрам:**
- `panorama` (int, required) - ID панорамы
- `target_point` (int, required) - ID целевой точки
- `azimuth` (float, required) - угол направления в градусах (0-360)
- `pitch` (float, optional) - угол по вертикали в градусах (по умолчанию 0)

#### Удалить маркер
```http
DELETE /api/panorama_markers/{id}/
```

## Схема данных

### EvacPlan
```typescript
interface EvacPlan {
  id: number;
  title: string;
  image: string; // URL to image
  created_at: string; // ISO datetime
  points?: MapPoint[]; // nested in list/detail views
}
```

### MapPoint
```typescript
interface MapPoint {
  id: number;
  plan: number; // EvacPlan ID
  name: string;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  panorama?: Panorama; // optional, nested
}
```

### Panorama
```typescript
interface Panorama {
  id: number;
  point: number; // MapPoint ID
  image: string; // URL to panorama image
  markers?: PanoramaMarker[]; // nested in detail views
}
```

### PanoramaMarker
```typescript
interface PanoramaMarker {
  id: number;
  panorama: number; // Panorama ID
  target_point: number; // MapPoint ID
  target_point_name?: string; // read-only, from serializer
  azimuth: number; // degrees (0-360)
  pitch: number; // degrees, default 0
}
```

## Обработка ошибок

### Валидационные ошибки
```json
{
  "field_name": [
    "This field is required.",
    "Value must be between 0 and 100."
  ],
  "non_field_errors": [
    "Point with these coordinates already exists."
  ]
}
```

### Серверные ошибки
```json
{
  "detail": "Internal server error"
}
```

### Аутентификационные ошибки
```json
{
  "detail": "Authentication credentials were not provided."
}
```

## Примеры использования

### Создание полного тура

```javascript
// 1. Создать план
const planForm = new FormData();
planForm.append('title', '1 этаж, главный корпус');
planForm.append('image', planFile);

const planResponse = await fetch('/api/evac_plans/', {
  method: 'POST',
  body: planForm
});
const plan = await planResponse.json();

// 2. Создать точку
const pointResponse = await fetch('/api/map_points/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    plan: plan.id,
    name: 'Вход',
    x: 25.0,
    y: 75.0
  })
});
const point = await pointResponse.json();

// 3. Загрузить панораму
const panoForm = new FormData();
panoForm.append('point', point.id);
panoForm.append('image', panoramaFile);

await fetch('/api/panoramas/', {
  method: 'POST',
  body: panoForm
});

// 4. Создать переход
await fetch('/api/panorama_markers/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    panorama: point.panorama.id,
    target_point: anotherPoint.id,
    azimuth: 180.0,
    pitch: 0.0
  })
});
```

## OpenAPI Спецификация

Полная спецификация API доступна в формате OpenAPI 3.0:
- **Swagger UI**: `/api/schema/swagger-ui/`
- **ReDoc**: `/api/schema/redoc/`
- **JSON**: `/api/schema/`
- **YAML**: `/api/schema/?format=yaml`
# Руководство по развертыванию - Map Virtual Tours

## Быстрый старт

### Локальная разработка

```bash
# 1. Клонирование
git clone <repository-url>
cd map

# 2. Установка зависимостей
poetry install

# 3. Настройка переменных окружения
cp .env.example .env
# Отредактируйте .env файл

# 4. Создание БД и миграции
createdb map_db  # или через GUI
poetry run python manage.py migrate

# 5. Создание суперпользователя
poetry run python manage.py createsuperuser

# 6. Запуск сервера
poetry run python manage.py runserver
```

## Переменные окружения

Создайте файл `.env` в корне проекта:

```env
# Django настройки
DEBUG=True
SECRET_KEY=your-secret-key-here
ALLOWED_HOSTS=localhost,127.0.0.1

# База данных
DB_ENGINE=django.db.backends.postgresql
DB_NAME=map_db
DB_USER=map_user
DB_PASSWORD=secure_password
DB_HOST=localhost
DB_PORT=5432

# JWT токены
SIGNING_KEY=your-jwt-secret-key
ACCESS_TOKEN_LIFETIME=1 00:00:00
REFRESH_TOKEN_LIFETIME=7 00:00:00
ROTATE_REFRESH_TOKENS=True
BLACKLIST_AFTER_ROTATION=True
UPDATE_LAST_LOGIN=True

# Email (опционально)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
EMAIL_USE_TLS=True
```

## Production развертывание

### С Nginx + Gunicorn

#### 1. Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка необходимого ПО
sudo apt install python3 python3-pip postgresql nginx -y

# Установка Poetry
curl -sSL https://install.python-poetry.org | python3 -

# Клонирование проекта
git clone <repository-url> /var/www/map
cd /var/www/map
```

#### 2. Настройка PostgreSQL

```bash
# Создание пользователя и БД
sudo -u postgres psql
```

```sql
CREATE DATABASE map_db;
CREATE USER map_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE map_db TO map_user;
ALTER USER map_user CREATEDB;
\q
```

#### 3. Настройка проекта

```bash
# Установка зависимостей
poetry install --no-dev

# Копирование и настройка переменных окружения
cp .env.example .env
# Отредактируйте .env для production

# Выполнение миграций
poetry run python manage.py migrate

# Сбор статических файлов
poetry run python manage.py collectstatic --noinput

# Создание суперпользователя
poetry run python manage.py createsuperuser
```

#### 4. Настройка Gunicorn

Создайте файл `/etc/systemd/system/gunicorn.service`:

```ini
[Unit]
Description=gunicorn daemon
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/map
ExecStart=/home/www-data/.local/bin/poetry run gunicorn --access-logfile - --workers 3 --bind unix:/var/www/map/map.sock map_core.wsgi:application

[Install]
WantedBy=multi-user.target
```

```bash
# Запуск и включение сервиса
sudo systemctl start gunicorn
sudo systemctl enable gunicorn
```

#### 5. Настройка Nginx

Создайте файл `/etc/nginx/sites-available/map`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location = /favicon.ico { access_log off; log_not_found off; }

    location /static/ {
        alias /var/www/map/staticfiles/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /media/ {
        alias /var/www/map/media/;
        expires 30d;
        add_header Cache-Control "public";
    }

    location / {
        include proxy_params;
        proxy_pass http://unix:/var/www/map/map.sock;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Host $http_host;
    }
}
```

```bash
# Включение сайта
sudo ln -s /etc/nginx/sites-available/map /etc/nginx/sites-enabled
sudo nginx -t
sudo systemctl restart nginx
```

#### 6. Настройка SSL (Let's Encrypt)

```bash
# Установка certbot
sudo apt install certbot python3-certbot-nginx -y

# Получение сертификата
sudo certbot --nginx -d your-domain.com

# Проверка автообновления
sudo systemctl status certbot.timer
```

### Docker развертывание

#### Dockerfile

```dockerfile
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Установка системных зависимостей
RUN apt-get update \
    && apt-get install -y gcc postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Установка Poetry
RUN pip install poetry

# Копирование файлов зависимостей
COPY pyproject.toml poetry.lock ./

# Установка Python зависимостей
RUN poetry config virtualenvs.create false \
    && poetry install --no-dev --no-interaction --no-ansi

# Копирование проекта
COPY . .

# Создание директорий для статических файлов
RUN mkdir -p staticfiles media

# Сбор статических файлов
RUN python manage.py collectstatic --noinput

# Создание непривилегированного пользователя
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "map_core.wsgi:application"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DEBUG=False
      - SECRET_KEY=your-production-secret-key
      - DB_ENGINE=django.db.backends.postgresql
      - DB_NAME=map_db
      - DB_USER=map_user
      - DB_PASSWORD=secure_password
      - DB_HOST=db
      - DB_PORT=5432
    depends_on:
      - db
    volumes:
      - staticfiles:/app/staticfiles
      - media:/app/media

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=map_db
      - POSTGRES_USER=map_user
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - staticfiles:/app/staticfiles
      - media:/app/media
    depends_on:
      - web

volumes:
  postgres_data:
  staticfiles:
  media:
```

#### nginx.conf для Docker

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    upstream app {
        server web:8000;
    }

    server {
        listen 80;
        server_name localhost;

        location /static/ {
            alias /app/staticfiles/;
            expires 1y;
        }

        location /media/ {
            alias /app/media/;
            expires 30d;
        }

        location / {
            proxy_pass http://app;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header Host $http_host;
        }
    }
}
```

### Облачное развертывание

#### Heroku

1. **Установка Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Создание приложения**
   ```bash
   heroku create your-map-app
   ```

3. **Настройка переменных окружения**
   ```bash
   heroku config:set DEBUG=False
   heroku config:set SECRET_KEY=your-secret-key
   heroku config:set DB_ENGINE=django.db.backends.postgresql
   # ... остальные переменные
   ```

4. **Heroku Postgres**
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   ```

5. **Деплой**
   ```bash
   git push heroku main
   heroku run python manage.py migrate
   heroku run python manage.py createsuperuser
   ```

#### AWS EC2 + RDS

1. **Создание EC2 инстанса**
   ```bash
   aws ec2 run-instances --image-id ami-12345678 --count 1 --instance-type t2.micro
   ```

2. **Настройка RDS PostgreSQL**
   ```bash
   aws rds create-db-instance --db-instance-identifier map-db \
                              --db-instance-class db.t2.micro \
                              --engine postgres \
                              --master-username map_user \
                              --master-user-password secure_password \
                              --allocated-storage 20
   ```

3. **Настройка Security Groups**
   - Разрешить SSH (22) для вашего IP
   - Разрешить HTTP (80) и HTTPS (443) для всех
   - Настроить доступ RDS только для EC2 инстанса

## Мониторинг и обслуживание

### Логи

```bash
# Просмотр логов Django
tail -f /var/log/django.log

# Логи Gunicorn
sudo journalctl -u gunicorn -f

# Логи Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Резервное копирование

#### База данных
```bash
# Создание дампа
pg_dump -U map_user -h localhost map_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановление
psql -U map_user -h localhost map_db < backup_file.sql
```

#### Медиафайлы
```bash
# Архивация
tar -czf media_backup_$(date +%Y%m%d).tar.gz media/

# Синхронизация с S3
aws s3 sync media/ s3://your-bucket/media/ --delete
```

### Производительность

#### Оптимизации

1. **Статические файлы через CDN**
   ```python
   # settings.py
   AWS_S3_CUSTOM_DOMAIN = 'cdn.yourdomain.com'
   STATIC_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/static/'
   ```

2. **Кэширование**
   ```python
   CACHES = {
       'default': {
           'BACKEND': 'django.core.cache.backends.redis.RedisCache',
           'LOCATION': 'redis://127.0.0.1:6379/',
       }
   }
   ```

3. **Gunicorn workers**
   ```bash
   # Расчет: (2 * CPU cores) + 1
   gunicorn --workers 5 --bind unix:/tmp/gunicorn.sock map_core.wsgi:application
   ```

### Безопасность

#### SSL/TLS
- Всегда используйте HTTPS в production
- Перенаправляйте HTTP на HTTPS

#### Firewall
```bash
# UFW правила
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

#### Регулярные обновления
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Обновление зависимостей Python
poetry update

# Перезапуск сервисов
sudo systemctl restart gunicorn
sudo systemctl restart nginx
```

## Troubleshooting

### Распространенные проблемы

#### 502 Bad Gateway
- Проверьте статус Gunicorn: `sudo systemctl status gunicorn`
- Проверьте логи: `sudo journalctl -u gunicorn -n 50`

#### Статические файлы не загружаются
- Выполните: `python manage.py collectstatic --noinput`
- Проверьте права доступа: `chown -R www-data:www-data staticfiles/`

#### База данных недоступна
- Проверьте подключение: `python manage.py dbshell`
- Проверьте переменные окружения
- Проверьте статус PostgreSQL: `sudo systemctl status postgresql`

#### Высокое потребление памяти
- Уменьшите количество Gunicorn workers
- Добавьте swap: `sudo fallocate -l 1G /swapfile`
- Настройте мониторинг памяти

### Мониторинг

#### Health checks
```python
# map_api/views.py
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def health_check(request):
    return Response({"status": "healthy"})
```

#### Логирование ошибок
```python
# settings.py
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': '/var/log/django/errors.log',
        },
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
        },
    },
}
```

## Контакты

При проблемах с развертыванием:
- **Документация**: `/docs/`
- **Issues**: Создайте issue в репозитории
- **Email**: [техническая поддержка]
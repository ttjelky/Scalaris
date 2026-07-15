# Scalaris

Mobile-first app for organizing backyard activities with friends.

**Stack:** Django + Django REST Framework + Channels (WebSockets) backend, React + Vite frontend, PostgreSQL/PostGIS + Redis.

> ⚠️ Only `postgres` and `redis` run in Docker. The Django backend and the React frontend run **locally**, not in containers.

---

## 1. Prerequisites

Install these before doing anything else:

| Git |
| Docker Desktop | **must be running** (see Troubleshooting if it isn't) |
| Python 3.12 | (other versions may not work with the pinned dependencies) |
| GDAL + GEOS | (system libraries, required by GeoDjango — see §3) |
| Node.js 20+ | (for the frontend) |

---

## 2. First-time setup

```bash
git clone <repo>
cd scalaris

# 1. Start Docker Desktop app first, then:
docker compose up -d          # starts postgres (PostGIS) + redis
docker ps                     # confirm scalaris-postgres and scalaris-redis are "Up"

# 2. Backend
cd backend
python -m venv venv
venv\Scripts\activate         # Windows
# source venv/bin/activate    # macOS / Linux
pip install -r requirements.txt

cp ../.env.example .env       # or use the .env already in the repo root
# edit .env — see §3 if you're on Windows or macOS

python manage.py migrate
daphne config.asgi:application
# (python manage.py runserver also works for plain HTTP dev, but use daphne
#  if you need WebSockets/Channels)

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

---

## 3. GDAL / GEOS setup (required — GeoDjango won't start without this)

These are **system libraries**, not pip packages. `pip install -r requirements.txt` will succeed without them, but `python manage.py migrate` / `runserver` will fail.

- **Windows:** install [OSGeo4W](https://trac.osgeo.org/osgeo4w/) (full install, not "express"). Default paths already match `settings.py`. If your install path differs, uncomment and set in `.env`:
  ```
  GDAL_LIBRARY_PATH=C:\OSGeo4W\bin\gdal313.dll
  GEOS_LIBRARY_PATH=C:\OSGeo4W\bin\geos_c.dll
  ```
- **macOS:**
  ```bash
  brew install gdal geos
  ```
  If needed, set in `.env`:
  ```
  GDAL_LIBRARY_PATH=/opt/homebrew/opt/gdal/lib/libgdal.dylib
  GEOS_LIBRARY_PATH=/opt/homebrew/opt/geos/lib/libgeos_c.dylib
  ```
- **Linux:**
  ```bash
  sudo apt install gdal-bin libgdal-dev libgeos-dev
  ```

---

## 4. Troubleshooting

**`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`**
Docker Desktop app isn't running. Launch it from the Start menu and wait until the whale icon in the tray stops animating, then retry `docker compose up -d`.

**`psycopg2.OperationalError: connection to server at "localhost" ... Connection refused`**
Postgres container isn't up. Run `docker ps` to confirm `scalaris-postgres` is `Up`. If it's missing or restarting, check `docker compose logs postgres`.

**`OSError` / `couldn't load GDAL library` on startup**
GDAL/GEOS aren't installed, or the path in `.env` doesn't match your actual install location. See §3.

**Frontend won't start / weird npm errors**
Check `node -v` — needs to be 20 or newer.

---

## 5. Project layout

```
scalaris/
├── docker-compose.yml   # postgres (PostGIS) + redis only
├── .env / .env.example
├── backend/             # Django + DRF + Channels
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/          # settings, asgi/wsgi, urls
│   └── apps/
└── frontend/             # React + Vite
    ├── package.json
    └── src/
```

---

# Scalaris (UA)

Mobile-first застосунок для проведення активностей з друзями на подвір'ї.

**Стек:** Django + Django REST Framework + Channels (WebSockets) бекенд, React + Vite фронтенд, PostgreSQL/PostGIS + Redis.

> ⚠️ У Docker піднімаються тільки `postgres` і `redis`. Django-бекенд і React-фронтенд працюють **локально**, не в контейнерах.

---

## 1. Що встановити заздалегідь

| Інструмент | Версія | Примітка |
|---|---|---|
| Git | будь-яка | |
| Docker Desktop | будь-яка | **має бути запущений** (див. розділ "Типові помилки") |
| Python | 3.12 | інші версії можуть не завестись із зафіксованими залежностями |
| GDAL + GEOS | будь-яка свіжа | системні бібліотеки для GeoDjango — див. §3 |
| Node.js | 20+ | для фронтенду |

---

## 2. Перший запуск

```bash
git clone <repo>
cd scalaris

# 1. Спочатку запустити застосунок Docker Desktop, потім:
docker compose up -d          # піднімає postgres (PostGIS) + redis
docker ps                     # перевірити, що scalaris-postgres і scalaris-redis у статусі "Up"

# 2. Бекенд
cd backend
python -m venv venv
venv\Scripts\activate         # Windows
# source venv/bin/activate    # macOS / Linux
pip install -r requirements.txt

cp ../.env.example .env       # або використати .env, що вже є в корені репо
# відредагувати .env — див. §3, якщо Windows або macOS

python manage.py migrate
daphne config.asgi:application
# (python manage.py runserver теж працює для звичайного HTTP-дева, але
#  для WebSockets/Channels треба daphne)

# 3. Фронтенд (новий термінал)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

---

## 3. Налаштування GDAL / GEOS (обов'язково — без цього GeoDjango не стартує)

Це **системні бібліотеки**, не pip-пакети. `pip install -r requirements.txt` пройде успішно і без них, але `python manage.py migrate` / `runserver` впадуть.

- **Windows:** встановити [OSGeo4W](https://trac.osgeo.org/osgeo4w/) (повна інсталяція, не "express"). Дефолтні шляхи вже збігаються з `settings.py`. Якщо шлях інсталяції інший — розкоментувати й прописати в `.env`:
  ```
  GDAL_LIBRARY_PATH=C:\OSGeo4W\bin\gdal313.dll
  GEOS_LIBRARY_PATH=C:\OSGeo4W\bin\geos_c.dll
  ```
- **macOS:**
  ```bash
  brew install gdal geos
  ```
  За потреби прописати в `.env`:
  ```
  GDAL_LIBRARY_PATH=/opt/homebrew/opt/gdal/lib/libgdal.dylib
  GEOS_LIBRARY_PATH=/opt/homebrew/opt/geos/lib/libgeos_c.dylib
  ```
- **Linux:**
  ```bash
  sudo apt install gdal-bin libgdal-dev libgeos-dev
  ```

---

## 4. Типові помилки

**`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`**
Не запущений застосунок Docker Desktop. Запустити з меню Пуск і дочекатись, поки іконка кита в треї перестане анімуватись, потім повторити `docker compose up -d`.

**`psycopg2.OperationalError: connection to server at "localhost" ... Connection refused`**
Контейнер Postgres не піднятий. `docker ps` — перевірити, що `scalaris-postgres` у статусі `Up`. Якщо його немає або він рестартує — `docker compose logs postgres`.

**`OSError` / `couldn't load GDAL library` при старті**
GDAL/GEOS не встановлені, або шлях у `.env` не збігається з реальним місцем інсталяції. Див. §3.

**Фронтенд не стартує / дивні помилки npm**
Перевірити `node -v` — має бути 20 або новіше.

---

## 5. Структура проєкту

```
scalaris/
├── docker-compose.yml   # тільки postgres (PostGIS) + redis
├── .env / .env.example
├── backend/             # Django + DRF + Channels
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/          # settings, asgi/wsgi, urls
│   └── apps/
└── frontend/             # React + Vite
    ├── package.json
    └── src/
```
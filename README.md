# Scalaris

Mobile-first app for organizing backyard activities with friends.

**Stack:** Django + Django REST Framework + Channels (WebSockets) backend, React + Vite frontend, PostgreSQL/PostGIS + Redis.

---

## 1. Prerequisites

Install these before doing anything else:

| Tool | Version | Notes |
|---|---|---|
| Git | any | |
| Docker Desktop | any | **must be running** (see Troubleshooting if it isn't) |
| GDAL + GEOS | any recent | system libraries, required by GeoDjango — see §3 |
| Python | 3.12 | only needed if running backend locally (outside Docker) |
| Node.js | 20+ | for the frontend |

---

## 2. First-time setup

```bash
git clone <repo>
cd scalaris

# 1. Environment variables (root — used by docker-compose for Postgres)
cp .env.example .env
# edit .env — set DB_NAME, DB_USER, DB_PASSWORD, REDIS_HOST, REDIS_PORT

# 2. Backend environment (inside backend/)
cd backend
cp .env.example .env
# edit .env — configure DB, Discord OAuth, email, GDAL paths, etc.
cd ..

# 3. Start Docker Desktop app first, then:
docker compose up -d          # starts postgres (PostGIS) + redis + backend (Django/Daphne)
docker ps                     # confirm scalaris-postgres, scalaris-redis, scalaris-backend are "Up"

# 4. Run database migrations (inside the running backend container)
docker compose exec backend python manage.py migrate

# 5. Frontend (runs locally)
cd frontend
npm install
npm run dev                   # https://localhost:5174
```

> **Note:** If you prefer to run the Django backend locally instead of in Docker,
> see [Running backend locally](#running-backend-optional---locally) below.

---

## 3. GDAL / GEOS setup (required — GeoDjango won't start without this)

These are **system libraries**, not pip packages. The Docker backend image installs
GDAL automatically, so this section only applies if you run the backend **locally**.

- **Windows:** install [OSGeo4W](https://trac.osgeo.org/osgeo4w/) (express installation). Default paths already match `settings.py`. If your install path differs, uncomment and set in `backend/.env`:
  ```
  GDAL_LIBRARY_PATH=C:\OSGeo4W\bin\gdal313.dll
  GEOS_LIBRARY_PATH=C:\OSGeo4W\bin\geos_c.dll
  ```
- **macOS:**
  ```bash
  brew install gdal geos
  ```
  If needed, set in `backend/.env`:
  ```
  GDAL_LIBRARY_PATH=/opt/homebrew/opt/gdal/lib/libgdal.dylib
  GEOS_LIBRARY_PATH=/opt/homebrew/opt/geos/lib/libgeos_c.dylib
  ```
- **Linux:**
  ```bash
  sudo apt install gdal-bin libgdal-dev libgeos-dev
  ```

---

## 4. Tests

```bash
# Backend
cd backend && python manage.py test apps.users apps.activities
cd backend && python manage.py test api.tests

# Frontend
cd frontend && npm run test
```

---

## 5. Running backend (optional — locally)

If you don't want to use Docker for the backend, run Postgres + Redis in Docker
and start Django locally:

```bash
# Only start infrastructure services
docker compose up -d postgres redis

cd backend
python -m venv venv
venv\Scripts\activate         # Windows
source venv/bin/activate      # macOS / Linux
pip install -r requirements.txt

cp .env.example .env          # edit — see §3 for GDAL/GEOS paths

python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

---

## 6. Troubleshooting

**`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`**
Docker Desktop app isn't running. Launch it from the Start menu and wait until the whale icon in the tray stops animating, then retry `docker compose up -d`.

**`psycopg2.OperationalError: connection to server at "localhost" ... Connection refused`**
Postgres container isn't up. Run `docker ps` to confirm `scalaris-postgres` is `Up`. If it's missing or restarting, check `docker compose logs postgres`.

**`OSError` / `couldn't load GDAL library` on startup**
GDAL/GEOS aren't installed, or the path in `.env` doesn't match your actual install location. See §3.

**Frontend won't start / weird npm errors**
Check `node -v` — needs to be 20 or newer.

---

## 7. Project layout

```
scalaris/
├── docker-compose.yml    # postgres (PostGIS) + redis + backend (Django/Daphne)
├── .env / .env.example   # root env — consumed by docker-compose for Postgres credentials
├── backend/              # Django + DRF + Channels
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env / .env.example  # backend env — Django settings, Discord OAuth, etc.
│   ├── config/           # settings, asgi/wsgi, urls
│   └── apps/
└── frontend/             # React + Vite
    ├── package.json
    └── src/
```

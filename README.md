# Scalaris

Mobile-first app for organizing backyard activities with friends.

**Stack:** Django + Django REST Framework + Channels (WebSockets) backend, React + Vite frontend, PostgreSQL/PostGIS + Redis.

> ⚠️ Only `postgres` and `redis` run in Docker. The Django backend and the React frontend run **locally**, not in containers.

---

## 1. Prerequisites

Install these before doing anything else:

| Tool | Version | Notes |
|---|---|---|
| Git | any | |
| Docker Desktop | any | **must be running** (see Troubleshooting if it isn't) |
| Python | 3.12 | other versions may not work with the pinned dependencies |
| GDAL + GEOS | any recent | system libraries, required by GeoDjango — see §3 |
| Node.js | 20+ | for the frontend |

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
source venv/bin/activate      # macOS / Linux
pip install -r requirements.txt

cp .env.example .env          # edit .env — see §3 if you're on Windows or macOS

python manage.py migrate
python manage.py runserver

# 3. Frontend
cd frontend
npm install
npm run dev                   # http://localhost:5174
```

---

## 3. GDAL / GEOS setup (required — GeoDjango won't start without this)

These are **system libraries**, not pip packages. `pip install -r requirements.txt` will succeed without them, but `python manage.py migrate` / `runserver` will fail.

- **Windows:** install [OSGeo4W](https://trac.osgeo.org/osgeo4w/) (express installation). Default paths already match `settings.py`. If your install path differs, uncomment and set in `.env`:
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
├── docker-compose.yml    # postgres (PostGIS) + redis only
├── .env / .env.example
├── backend/              # Django + DRF + Channels
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/           # settings, asgi/wsgi, urls
│   └── apps/
└── frontend/             # React + Vite
    ├── package.json
    └── src/
```

---
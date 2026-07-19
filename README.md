# Scalaris

Social map app for organizing backyard activities with friends — activities, game zones, quests, real-time notifications, and friend management on an interactive Leaflet map.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Backend | Django 6.0.5, Django REST Framework, SimpleJWT, Django Channels, Daphne |
| Frontend | React 19, Vite 8, Leaflet, React Router 7 |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Cache / WS | Redis 7 |
| Auth | JWT (httpOnly cookie refresh + Bearer access), Discord OAuth2 |
| Infra | Docker Compose |

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Git | any | |
| Docker Desktop | any | **must be running** before starting |
| Python | 3.12 | only if running backend outside Docker |
| Node.js | 20+ | for the frontend |
| GDAL + GEOS | any | only if running backend locally (not needed in Docker) |

---

## Quick Start

```bash
# 1. Clone
git clone <repo-url>
cd scalaris

# 2. Root environment (docker-compose reads this for Postgres/Redis)
cp .env.example .env
# Edit .env if you need to change ports — defaults work out of the box

# 3. Backend environment
cd backend
cp .env.example .env
# Edit backend/.env — set at minimum:
#   SECRET_KEY=<any random string>
#   EMAIL_HOST_USER / EMAIL_HOST_PASSWORD (Gmail app password for password reset)
#   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET (optional, for Discord login)
cd ..

# 4. Start infrastructure + backend
docker compose up -d
docker ps   # verify scalaris-postgres, scalaris-redis, scalaris-backend are "Up"

# 5. Run migrations (happens automatically on first start, but if needed)
docker compose exec backend python manage.py migrate

# 6. Frontend (runs on your machine, not in Docker)
cd frontend
npm install
npm run dev
```

Open **https://localhost:5174** in your browser.

---

## Environment Variables

### Root `.env` (used by docker-compose)

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_NAME` | `scalaris_db` | PostgreSQL database name |
| `DB_USER` | `scalaris_user` | PostgreSQL user |
| `DB_PASSWORD` | `scalaris_pass` | PostgreSQL password |
| `REDIS_PORT` | `6379` | Redis port on host |
| `POSTGRES_PORT` | `5432` | Postgres port on host |

### `backend/.env`

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | **yes** | — | Django secret key (any random string) |
| `DEBUG` | no | `True` | Django debug mode |
| `ALLOWED_HOSTS` | no | `localhost,127.0.0.1` | Comma-separated allowed hosts |
| `DB_NAME` | no | `scalaris_db` | PostgreSQL database name |
| `DB_USER` | no | `scalaris_user` | PostgreSQL user |
| `DB_PASSWORD` | no | `scalaris_pass` | PostgreSQL password |
| `DB_HOST` | no | `localhost` | PostgreSQL host (`postgres` inside Docker) |
| `DB_PORT` | no | `5432` | PostgreSQL port |
| `REDIS_HOST` | no | `127.0.0.1` | Redis host (`redis` inside Docker) |
| `REDIS_PORT` | no | `6379` | Redis port |
| `EMAIL_HOST_USER` | for email | — | Gmail address for password reset emails |
| `EMAIL_HOST_PASSWORD` | for email | — | Gmail app password |
| `DEFAULT_FROM_EMAIL` | no | same as `EMAIL_HOST_USER` | Sender address |
| `FRONTEND_URL` | no | `https://localhost:5174` | Used in reset-link emails |
| `GDAL_LIBRARY_PATH` | only local | platform-dependent | Path to GDAL library |
| `GEOS_LIBRARY_PATH` | only local | platform-dependent | Path to GEOS library |
| `DISCORD_CLIENT_ID` | no | — | Discord OAuth client ID |
| `DISCORD_CLIENT_SECRET` | no | — | Discord OAuth client secret |
| `DISCORD_REDIRECT_URI` | no | `https://localhost:5174/oauth/discord/callback` | Discord OAuth redirect URI |
| `AUTH_COOKIE_SECURE` | no | `False` | Set `True` in production over HTTPS |

### `frontend/.env`

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_DISCORD_CLIENT_ID` | no | — | Discord Application client ID (public, safe for frontend) |

---

## Project Structure

```
scalaris/
├── docker-compose.yml          # PostGIS + Redis + Django backend
├── .env.example                # Root env template
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh           # Waits for Postgres → migrate → Daphne
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example            # Backend env template
│   ├── config/
│   │   ├── settings.py         # All settings (DB, JWT, CORS, Channels, etc.)
│   │   ├── urls.py             # /admin/, /api/users/, /api/activities/
│   │   ├── asgi.py             # Channels + WebSocket routing
│   │   └── wsgi.py
│   ├── api/
│   │   ├── consumers.py        # WebSocket consumers (notifications, activity, zones)
│   │   ├── routing.py          # WebSocket URL patterns
│   │   └── tests.py
│   └── apps/
│       ├── users/              # User model, auth, friends, block/report, Discord OAuth
│       │   ├── models.py
│       │   ├── views/          # auth, profile, friends, discord, password_reset, ...
│       │   ├── urls.py
│       │   ├── serializers.py
│       │   ├── cookies.py      # JWT cookie helpers
│       │   └── tests/
│       └── activities/         # Activities, locations, invitations, zones
│           ├── models.py
│           ├── views/          # ActivityViewSet, LocationViewSet, InvitationViewSet
│           ├── serializers/
│           ├── urls.py
│           ├── permissions.py
│           └── tests/
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js          # SSL + proxy /api → :8000
    ├── vitest.config.js
    ├── eslint.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx             # Routes: public (login, register) + protected (home, profile)
        ├── context/            # AuthContext (JWT state management)
        ├── api/                # Axios instance, friends API, notifications API
        ├── hooks/              # useNotifications, useActivitySocket, useZoneSocket
        ├── components/         # Map, NavBar, ActivityForm, GameZoneForm, BottomSheet, ...
        ├── pages/              # Home (map), Profile, Auth, Notifications, Welcome
        └── styles/
```

---

## Running Backend Locally (without Docker backend)

If you want to run Django on your machine instead of in Docker:

```bash
# Start only Postgres + Redis in Docker
docker compose up -d postgres redis

# Set up Python
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit backend/.env — set DB_HOST=localhost, REDIS_HOST=127.0.0.1, SECRET_KEY, etc.

# Install GDAL/GEOS (see below), then:
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### GDAL / GEOS Installation (required for local backend)

Docker installs these automatically. For local development:

**Windows** — install [OSGeo4W](https://trac.osgeo.org/osgeo4w/) (express install):
```
GDAL_LIBRARY_PATH=C:\OSGeo4W\bin\gdal313.dll
GEOS_LIBRARY_PATH=C:\OSGeo4W\bin\geos_c.dll
```

**macOS:**
```bash
brew install gdal geos
```
```
GDAL_LIBRARY_PATH=/opt/homebrew/opt/gdal/lib/libgdal.dylib
GEOS_LIBRARY_PATH=/opt/homebrew/opt/geos/lib/libgeos_c.dylib
```

**Linux:**
```bash
sudo apt install gdal-bin libgdal-dev libgeos-dev
```

---

## API Reference

Base URL: `http://127.0.0.1:8000/api/`

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `users/register/` | no | Create account (email, password, username) |
| POST | `users/login/` | no | Login (email + password), returns JWT |
| POST | `users/login/refresh/` | cookie | Rotate refresh token, return new access token |
| POST | `users/logout/` | Bearer | Blacklist refresh token |
| GET | `users/me/` | Bearer | Current user profile |
| PUT/PATCH | `users/me/` | Bearer | Update profile |

### Password Reset

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `users/password-reset/` | no | Request reset link (always returns 200) |
| POST | `users/password-reset-confirm/` | no | Confirm reset (token + new password) |

### Discord OAuth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `users/auth/discord/` | no | Redirect to Discord authorization |
| POST | `users/oauth/discord/link/` | Bearer | Link Discord account to existing profile |
| POST | `users/oauth/discord/unlink/` | Bearer | Unlink Discord account |

### Friends

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `users/<id>/friend-request/` | Bearer | Send friend request |
| POST | `users/friend-requests/<id>/accept/` | Bearer | Accept request |
| POST | `users/friend-requests/<id>/reject/` | Bearer | Reject request |
| DELETE | `users/<id>/friend/` | Bearer | Remove friend |
| GET | `users/me/friends/` | Bearer | List friends |
| GET | `users/me/friend-requests/sent/` | Bearer | Sent requests |
| GET | `users/me/friend-requests/received/` | Bearer | Received requests |

### Block / Report

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `users/<id>/block/` | Bearer | Block user |
| DELETE | `users/<id>/block/` | Bearer | Unblock user |
| POST | `users/<id>/report/` | Bearer | Report user |
| GET | `users/blocked/` | Bearer | List blocked users |

### Activities

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `activities/` | Bearer | List activities (paginated) |
| POST | `activities/` | Bearer | Create activity |
| GET | `activities/<id>/` | Bearer | Activity detail |
| PUT/PATCH | `activities/<id>/` | Bearer | Update activity |
| DELETE | `activities/<id>/` | Bearer | Delete activity |
| GET | `activities/near-me/` | Bearer | Activities near current location |
| GET | `activities/zones/nearby/` | Bearer | Game zones near location |
| GET | `activities/my-active/` | Bearer | User's active activity |
| POST | `activities/<id>/leave/` | Bearer | Leave activity |
| POST | `activities/<id>/hide/` | Bearer | Hide activity from map |
| GET | `activities/<id>/checkpoints/` | Bearer | List checkpoints |
| POST | `activities/<id>/checkpoints/` | Bearer | Add checkpoint |
| GET | `activities/online-count/` | Bearer | Number of online users |

### Locations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `activities/locations/` | Bearer | List locations |
| POST | `activities/locations/` | Bearer | Create location |
| GET | `activities/locations/nearby/` | Bearer | Locations near coordinates |

### Invitations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `activities/invitations/` | Bearer | List invitations |
| POST | `activities/invitations/` | Bearer | Send invitation |
| POST | `activities/invitations/<id>/respond/` | Bearer | Accept/decline invitation |

### WebSocket Endpoints

Connect via `ws://127.0.0.1:8000/api/ws/<path>/` with JWT token as query parameter.

| Path | Description |
|------|-------------|
| `ws/notifications/` | Real-time notification count updates |
| `ws/activity/<id>/` | Real-time participant status for an activity |
| `ws/zones/` | Broadcast when a game zone is deleted |

---

## Running Tests

```bash
# Backend (requires running Postgres with PostGIS)
cd backend
python manage.py test apps.users apps.activities
python manage.py test api.tests

# Frontend
cd frontend
npm run test          # single run
npm run test:watch    # watch mode
```

---

## Linting & Formatting

```bash
# Backend (Python)
cd backend
black .
isort .
flake8

# Frontend (JS/JSX)
cd frontend
npx eslint .
npx prettier --write .
```

---

## Troubleshooting

### `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`
Docker Desktop isn't running. Launch it and wait for the whale icon to stop animating.

### `psycopg2.OperationalError: connection to server at "localhost" ... Connection refused`
Postgres container isn't up. Run `docker ps`. If missing, check `docker compose logs postgres`.

### `OSError: couldn't load GDAL library`
GDAL/GEOS not installed, or paths in `backend/.env` don't match. See GDAL/GEOS installation above.

### Frontend shows blank page / won't start
Check `node -v` — must be 20+. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`.

### WebSocket connection fails in browser
Ensure backend is running on port 8000. Vite proxies `/api/ws/` automatically.

### `EMAIL_HOST_USER not set` or password reset emails not working
Set `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD` in `backend/.env`. For Gmail, use an [App Password](https://myaccount.google.com/apppasswords), not your regular password.

### CORS errors
Backend allows `https://localhost:5174` and `https://127.0.0.1:5174` by default. If you changed the frontend port, update `CORS_ALLOWED_ORIGINS` in `backend/config/settings.py`.
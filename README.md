# Scalaris

Мобільний застосунок для організації активностей "на районі" з друзями: живі
карта з геолокацією користувачів, збори/крос/ігрові зони/квести в реальному
часі, друзі, сповіщення, блокування користувачів, вхід через Discord OAuth2.

**Стек:**
- **Backend:** Django 6 + Django REST Framework + Django Channels (WebSocket, ASGI/Daphne) + GeoDjango
- **DB:** PostgreSQL 16 + PostGIS 3.4 (геопросторові запити — "хто поруч", зони, маршрути)
- **Realtime/cache:** Redis (channel layer для WebSocket-розсилок)
- **Auth:** JWT (access — в пам'яті фронта, refresh — httpOnly-cookie) + опційний Discord OAuth2
- **Frontend:** React 19 + Vite 8 + React Router 7 + Leaflet/React-Leaflet (карта) + Axios

> ⚠️ У Docker піднімаються тільки `postgres` і `redis` (і, опційно, `backend` —
> див. §7). Frontend під час розробки завжди запускається локально через
> `npm run dev`, backend під час розробки зручніше запускати локально через
> `manage.py runserver`, щоб мати hot-reload.

---

## Зміст

1. [Передумови](#1-передумови)
2. [Швидкий старт](#2-швидкий-старт)
3. [Змінні середовища](#3-змінні-середовища)
4. [GDAL / GEOS (обов'язково для GeoDjango)](#4-gdal--geos-обовязково-для-geodjango)
5. [HTTPS-сертифікат фронтенду](#5-https-сертифікат-фронтенду)
6. [Геолокація в браузері](#6-геолокація-в-браузері)
7. [Альтернатива: усе в Docker](#7-альтернатива-усе-в-docker)
8. [Створення адміна / доступ до Django Admin](#8-створення-адміна--доступ-до-django-admin)
9. [Автоматизовані тести](#9-автоматизовані-тести)
10. [Покрокове ручне тестування (QA-сценарій)](#10-покрокове-ручне-тестування-qa-сценарій)
11. [Продакшн-збірка фронтенду](#11-продакшн-збірка-фронтенду)
12. [Структура проєкту](#12-структура-проєкту)
13. [API — короткий довідник ендпоінтів](#13-api--короткий-довідник-ендпоінтів)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Передумови

Встановити **до** початку роботи:

| Інструмент | Версія | Навіщо |
|---|---|---|
| Git | будь-яка | клонування репо |
| Docker Desktop | будь-яка, **має бути запущений** | postgres (PostGIS) + redis |
| Python | **3.12** | інші версії можуть конфліктувати з запінченими залежностями (Django 6, cryptography 49 тощо) |
| GDAL + GEOS | будь-які свіжі | системні бібліотеки для GeoDjango, без них `migrate`/`runserver` впадуть — див. §4 |
| Node.js | **20+** | фронтенд (Vite 8, vitest 4 вимагають сучасний Node) |
| npm | йде разом з Node | — |

Перевірити версії:
```bash
python --version     # 3.12.x
node -v               # v20.x або новіше
docker --version
docker compose version
```

---

## 2. Швидкий старт

```bash
git clone <repo-url> scalaris
cd scalaris
```

### 2.1 Інфраструктура (Postgres + Redis)

```bash
# Спочатку запустити застосунок Docker Desktop (окремо), потім:
docker compose up -d postgres redis
docker ps            # має показати scalaris-postgres і scalaris-redis у статусі "Up"
```

Postgres читає креденшли з **кореневого `.env`** (той, що поряд з
`docker-compose.yml`) через змінні `${DB_NAME}`, `${DB_USER}`, `${DB_PASSWORD}`.
Якщо `.env` в корені відсутній — скопіюйте значення з таблиці в §3 і покладіть
у `scalaris/.env`.

### 2.2 Backend (Django)

```bash
cd backend
python -m venv venv

# активація віртуального середовища:
venv\Scripts\activate        # Windows (cmd/PowerShell)
source venv/bin/activate     # macOS / Linux

pip install -r requirements.txt

# створити backend/.env — див. §3 для повного переліку змінних
copy .env.example .env        # Windows
cp .env.example .env           # macOS / Linux
# ⚠️ обов'язково відредагувати .env — без EMAIL_HOST_USER / EMAIL_HOST_PASSWORD
#    Django впаде ще на старті (див. §3 і §14)

python manage.py migrate
python manage.py createsuperuser   # опційно, для доступу до /admin/ — див. §8

python manage.py runserver 0.0.0.0:8000
```

Бекенд запуститься на `http://127.0.0.1:8000`. Лишайте цей термінал відкритим.

> Тут навмисно використано `manage.py runserver`, а не `daphne`: для
> локальної розробки з hot-reload цього достатньо, оскільки Channels сам
> дає WSGI/ASGI роутинг через `runserver`, коли встановлено пакет `daphne`
> (він є в `INSTALLED_APPS`). Для продакшн-подібного запуску через ASGI
> напряму — `daphne -b 0.0.0.0 -p 8000 config.asgi:application` (саме так
> робить `entrypoint.sh` у Docker-образі, див. §7).

### 2.3 Frontend (React + Vite)

У новому терміналі:

```bash
cd frontend
npm install

# frontend/.env вже існує в репозиторії, перевірте / створіть за потреби:
echo VITE_DISCORD_CLIENT_ID=your_discord_client_id > .env   # опційно, див. §3

npm run dev
```

Vite підніме дев-сервер на **`https://localhost:5174`** (саме `https`, не
`http` — див. §5). Відкрийте цей URL у браузері.

### 2.4 Перевірка, що все живе

- `https://localhost:5174` → відкривається Welcome-екран Scalaris (не білий екран, не помилка сертифіката, що блокує сторінку).
- DevTools → Network: запити на `/api/...` повертають відповіді (не `ERR_CONNECTION_REFUSED`).
- DevTools → Console: не повинно бути червоних помилок на кшталт `WebSocket connection ... failed` одразу після логіну (до логіну вони нормальні — токена ще нема).

---

## 3. Змінні середовища

У проєкті **два різні `.env`**, у різних місцях, з різним призначенням.

### 3.1 `scalaris/.env` (корінь репо) — тільки для `docker-compose`

Використовується виключно для підстановки `${...}` у `docker-compose.yml`
(креденшли Postgres, порти). Приклад:

```env
DB_NAME=scalaris_db
DB_USER=scalaris_user
DB_PASSWORD=scalaris_pass
DB_HOST=localhost
DB_PORT=5432
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### 3.2 `backend/.env` — реальні налаштування Django

Копіюється з `backend/.env.example`. Повний перелік:

| Змінна | Обов'язкова? | За замовчуванням | Опис |
|---|---|---|---|
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | так (мають збігатись з докер-контейнером postgres) | `scalaris_db` / `scalaris_user` / `scalaris_pass` | доступ до БД |
| `DB_HOST` | так | `localhost` | Postgres слухає на хості, куди docker-compose проброcив порт |
| `DB_PORT` | ні | `5432` | |
| `REDIS_HOST`, `REDIS_PORT` | ні | `127.0.0.1` / `6379` | channel layer для WebSocket |
| `EMAIL_HOST_USER` | **так, без дефолту** | — | Gmail SMTP-адреса для листів password-reset. **Django впаде при старті, якщо це не задано** — навіть фейкове значення на кшталт `dummy@example.com` підійде, якщо reset-пошту реально не тестуєте |
| `EMAIL_HOST_PASSWORD` | **так, без дефолту** | — | [Gmail App Password](https://myaccount.google.com/apppasswords) (не звичайний пароль акаунту) |
| `DEFAULT_FROM_EMAIL` | ні | = `EMAIL_HOST_USER` | адреса відправника |
| `FRONTEND_URL` | ні | `https://localhost:5174` | використовується у посиланні reset-листа та у allow-list Discord redirect |
| `GDAL_LIBRARY_PATH`, `GEOS_LIBRARY_PATH` | ні (є дефолти під Windows/macOS) | див. §4 | шлях до системних бібліотек GeoDjango |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | ні (порожні = кнопка Discord просто не спрацює) | `''` | OAuth2, див. §3.3 |
| `AUTH_COOKIE_SECURE` | ні | `False` | у продакшн over HTTPS виставити `True` |
| `SECRET_KEY` | ні (є дефолтний dev-ключ) | вбудований у `settings.py` | у продакшн обов'язково перевизначити |
| `DEBUG` | ні | `True` | |
| `ALLOWED_HOSTS` | ні | `localhost,127.0.0.1` | |

**Мінімальний робочий `backend/.env` для локальної розробки:**
```env
DB_NAME=scalaris_db
DB_USER=scalaris_user
DB_PASSWORD=scalaris_pass
DB_HOST=localhost
DB_PORT=5432

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

EMAIL_HOST_USER=dummy@example.com
EMAIL_HOST_PASSWORD=dummy

FRONTEND_URL=https://localhost:5174

# GDAL_LIBRARY_PATH / GEOS_LIBRARY_PATH — розкоментуйте, якщо шлях
# відрізняється від дефолтного (OSGeo4W на Windows / Homebrew на macOS)

AUTH_COOKIE_SECURE=False
```
(Discord-змінні можна лишити порожніми — реєстрація/логін по email це не блокує.)

### 3.3 `frontend/.env`

| Змінна | Обов'язкова? | Опис |
|---|---|---|
| `VITE_DISCORD_CLIENT_ID` | ні | Client ID Discord-застосунку для кнопки "Увійти через Discord". Без неї кнопка просто не буде функціональною — решта застосунку працює нормально |

Якщо тестуєте Discord-логін: створіть застосунок на
[discord.com/developers/applications](https://discord.com/developers/applications),
додайте redirect URI `https://localhost:5174/oauth/discord/callback` і
пропишіть `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` в `backend/.env` та
`VITE_DISCORD_CLIENT_ID` в `frontend/.env`.

---

## 4. GDAL / GEOS (обов'язково для GeoDjango)

Це **системні бібліотеки**, не pip-пакети. `pip install -r requirements.txt`
завжди пройде успішно навіть без них — впаде саме `migrate`/`runserver`.

- **Windows:** встановити [OSGeo4W](https://trac.osgeo.org/osgeo4w/) (express-інсталяція). Дефолтні шляхи вже прописані в `settings.py` (`C:\OSGeo4W\bin\gdal313.dll`). Якщо шлях інший — розкоментувати в `.env`:
  ```env
  GDAL_LIBRARY_PATH=C:\OSGeo4W\bin\gdal313.dll
  GEOS_LIBRARY_PATH=C:\OSGeo4W\bin\geos_c.dll
  ```
- **macOS:**
  ```bash
  brew install gdal geos
  ```
  За потреби в `.env`:
  ```env
  GDAL_LIBRARY_PATH=/opt/homebrew/opt/gdal/lib/libgdal.dylib
  GEOS_LIBRARY_PATH=/opt/homebrew/opt/geos/lib/libgeos_c.dylib
  ```
- **Linux (Debian/Ubuntu):**
  ```bash
  sudo apt install gdal-bin libgdal-dev libgeos-dev
  ```
  Шляхи зазвичай визначаються автоматично (`ctypes.util.find_library`), окремо в `.env` вказувати не потрібно.

---

## 5. HTTPS-сертифікат фронтенду

Vite піднімається на `https://` через плагін `@vitejs/plugin-basic-ssl`, який
генерує **самопідписаний** сертифікат "на льоту". Це зроблено навмисно —
Discord OAuth і Geolocation API в сучасних браузерах вимагають secure-контекст.

Тому при першому відкритті `https://localhost:5174` браузер покаже
попередження на кшталт "Ваше з'єднання не приватне" / `NET::ERR_CERT_AUTHORITY_INVALID`.
Це очікувано для локальної розробки:

1. Натиснути "Додатково" / "Advanced".
2. "Перейти на localhost (небезпечно)" / "Proceed to localhost (unsafe)".

Якщо цього не зробити — фронт не зможе достукатись сам до себе, і Vite-проксі
на `/api` та `/media` теж не спрацює коректно в деяких браузерах.

(У `frontend/certs/` лежить готова пара `.pem`-файлів для конкретної
локальної IP — вона не підключена у `vite.config.js` і є артефактом
попереднього налаштування через `mkcert`; можна ігнорувати, якщо не
відлагоджуєте HTTPS на реальному пристрої в локальній мережі.)

---

## 6. Геолокація в браузері

Головний екран (`/home`) одразу після логіну запитує геопозицію через
Geolocation API — без неї карта не відрендериться (побачите спінер
"Визначаємо твою геопозицію…").

- Дозволити доступ до розташування у спливаючому запиті браузера.
- Якщо випадково заблокували — іконка замка в адресному рядку → Дозволи сайту → Розташування → Дозволити → перезавантажити сторінку.
- Для тестування "як на реальному пристрої в іншій точці карти": DevTools →
  `⋮` → More tools → **Sensors** → Location → вибрати пресет або вписати
  довільні lat/lng.
- Мобільна емуляція (як на скріншотах у цьому репо) — DevTools → Toggle
  device toolbar (`Ctrl+Shift+M`) → обрати, наприклад, iPhone 12 Pro.

---

## 7. Альтернатива: усе в Docker

У `docker-compose.yml` є й опційний сервіс `backend`, що збирається з
`backend/Dockerfile` і запускає `daphne` (ASGI) замість `runserver`. Ним
зручно користуватись, якщо не хочете ставити Python/GDAL локально:

```bash
# перед цим створіть backend/.env (див. §3.2) — docker-compose підхоплює
# його через env_file
docker compose up -d --build
docker compose logs -f backend   # стежити за міграціями/стартом
```

Мінуси цього шляху: немає автоперезавантаження при зміні коду (образ
збирається один раз через `--build`), тому для активної розробки backend
зручніше все ж таки §2.2 (`runserver` локально). Frontend у Docker не
запускається взагалі — завжди `npm run dev` локально.

---

## 8. Створення адміна / доступ до Django Admin

```bash
cd backend
venv\Scripts\activate  # або source venv/bin/activate
python manage.py createsuperuser
```

Вкажіть username, email, пароль. Далі `http://127.0.0.1:8000/admin/` —
можна руками редагувати користувачів, активності, локації, дружби — корисно,
щоб швидко підготувати дані для ручного тестування (наприклад, зробити двох
користувачів друзями без проходження всього флоу заявок).

---

## 9. Автоматизовані тести

### Backend (Django)

```bash
cd backend
venv\Scripts\activate   # або source venv/bin/activate

# Усі "звичайні" застосунки (users + activities):
python manage.py test apps.users apps.activities

# WebSocket-тести (api/) — окремо, бо api/ не зареєстрований у INSTALLED_APPS
# і не підхоплюється автоматичним discovery без явного шляху:
python manage.py test api.tests

# Один конкретний файл/клас/тест (приклади):
python manage.py test apps.activities.tests.test_views_activity
python manage.py test apps.users.tests.test_views_friends.FriendRequestTests.test_send_friend_request
```

Тести використовують окрему тестову БД (Django створює й видаляє її
автоматично при кожному запуску) та `InMemoryChannelLayer` для WebSocket-
тестів — реальний Redis для тестів не потрібен, достатньо, щоб Postgres
з `docker compose up -d` був живий.

### Frontend (Vitest)

```bash
cd frontend
npm run test          # один прогін усіх тестів (vitest run)
npm run test:watch    # watch-режим під час розробки
```

Тестові файли: `src/**/*.test.{js,jsx}` (API-клієнт, AuthContext, хуки
сокетів/нотифікацій, форма ігрової зони, навбар, Discord callback).

### Лінтинг

```bash
cd frontend
npm run lint
```

---

## 10. Покрокове ручне тестування (QA-сценарій)

Передбачається, що backend (`runserver 0.0.0.0:8000`), frontend
(`npm run dev`), `postgres` і `redis` вже запущені (§2), і сертифікат
прийнято в браузері (§5).

### Крок 1 — Реєстрація двох акаунтів
1. Відкрити `https://localhost:5174` → Welcome-екран → "Зареєструватись".
2. Зареєструвати користувача **А** (username, email, password, підтвердження пароля).
3. Вийти (Навбар → "Вийти") або відкрити другу вкладку в режимі інкогніто.
4. Зареєструвати користувача **Б** з іншим email/username.
5. **Очікується:** після реєстрації — одразу редірект на `/home` (без окремого підтвердження email — його тут немає).

### Крок 2 — Вхід
1. Вийти з акаунту Б, спробувати увійти під А через `/login`.
2. **Очікується:** можна логінитись і через email, і через username в одне й те саме поле "логін".
3. Спробувати навмисно неправильний пароль ×3 підряд.
4. **Очікується:** після ~10 спроб за хвилину — троттлінг (429), див. `DEFAULT_THROTTLE_RATES['login']`.

### Крок 3 — Карта і геолокація
1. Залогінитись під А, дозволити геолокацію (§6).
2. **Очікується:** карта Leaflet центрується на позиції користувача, є маркер "A".
3. Натиснути кнопку "recenter" (прицільна іконка) — карта повертається до позиції користувача.

### Крок 4 — Бургер-меню (адаптивність)
1. У звичайному (десктопному) вікні — бургер має бути в правому верхньому куті `/home`, `/profile`, `/notifications`, `/blocked-users`.
2. Відкрити DevTools → мобільна емуляція (`Ctrl+Shift+M`, будь-який мобільний пресет).
3. Перевірити **на всіх чотирьох сторінках** (`/home`, `/profile`, `/notifications`, `/blocked-users`), що бургер лежить у правому верхньому куті, а не зліва.
4. Відкрити меню — перевірити пункти "Головна", "Профіль", "Сповіщення", "Заблоковані користувачі", "Вийти", а також бейдж-лічильник непрочитаних сповіщень (якщо є).

### Крок 5 — Друзі
1. Профіль А → знайти Б (наприклад, через список користувачів/пошук поруч на карті, якщо Б теж дав геолокацію в іншій вкладці) → "Додати в друзі".
2. Під Б: `/notifications` → побачити вхідну заявку → "Прийняти".
3. **Очікується:** у обох з'являється одне одного в списку друзів; сповіщення про прийняття надходить А через WebSocket без перезавантаження сторінки.
4. Перевірити фільтр "Тільки друзі" на карті (кнопка з іконкою людей у TopBar) — на карті лишаються тільки друзі; активувати і одразу перевірити, що напис-бейдж "Лише друзі" **накладається зверху** над нижньою панеллю "Люди поруч", а не ховається під нею (особливо в мобільній емуляції).

### Крок 6 — Активності
Під А, натиснути одну з пілюль зверху карти і перевірити кожен тип:

| Тип | Пілюля | Що перевірити |
|---|---|---|
| Збір | "Збір" | форма створення (назва, час, учасники з друзів) → після створення з'являється маркер на карті й нижня панель з таймером |
| Крос | "Крос" | форма з тривалістю → зворотний відлік у нижній панелі |
| Ігрова зона | "Ігрова зона" | вибір радіусу/центру на карті → зона видима як коло |
| Квест | "Квест" | форма чекпоінтів → прогрес чекпоінтів у нижній панелі |

Під Б (запрошений учасник): перевірити, що запрошення на активність
приходить через WebSocket-нотифікацію в реальному часі, можна прийняти/
відхилити, і активність з'являється/зникає з карти відповідно.

Перевірити на десктопі, що **пілюлі активностей не дублюються візуально**
(рядок "Збір / Крос / Ігрова зона / Квест" — рівно один раз, без повтору).

### Крок 7 — Видимість на карті / приховати не-учасників
1. Кнопка "ока" в TopBar → приховати себе з карти → в іншій вкладці (Б) переконатись, що А зник з "людей поруч".
2. Під час активного збору — перемкнути "показати всіх / тільки учасників".

### Крок 8 — Блокування і скарги
1. Профіль Б → "..." / кнопка блокування → заблокувати А (з іншого акаунту, або навпаки).
2. `/blocked-users` → переконатись, що заблокований користувач у списку, є кнопка розблокувати.
3. Перевірити, що заблокований користувач більше не з'являється на карті/у списку поруч.

### Крок 9 — Скидання пароля
1. `/login` → "Забули пароль?" → ввести email.
2. Якщо `EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD` в `.env` — реальні Gmail-креденшли, лист прийде на пошту з посиланням на `FRONTEND_URL/password-reset?...`.
3. Якщо в `.env` дефолтні "заглушки" — SMTP видасть помилку при спробі відправки; для чистого ручного тесту UI без реальної пошти цей крок можна пропустити (форма й валідація email все одно перевіряються).

### Крок 10 — Discord OAuth (опційно)
Тільки якщо налаштовані `DISCORD_CLIENT_ID`/`SECRET` (§3.3): кнопка "Увійти
через Discord" на `/login` та "Прив'язати Discord" в профілі — обидва флоу
ведуть на `/oauth/discord/callback`, який сам розрізняє вхід/прив'язку.

### Крок 11 — Вихід
Навбар → "Вийти" → підтвердити в модалці → редірект на Welcome-екран,
повторний прямий перехід на `/home` без логіну повинен редіректити назад.

---

## 11. Продакшн-збірка фронтенду

```bash
cd frontend
npm run build      # статичні файли в frontend/dist/
npm run preview    # локальний прев'ю зібраної версії
```

Для продакшн-бекенду: `DEBUG=False`, реальний `SECRET_KEY`, `ALLOWED_HOSTS`,
`AUTH_COOKIE_SECURE=True`, `python manage.py collectstatic`, і запуск через
`daphne`/gunicorn+uvicorn-воркер замість `runserver` — приклад команди вже є
в `backend/entrypoint.sh`.

---

## 12. Структура проєкту

```
scalaris/
├── docker-compose.yml       # postgres (PostGIS) + redis (+ опційно backend)
├── .env                     # креденшли тільки для docker-compose
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example / .env  # реальні налаштування Django
│   ├── Dockerfile, entrypoint.sh
│   ├── db.sqlite3           # НЕ використовується (легасі-артефакт, реальна БД — Postgres)
│   ├── config/               # settings.py, urls.py, asgi.py, wsgi.py
│   ├── api/                  # WebSocket: consumers.py, routing.py (не Django-app)
│   └── apps/
│       ├── users/            # auth, друзі, блокування, сповіщення, Discord OAuth
│       └── activities/       # активності, локації, запрошення, зони
└── frontend/
    ├── package.json
    ├── vite.config.js         # HTTPS + проксі /api, /media на localhost:8000
    ├── vitest.config.js
    ├── .env                   # VITE_DISCORD_CLIENT_ID
    ├── certs/                 # невикористовувані ручні .pem (див. §5)
    └── src/
        ├── pages/             # Welcome, Auth, Home, Profile, Notifications, BlockedUsers, OAuth
        ├── components/        # NavBar, TopBar, Map/*, BottomSheet, форми активностей тощо
        ├── hooks/             # useActivitySocket, useZoneSocket, useNotifications...
        ├── api/                # axios-інстанс + модулі users/friends/notifications
        └── context/            # AuthContext
```

---

## 13. API — короткий довідник ендпоінтів

Базовий префікс — `/api/`. Автентифікація — JWT `Authorization: Bearer <access>`,
refresh-токен зберігається у httpOnly-cookie й оновлюється через
`/api/users/login/refresh/`.

| Метод | Шлях | Призначення |
|---|---|---|
| POST | `/api/users/register/` | реєстрація |
| POST | `/api/users/login/` | логін (email або username) |
| POST | `/api/users/login/refresh/` | оновити access-токен |
| POST | `/api/users/logout/` | вихід |
| GET/PATCH | `/api/users/me/` | свій профіль |
| GET | `/api/users/<id>/` | чужий профіль |
| POST | `/api/users/<id>/block/` | заблокувати |
| GET | `/api/users/blocked/` | список заблокованих |
| POST | `/api/users/<id>/report/` | поскаржитись |
| POST | `/api/users/<id>/friend-request/` | надіслати заявку в друзі |
| POST | `/api/users/friend-requests/<id>/accept\|reject/` | прийняти/відхилити заявку |
| GET | `/api/users/me/friends/` | список друзів |
| GET | `/api/users/me/notifications/` | сповіщення |
| GET | `/api/users/me/notifications/count/` | лічильник непрочитаних |
| GET/POST | `/api/users/auth/discord/`, `/api/users/oauth/discord/link\|unlink/` | Discord OAuth2 |
| POST | `/api/users/password-reset/`, `/api/users/password-reset-confirm/` | скидання пароля |
| GET/POST | `/api/activities/` | список / створення активностей |
| GET/POST | `/api/activities/locations/`, `/api/activities/locations/nearby/` | локації, "хто поруч" |
| GET/POST | `/api/activities/invitations/` | запрошення на активність |
| GET | `/api/activities/online-count/` | кількість онлайн |
| WS | `wss://.../api/ws/notifications/` | live-сповіщення |
| WS | `wss://.../api/ws/activity/<id>/` | live-оновлення активності |
| WS | `wss://.../api/ws/zones/` | live-оновлення ігрових зон |

Повний список — `backend/apps/users/urls.py`, `backend/apps/activities/urls.py`,
`backend/api/routing.py`.

---

## 14. Troubleshooting

**`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`**
Docker Desktop не запущений. Запустити з меню Пуск і почекати, поки іконка
кита в треї перестане анімуватись, тоді повторити `docker compose up -d`.

**`psycopg2.OperationalError: connection to server at "localhost" ... Connection refused`**
Контейнер Postgres не піднявся. `docker ps` — перевірити, що
`scalaris-postgres` у статусі `Up`. Якщо відсутній/рестартиться —
`docker compose logs postgres`.

**`decouple.UndefinedValueError: EMAIL_HOST_USER not found...` (Django падає одразу на старті)**
`EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD` не задані в `backend/.env` — на
відміну від інших змінних, у них немає дефолту в `settings.py`. Додати хоча
б заглушкові значення (§3.2), навіть якщо реально листи не тестуєте.

**`OSError` / `couldn't load GDAL library` при старті бекенду**
GDAL/GEOS не встановлені, або шлях у `.env` не збігається з реальним місцем
інсталяції. Див. §4.

**Фронтенд не стартує / дивні npm-помилки**
`node -v` — має бути 20 або новіше. Спробувати видалити
`node_modules` + `package-lock.json` і `npm install` заново.

**Браузер блокує сторінку через сертифікат / Geolocation не питає дозволу**
Сертифікат не прийнятий — див. §5 (треба саме `https://`, а не `http://`).
Geolocation API в браузерах не працює на небезпечному `http://`, крім `localhost`.

**`WebSocket connection to 'wss://.../api/ws/...' failed: WebSocket is closed before the connection is established`**
Найчастіше — Redis не запущений (`docker ps`, `scalaris-redis` має бути
`Up`), або спроба підключення сталась до отримання access-токена (перше
підключення при завантаженні сторінки до логіну — нормально, консоль
покаже цю помилку один раз і це очікувано).

**Реєстрація/логін працюють, але карта весь час у стані "Визначаємо
геопозицію…"**
Дозвіл на геолокацію заблокований у браузері — див. §6.

**`ModuleNotFoundError: No module named 'celery'` при запуску конкретного тесту**
Стосується лише `apps/activities/tasks.py` (фонове автоскасування "завислих"
pending-активностей старших за 2 години) — celery не входить у
`requirements.txt` і жодного celery worker/beat у проєкті не налаштовано,
тому ця задача зараз ніде не запускається автоматично. Відповідний тест
(`test_tasks.py`) написаний так, щоб не падати без celery (fallback на
`MagicMock`). Якщо хочете реально гонювати цю задачу — треба окремо
`pip install celery` і налаштувати broker/worker, це поза межами поточного
дефолтного сетапу.

**Кнопка "Увійти через Discord" не працює / веде в нікуди**
`DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`VITE_DISCORD_CLIENT_ID` не
задані — це очікувано, якщо Discord-логін не потрібен для тестування;
решта застосунку (email/пароль) від цього не залежить.

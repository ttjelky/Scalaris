#!/bin/sh
set -e

# Belt-and-braces readiness check in addition to compose's healthcheck-based
# depends_on — makes the image safe to run outside compose too.
until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-scalaris_user}" > /dev/null 2>&1; do
  echo "Waiting for Postgres at ${DB_HOST:-postgres}:${DB_PORT:-5432}..."
  sleep 1
done

python manage.py migrate --noinput

exec daphne -b 0.0.0.0 -p 8000 config.asgi:application

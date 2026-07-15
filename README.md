# Scalaris

git clone <repo>
docker compose up -d
cd backend
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
daphne config.asgi:application
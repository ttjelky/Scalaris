"""
Django settings for config project.
"""

from datetime import timedelta
from pathlib import Path
import re
from decouple import config
import sys
import platform
import os

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-sc^@2dwo&cgv4!#9eu&47_g+40()1u821n6ilwm^2e@38@e%7z'

DEBUG = True

ALLOWED_HOSTS = ['*']


# Application definition

INSTALLED_APPS = [
    'daphne',
    'channels',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'apps.users',
    'apps.activities',
    'django.contrib.gis',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

AUTH_USER_MODEL = 'users.User'

ASGI_APPLICATION = 'config.asgi.application'
WSGI_APPLICATION = 'config.wsgi.application'

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

STATIC_ROOT = BASE_DIR / 'staticfiles'

# --- CORS ---
CORS_ALLOWED_ORIGINS = [
    'https://localhost:5174',
    'https://127.0.0.1:5174',
]
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^https://localhost:\d+$',
    r'^https://127\.0\.0\.1:\d+$',
    r'^https://192\.168\.\d{1,3}\.\d{1,3}:\d+$',
]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [
    'https://localhost:5174',
    'https://127.0.0.1:5174',
]
# --- Media (avatar) ---
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# --- DRF: пагінація ---
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'login': '10/min',           # захист від brute-force підбору пароля
        'register': '5/hour',        # захист від масової реєстрації ботами
        'password_reset': '5/hour',  # захист від спаму reset-листами на чужу пошту
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# --- JWT ---
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_COOKIE': 'refresh_token',
    'AUTH_COOKIE_PATH': '/',
    'AUTH_COOKIE_SECURE': config('AUTH_COOKIE_SECURE', default='False').lower() == 'true',
    'AUTH_COOKIE_SAMESITE': 'Lax',
}

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('127.0.0.1', 6379)],
        },
    },
}

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': config('DB_NAME', default='scalaris_db'),
        'USER': config('DB_USER', default='scalaris_user'),
        'PASSWORD': config('DB_PASSWORD', default='scalaris_pass'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
    }
}


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = config('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default=EMAIL_HOST_USER)

FRONTEND_URL = config('FRONTEND_URL', default='https://localhost:5174')

DISCORD_CLIENT_ID = config('DISCORD_CLIENT_ID', default='')
DISCORD_CLIENT_SECRET = config('DISCORD_CLIENT_SECRET', default='')
DISCORD_REDIRECT_URI = config('DISCORD_REDIRECT_URI', default='')

STATIC_URL = 'static/'

if platform.system() == 'Windows':
    GDAL_LIBRARY_PATH = config('GDAL_LIBRARY_PATH', default=r'C:\OSGeo4W\bin\gdal313.dll')
    GEOS_LIBRARY_PATH = config('GEOS_LIBRARY_PATH', default=r'C:\OSGeo4W\bin\geos_c.dll')
else:
    GDAL_LIBRARY_PATH = config('GDAL_LIBRARY_PATH', default='/opt/homebrew/opt/gdal/lib/libgdal.dylib')
    GEOS_LIBRARY_PATH = config('GEOS_LIBRARY_PATH', default='/opt/homebrew/opt/geos/lib/libgeos_c.dylib')
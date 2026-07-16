import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let accessToken = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

let onAuthFailureCallback = null;

export function onAuthFailure(callback) {
  onAuthFailureCallback = callback;
}

// Endpoints that must be reachable without an (possibly stale/invalid)
// access token attached. Sending a bad Bearer token here makes DRF's
// authentication layer reject the request with 401 before it ever reaches
// the view logic, even if permission_classes = [AllowAny] is set there.
const PUBLIC_AUTH_PATHS = [
  '/users/login',
  '/users/register',
  '/users/login/refresh',
  '/users/password-reset',
];

function isPublicAuthCall(url) {
  if (!url) return false;
  return PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
}

api.interceptors.request.use((config) => {
  if (accessToken && !isPublicAuthCall(config.url)) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    // Separate axios instance for refresh without interceptors to avoid
    // infinite refresh loops while ensuring baseURL and credentials work.
    const refreshAxios = axios.create({
      baseURL: '/api',
      withCredentials: true,
    });

    refreshPromise = refreshAxios
      .post('/users/login/refresh/', {})
      .then(({ data }) => {
        setAccessToken(data.access);
        return data.access;
      })
      .catch((error) => {
        clearAccessToken();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isRefreshCall = config?.url?.includes('/login/refresh/');

    if (response?.status === 401 && !config._retry && !isRefreshCall && !isPublicAuthCall(config?.url)) {
      config._retry = true;
      try {
        const newAccess = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${newAccess}`;
        return api(config);
      } catch {
        clearAccessToken();
        onAuthFailureCallback?.();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
